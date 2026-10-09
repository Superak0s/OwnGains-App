import { useCallback, useMemo, useRef, useState } from "react";
import { workoutApi as defaultWorkoutApi } from "@features/workout/services/index";
import type { WorkoutApi } from "@features/workout/services/workoutApiFactory";
import {
  isLocalSessionId,
  isSessionGone,
} from "@utils/session";
import { generateId } from "@utils/format";
import { metric, log, captureException } from "@shared/services/crashReporting";
import { ApiError } from "@shared/services/apiError";
import { IDEMPOTENCY_KEY_IN_FLIGHT } from "@shared/services/apiClient";
import type { PendingSync } from "../../types";
import {
  pendingSyncStore,
  toPendingSyncRow,
} from "@shared/services/pendingSyncStore";

interface UseSyncManagerOptions {
  pendingSyncs: PendingSync[];
  setPendingSyncs: (syncs: PendingSync[]) => void;
  /** Set by the caller for UI. Re-entrancy is guarded internally by a ref. */
  isSyncing: boolean;
  setIsSyncing: (syncing: boolean) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string) => void;
  userId: string | null;
  saveToStorage: (
    key: string,
    value: unknown,
    userId: string | null,
  ) => Promise<boolean>;
  STORAGE_KEYS: { PENDING_SYNCS: string; CURRENT_SESSION_ID: string };
  useManualTime: boolean;
  fetchAnalytics?: (() => Promise<void>) | null;
  workoutApi?: WorkoutApi;
}

export interface DroppedSync {
  type: string;
  reason: string;
  at: string;
}

interface UseSyncManagerReturn {
  addPendingSync: (syncData: PendingSync) => Promise<void>;
  removePendingSyncs: (
    match: (sync: PendingSync) => boolean,
  ) => Promise<number>;
  /** `reconnected` skips the backoff of ops that only failed to reach the server. */
  syncPendingData: (opts?: { reconnected?: boolean }) => Promise<void>;
  cleanupInvalidSyncs: () => Promise<void>;
  droppedSyncs: DroppedSync[];
  droppedSyncCount: number;
  acknowledgeDroppedSyncs: () => void;
}

// Every failure backs off exponentially, but only a server that answered and
// refused the op counts toward giving up. No signal, a timeout, a 5xx or a
// rate limit says nothing about the op itself, and dropping on those would
// discard a workout logged in a gym without reception.
const MAX_SYNC_RETRIES = 8;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 30 * 60_000;
// Idempotency keys make re-sending a few ops after a mid-replay kill harmless,
// so the queue is persisted in batches rather than re-serialized after each op.
// A long backlog widens the batch so a replay costs a bounded number of
// full-queue writes instead of one per ten ops.
const PERSIST_EVERY = 10;
const MAX_REPLAY_CHECKPOINTS = 10;
const TRANSIENT_HTTP_STATUSES = new Set([401, 408, 429]);

const isDefinitiveRejection = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  !TRANSIENT_HTTP_STATUSES.has(error.status) &&
  error.code !== IDEMPOTENCY_KEY_IN_FLIGHT;

const retryKeyOf = (sync: PendingSync): string =>
  sync.syncId ?? `${sync.timestamp}:${sync.type}`;

export const useSyncManager = ({
  pendingSyncs,
  setPendingSyncs,
  setIsSyncing,
  currentSessionId,
  setCurrentSessionId,
  userId,
  saveToStorage,
  STORAGE_KEYS,
  useManualTime,
  fetchAnalytics,
  workoutApi = defaultWorkoutApi,
}: UseSyncManagerOptions): UseSyncManagerReturn => {
  const retryStateRef = useRef(
    new Map<
      string,
      { count: number; rejections: number; nextAttemptAt: number }
    >(),
  );
  // `pendingSyncs` only updates on the next render, so two enqueues in the same
  // tick (or one during a sync run) would both build on the pre-render array
  // and the later write would silently drop the earlier entries. The ref is the
  // authoritative queue. The prop is re-adopted whenever it changes from
  // outside this hook (user switch, loadSavedData, resetAllState).
  const queueRef = useRef<PendingSync[]>(pendingSyncs);
  const ownWritesRef = useRef(new WeakSet<object>());
  if (!ownWritesRef.current.has(pendingSyncs)) queueRef.current = pendingSyncs;

  const syncingRef = useRef(false);
  // A reconnect that lands mid-run would otherwise be lost, leaving the ops
  // that run backed off waiting out their full backoff.
  const reconnectedDuringRunRef = useRef(false);
  const syncPendingDataRef = useRef<UseSyncManagerReturn["syncPendingData"]>(
    async () => {},
  );
  // A replay run works on a clone of the queue, so a removal during one would
  // be written straight back by the run's own persist. The run consults this.
  const removedIdsRef = useRef(new Set<string>());
  // Kept after a replay run: ops enqueued after the run that created the real id
  // still need it (see addPendingSync).
  const localToServerIdRef = useRef(new Map<string, string>());
  const mappedUserRef = useRef(userId);
  if (mappedUserRef.current !== userId) {
    mappedUserRef.current = userId;
    localToServerIdRef.current.clear();
  }
  // Cumulative count of syncs permanently discarded (invalid data, dead
  // session, rejections exhausted, or orphaned by cleanup), shown to the user via
  // WorkoutSyncStatus rather than only kept in the logs.
  const [droppedSyncs, setDroppedSyncs] = useState<DroppedSync[]>([]);

  // What the store contains, by syncId, so a write touches only the rows that
  // changed. Null whenever that is unknown (adopted queue, failed write), which
  // forces the next write to replace the whole collection.
  const persistedRef = useRef<Map<string, string> | null>(null);
  const persistedUserRef = useRef(userId);
  if (persistedUserRef.current !== userId) {
    persistedUserRef.current = userId;
    persistedRef.current = null;
  }
  const adoptedQueueRef = useRef(queueRef.current);
  if (adoptedQueueRef.current !== queueRef.current && !ownWritesRef.current.has(queueRef.current)) {
    adoptedQueueRef.current = queueRef.current;
    persistedRef.current = null;
  }

  const writeQueue = useCallback(
    async (queue: PendingSync[]): Promise<void> => {
      const next = queue.map((sync) =>
        sync.syncId ? sync : { ...sync, syncId: generateId("sync") },
      );
      queueRef.current = next;
      ownWritesRef.current.add(next);
      metric.gauge("sync.queue.depth", next.length);
      setPendingSyncs(next);

      const rows = next.map((sync) =>
        toPendingSyncRow(sync as PendingSync & { syncId: string }),
      );
      const known = persistedRef.current;
      persistedRef.current = null;
      try {
        if (known) {
          const liveIds = new Set(rows.map((r) => r.id));
          await pendingSyncStore.apply(
            userId,
            rows.filter((r) => known.get(r.id) !== r.value),
            [...known.keys()].filter((id) => !liveIds.has(id)),
          );
        } else {
          await pendingSyncStore.replace(userId, rows);
        }
        persistedRef.current = new Map(rows.map((r) => [r.id, r.value]));
      } catch (error) {
        // Without this the queue would live only in memory and be lost on
        // the next app kill.
        log.error("sync.queue.persist_failed", { depth: next.length });
        captureException(error, { stage: "writeQueue", depth: next.length });
      }
    },
    [setPendingSyncs, userId],
  );

  const addPendingSync = useCallback(
    async (syncData: PendingSync): Promise<void> => {
      try {
        const withId = syncData.syncId
          ? syncData
          : { ...syncData, syncId: generateId("sync") };
        // A set logged after its session's startSession already replayed would
        // otherwise carry a `local_` id no later run can resolve, and get
        // dropped by cleanupInvalidSyncs.
        if (withId.type !== "startSession") {
          const mapped = localToServerIdRef.current.get(
            String(withId.data.sessionId),
          );
          if (mapped) withId.data = { ...withId.data, sessionId: mapped };
        }
        await writeQueue([...queueRef.current, withId]);
      } catch (error) {
        console.error("Error adding pending sync:", error);
        captureException(error, {
          stage: "addPendingSync",
          type: syncData.type,
        });
      }
    },
    [writeQueue],
  );

  // A set deleted before its recordSet was sent to the server must not be
  // replayed: the row comes back, and the user deletes it twice.
  const removePendingSyncs = useCallback(
    async (match: (sync: PendingSync) => boolean): Promise<number> => {
      const kept = queueRef.current.filter((sync) => {
        if (!match(sync)) return true;
        if (sync.syncId) removedIdsRef.current.add(sync.syncId);
        return false;
      });
      const removed = queueRef.current.length - kept.length;
      if (removed > 0) await writeQueue(kept);
      return removed;
    },
    [writeQueue],
  );

  const syncPendingData = useCallback(async ({ reconnected = false }: { reconnected?: boolean } = {}): Promise<void> => {
    const startingQueue = queueRef.current;
    if (syncingRef.current) {
      if (reconnected) reconnectedDuringRunRef.current = true;
      return;
    }
    if (startingQueue.length === 0) return;

    syncingRef.current = true;
    setIsSyncing(true);
    const runStartedAt = Date.now();
    try {
      console.debug(
        `Attempting to sync ${startingQueue.length} pending operations...`,
      );

      // Spreading `{ ...s, data: { ...s.data } }` collapses the discriminated
      // union: `data` widens to the union of all three data types and no longer
      // satisfies a PendingSync variant. structuredClone keeps it.
      // retryKeyOf falls back to timestamp+type without a syncId, which two
      // legacy entries of the same type can share. Stamp the live queue in
      // place so every key below is unique, and the next persist includes it.
      for (const sync of startingQueue) sync.syncId ??= generateId("sync");
      const workingSyncs: PendingSync[] = structuredClone(startingQueue);

      const failedSyncs: PendingSync[] = [];
      const dropped: DroppedSync[] = [];
      const noteDropped = (type: string, reason: string): void => {
        dropped.push({ type, reason, at: new Date().toISOString() });
      };
      // Maps a local session ID to its server ID once startSession syncs for it,
      // so later recordSet/endSession entries can resolve it in one pass instead
      // of each startSession rescanning the rest of the queue.
      const localToServerId = localToServerIdRef.current;
      const remapLocalIds = (list: PendingSync[]): void => {
        for (const sync of list) {
          if (sync.type === "startSession") continue;
          const mapped = localToServerId.get(String(sync.data.sessionId));
          if (mapped) sync.data.sessionId = mapped;
        }
      };
      // A session whose op failed (or is still waiting on its startSession)
      // must not have its later ops applied out of order: an endSession
      // landing before a retried recordSet closes the session first.
      const blockedSessions = new Set<string>();
      const sessionKeyOf = (sync: PendingSync): string | null =>
        sync.type === "startSession"
          ? (sync.localSessionId ?? null)
          : String(sync.data.sessionId);

      const now = Date.now();

      const handleStartSession = async (
        sync: Extract<PendingSync, { type: "startSession" }>,
      ): Promise<void> => {
        const sessionId = await workoutApi.startSession(
          sync.data.split,
          sync.data.dayNumber,
          sync.data.dayTitle,
          false,
          sync.timestamp,
          sync.syncId,
        );

        // Without an id nothing downstream can be remapped, and
        // cleanupInvalidSyncs would then delete every set of this session.
        // Treat it as a failure so the op remains queued and retries.
        if (!sessionId) throw new Error("startSession returned no session id");

        if (sync.localSessionId) {
          const serverIdStr = String(sessionId);
          // Without remapping endSession too, a session started AND ended
          // offline keeps its local id, is deferred forever by the guard in
          // processSync, and remains open on the server.
          localToServerId.set(sync.localSessionId, serverIdStr);
          if (currentSessionId === sync.localSessionId) {
            await saveToStorage(
              STORAGE_KEYS.CURRENT_SESSION_ID,
              serverIdStr,
              userId,
            );
            setCurrentSessionId(serverIdStr);
          }
        }
        console.info("✓ Synced session start");
        metric.count("sync.op", 1, {
          attributes: { type: "startSession", outcome: "synced" },
        });
      };

      const handleRecordSet = async (
        sync: Extract<PendingSync, { type: "recordSet" }>,
      ): Promise<void> => {
        const { weight, reps } = sync.data;

        // weight 0 is valid, since bodyweight movements have no added load.
        if (weight == null || weight < 0 || !reps || reps < 1) {
          console.warn(
            "⚠ Dropping invalid queued set (negative weight / no reps), discarding",
          );
          log.warn("sync.dropped", {
            type: "recordSet",
            reason: "invalid_set",
          });
          noteDropped("recordSet", "invalid_set");
          captureException(new Error("Dropped invalid queued set"), {
            stage: "syncPendingData",
            reason: "invalid_set",
          });
          return;
        }

        const exerciseName =
          sync.data.exerciseName ??
          (sync.data.exerciseIndex === undefined
            ? "Unknown Exercise"
            : `Exercise ${sync.data.exerciseIndex}`);

        try {
          await workoutApi.recordSet(
            sync.data.sessionId,
            {
              exerciseName,
              setIndex: sync.data.setIndex,
              startTime: sync.data.startTime,
              endTime: sync.data.endTime,
              weight,
              reps,
              note: sync.data.note,
              isWarmup: sync.data.isWarmup,
              rir: sync.data.rir,
              primaryMuscles: sync.data.primaryMuscles ?? [],
              secondaryMuscles: sync.data.secondaryMuscles ?? [],
              machineName: sync.data.machineName,
            },
            sync.syncId,
          );
          console.info("✓ Synced set record");
          metric.count("sync.op", 1, {
            attributes: { type: "recordSet", outcome: "synced" },
          });
        } catch (error) {
          // The session this set belonged to was deleted (e.g. it
          // was already ended/cleared), with the same "not found" handling as
          // endSession below. Without this, a set queued against a dead
          // session retries and fails forever instead of being dropped.
          if (!isSessionGone(error)) throw error;
          console.warn(
            "⚠ Session for queued set no longer exists, dropping sync",
          );
          log.warn("sync.dropped", {
            type: "recordSet",
            reason: "session_gone",
          });
          noteDropped("recordSet", "session_gone");
        }
      };

      const handleEndSession = async (
        sync: Extract<PendingSync, { type: "endSession" }>,
      ): Promise<void> => {
        try {
          await workoutApi.endSession(
            sync.data.sessionId,
            sync.timestamp,
            sync.syncId,
          );
          console.info("✓ Synced session end");
          metric.count("sync.op", 1, {
            attributes: { type: "endSession", outcome: "synced" },
          });
        } catch (error) {
          if (!isSessionGone(error)) throw error;
          console.warn("⚠ Session no longer exists, dropping sync");
          log.warn("sync.dropped", {
            type: "endSession",
            reason: "session_gone",
          });
          noteDropped("endSession", "session_gone");
        }
      };

      const handleUpdateSessionDay = async (
        sync: Extract<PendingSync, { type: "updateSessionDay" }>,
      ): Promise<void> => {
        try {
          await workoutApi.updateSessionDay(
            sync.data.sessionId,
            sync.data.dayNumber,
            sync.data.dayTitle,
            sync.syncId,
          );
          metric.count("sync.op", 1, {
            attributes: { type: "updateSessionDay", outcome: "synced" },
          });
        } catch (error) {
          if (!isSessionGone(error)) throw error;
          log.warn("sync.dropped", {
            type: "updateSessionDay",
            reason: "session_gone",
          });
          noteDropped("updateSessionDay", "session_gone");
        }
      };

      // Dropping a startSession orphans every set still queued behind it, and
      // cleanupInvalidSyncs would then delete the whole workout.
      const hasQueuedDependants = (sync: PendingSync): boolean =>
        sync.type === "startSession" &&
        !!sync.localSessionId &&
        workingSyncs.some(
          (s) =>
            s.type !== "startSession" &&
            String(s.data.sessionId) === sync.localSessionId,
        );

      const handleFailure = (
        sync: PendingSync,
        error: unknown,
        retryKey: string,
        previous: { count: number; rejections: number } | undefined,
      ): void => {
        console.error(`Failed to sync ${sync.type}:`, error);
        const rejected = isDefinitiveRejection(error);
        metric.count("sync.op", 1, {
          attributes: {
            type: sync.type,
            outcome: rejected ? "rejected" : "failed",
          },
        });

        const nextCount = (previous?.count ?? 0) + 1;
        const rejections = (previous?.rejections ?? 0) + (rejected ? 1 : 0);
        if (rejections > MAX_SYNC_RETRIES && !hasQueuedDependants(sync)) {
          console.warn(
            `⚠ Dropping ${sync.type} sync after ${rejections} rejections`,
          );
          log.error("sync.dropped", {
            type: sync.type,
            reason: "retries_exhausted",
            attempts: nextCount,
          });
          captureException(error, {
            stage: "syncPendingData",
            type: sync.type,
            attempts: nextCount,
          });
          noteDropped(sync.type, "retries_exhausted");
          retryStateRef.current.delete(retryKey);
        } else {
          const backoff = Math.min(
            BASE_BACKOFF_MS * 2 ** (nextCount - 1),
            MAX_BACKOFF_MS,
          );
          retryStateRef.current.set(retryKey, {
            count: nextCount,
            rejections,
            nextAttemptAt: now + backoff,
          });
          failedSyncs.push(sync);
        }
      };

      let rateLimited = false;

      const mustWait = (
        sync: PendingSync,
        sessionKey: string | null | undefined,
        retryState: { rejections: number; nextAttemptAt: number } | undefined,
      ): boolean => {
        // Its startSession hasn't synced yet (or isn't in this run), so keep it
        // queued rather than posting a local id the server can't resolve.
        // startSession is what creates the real id, so it is exempt.
        if (
          sync.type !== "startSession" &&
          sessionKey &&
          isLocalSessionId(sessionKey)
        ) {
          metric.count("sync.op", 1, {
            attributes: { type: sync.type, outcome: "deferred_local_id" },
          });
          blockedSessions.add(sessionKey);
          return true;
        }
        if (sessionKey && blockedSessions.has(sessionKey)) return true;
        // The server answering again says nothing about an op it refused, so
        // only ops that never got an answer skip their backoff on a reconnect.
        const backoffLifted = reconnected && retryState?.rejections === 0;
        if (retryState && retryState.nextAttemptAt > now && !backoffLifted) {
          if (sessionKey) blockedSessions.add(sessionKey);
          return true;
        }
        return false;
      };

      const runSync = async (sync: PendingSync): Promise<void> => {
        switch (sync.type) {
          case "startSession":
            await handleStartSession(sync);
            break;
          case "recordSet":
            await handleRecordSet(sync);
            break;
          case "endSession":
            await handleEndSession(sync);
            break;
          case "updateSessionDay":
            await handleUpdateSessionDay(sync);
            break;
          default:
            console.warn("Unknown sync type:", (sync as PendingSync).type);
            log.error("sync.dropped", {
              type: String((sync as PendingSync).type),
              reason: "unknown_type",
            });
            noteDropped(String((sync as PendingSync).type), "unknown_type");
            captureException(new Error("Dropped queued sync of unknown type"), {
              stage: "syncPendingData",
              type: String((sync as PendingSync).type),
            });
        }
      };

      const processSync = async (sync: PendingSync): Promise<void> => {
        if (sync.type !== "startSession") {
          const mapped = localToServerId.get(String(sync.data.sessionId));
          if (mapped) sync.data.sessionId = mapped;
        }

        const sessionKey = sessionKeyOf(sync);

        const retryKey = retryKeyOf(sync);
        const retryState = retryStateRef.current.get(retryKey);
        if (mustWait(sync, sessionKey, retryState)) {
          failedSyncs.push(sync);
          return;
        }

        if (sync.syncId && removedIdsRef.current.has(sync.syncId)) return;

        try {
          await runSync(sync);
          retryStateRef.current.delete(retryKey);
        } catch (error) {
          if (sessionKey) blockedSessions.add(sessionKey);
          if (error instanceof ApiError && error.status === 429) {
            rateLimited = true;
          }
          handleFailure(sync, error, retryKey, retryState);
        }
      };

      // Anything enqueued while the loop is awaiting is not in workingSyncs.
      // Writing failedSyncs alone would throw those away.
      const attempted = new Set(workingSyncs.map(retryKeyOf));
      const live = (list: PendingSync[]): PendingSync[] => {
        const removedIds = removedIdsRef.current;
        if (removedIds.size === 0) return list;
        return list.filter((s) => !s.syncId || !removedIds.has(s.syncId));
      };
      const persistFrom = (index: number): Promise<void> => {
        const extras = queueRef.current.filter(
          (s) => !attempted.has(retryKeyOf(s)),
        );
        // A startSession that synced this run created the real id. Everything
        // still queued has to use it, or a crash before the next run leaves
        // those ops pointing at a local session that no longer replays.
        remapLocalIds(workingSyncs);
        remapLocalIds(extras);
        return writeQueue(
          [
            ...live(failedSyncs),
            ...live(workingSyncs.slice(index)),
            ...extras,
          ].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        );
      };

      const persistEvery = Math.max(
        PERSIST_EVERY,
        Math.ceil(workingSyncs.length / MAX_REPLAY_CHECKPOINTS),
      );
      for (let i = 0; i < workingSyncs.length; i++) {
        await processSync(workingSyncs[i]);
        const isLast = i === workingSyncs.length - 1;
        if (rateLimited) {
          await persistFrom(i + 1);
          break;
        }
        if (isLast || (i + 1) % persistEvery === 0) await persistFrom(i + 1);
      }
      if (dropped.length > 0) {
        setDroppedSyncs((prev) => [...prev, ...dropped]);
        metric.count("sync.dropped", dropped.length);
      }

      if (failedSyncs.length === 0) {
        console.info("✓ All pending syncs completed successfully!");
        if (!useManualTime && fetchAnalytics) {
          await fetchAnalytics();
        }
      } else {
        console.warn(`⚠ ${failedSyncs.length} syncs still pending`);
      }
    } catch (error) {
      console.error("Sync run failed:", error);
      captureException(error, {
        stage: "syncPendingData",
        depth: startingQueue.length,
      });
    } finally {
      metric.distribution("sync.run.duration", Date.now() - runStartedAt, {
        unit: "millisecond",
        attributes: { queued: startingQueue.length },
      });
      syncingRef.current = false;
      removedIdsRef.current.clear();
      setIsSyncing(false);
      if (reconnectedDuringRunRef.current) {
        reconnectedDuringRunRef.current = false;
        void syncPendingDataRef.current({ reconnected: true });
      }
    }
  }, [
    setIsSyncing,
    writeQueue,
    currentSessionId,
    setCurrentSessionId,
    userId,
    saveToStorage,
    STORAGE_KEYS,
    useManualTime,
    fetchAnalytics,
    workoutApi,
  ]);

  syncPendingDataRef.current = syncPendingData;

  const cleanupInvalidSyncs = useCallback(async (): Promise<void> => {
    const current = queueRef.current;
    // A local session id is only unusable once its startSession is gone from
    // the queue. While it is still there, the replay remaps these to the real
    // server id, so dropping them would silently erase the offline sets.
    const replayable = new Set(
      current.flatMap((sync) =>
        sync.type === "startSession" && sync.localSessionId
          ? [sync.localSessionId]
          : [],
      ),
    );
    const validSyncs = current.filter((sync) => {
      if (sync.type === "startSession") return true;
      const sessionId = String(sync.data.sessionId);
      return !isLocalSessionId(sessionId) || replayable.has(sessionId);
    });

    if (validSyncs.length !== current.length) {
      const kept = new Set(validSyncs);
      const at = new Date().toISOString();
      const removed = current
        .filter((sync) => !kept.has(sync))
        .map((sync) => ({ type: sync.type, reason: "local_id", at }));
      await writeQueue(validSyncs);
      console.debug(`🧹 Cleaned up ${removed.length} invalid syncs`);
      log.warn("sync.dropped", {
        reason: "local_id",
        count: removed.length,
      });
      metric.count("sync.cleanup.removed", removed.length);
      captureException(new Error("Dropped queued syncs for an unknown local session"), {
        stage: "cleanupInvalidSyncs",
        count: removed.length,
      });
      setDroppedSyncs((prev) => [...prev, ...removed]);
    }
  }, [writeQueue]);

  const acknowledgeDroppedSyncs = useCallback(() => setDroppedSyncs([]), []);

  return useMemo(
    () => ({
      addPendingSync,
      removePendingSyncs,
      syncPendingData,
      cleanupInvalidSyncs,
      droppedSyncs,
      droppedSyncCount: droppedSyncs.length,
      acknowledgeDroppedSyncs,
    }),
    [
      addPendingSync,
      removePendingSyncs,
      syncPendingData,
      cleanupInvalidSyncs,
      droppedSyncs,
      acknowledgeDroppedSyncs,
    ],
  );
};
