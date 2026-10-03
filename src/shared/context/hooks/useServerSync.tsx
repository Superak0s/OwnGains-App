import { useCallback, useEffect, useMemo, useRef } from "react";
import { programApi as defaultProgramApi } from "@features/plan/services/index";
import { workoutApi as defaultWorkoutApi } from "@features/workout/services/index";
import type { WorkoutApi } from "@features/workout/services/workoutApiFactory";
import type { ProgramApi } from "@features/plan/services/programApiFactory";
import type {
  Exercise,
  WorkoutData,
  CompletedDays,
  LockedDays,
  WorkoutSession,
  FullSession,
} from "../../types";
import { captureException, log, metric } from "../../services/crashReporting";
import { clearProgramDirty, isProgramDirty } from "../../services/programDirty";


interface UseServerSyncOptions {
  userId: string | null;
  selectedSplit: string | null;
  workoutData: WorkoutData | null;
  setWorkoutData: (data: WorkoutData) => void;
  completedDays: CompletedDays;
  lockedDays: LockedDays;
  setCompletedDays: (days: CompletedDays) => void;
  setLockedDays: (days: LockedDays) => void;
  currentSessionId: string | null;
  unlockedOverrides: Record<number, boolean>;
  saveToStorage: (
    key: string,
    value: unknown,
    userId: string | null,
  ) => Promise<boolean>;
  STORAGE_KEYS: {
    WORKOUT_DATA: string;
    COMPLETED_DAYS: string;
    LOCKED_DAYS: string;
  };
  /**
   * Clears the locally-held active workout session (workoutStartTime,
   * currentSessionId, etc). Called when syncFromServer discovers that the
   * session the client still thinks is "active" was actually already ended
   * server-side (e.g. by the stale-session cleanup job after the app was
   * closed for 30+ minutes).
   */
  clearActiveWorkout: () => Promise<void>;
  workoutApi?: WorkoutApi;
  programApi?: ProgramApi;
}

interface UseServerSyncReturn {
  fetchSessionHistory: (
    limit?: number,
    includeTimings?: boolean,
  ) => Promise<WorkoutSession[]>;
  fetchRecordSessions: () => Promise<WorkoutSession[] | null>;
  syncFromServer: () => Promise<CompletedDays | undefined>;
}

function getCurrentWeekMonday(): Date {
  const now = new Date();
  const day = now.getDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

async function fetchWeeklySessions(
  split: string,
  api: WorkoutApi,
): Promise<FullSession[]> {
  // Timings come back with the list: fetching each session separately is one
  // request per workout, and any that fails silently loses that day's sets.
  const allSessions = await api.getSessionHistory(split, null, 100, true);
  if (!allSessions?.length) return [];

  const weekStart = getCurrentWeekMonday();
  return allSessions
    .filter((s) => {
      const raw = s.startTime ?? s.createdAt;
      return s.dayNumber != null && !!raw && new Date(raw) >= weekStart;
    })
    .map((s) => ({
      id: s.id,
      dayNumber: s.dayNumber as number,
      endTime: s.endTime,
      setTimings: s.setTimings,
    }));
}

export const useServerSync = ({
  userId,
  selectedSplit,
  workoutData,
  setWorkoutData,
  completedDays,
  lockedDays,
  setCompletedDays,
  setLockedDays,
  currentSessionId,
  unlockedOverrides,
  saveToStorage,
  STORAGE_KEYS,
  clearActiveWorkout,
  workoutApi = defaultWorkoutApi,
  programApi = defaultProgramApi,
}: UseServerSyncOptions): UseServerSyncReturn => {
  // syncFromServer awaits a network round-trip (programApi.fetchSavedProgram)
  // before it merges and calls setWorkoutData. If local state changes while
  // that request is in flight (e.g. the user inserts/starts a template),
  // the closed-over `workoutData` param is stale by the time the merge
  // runs, so the merge (and the setWorkoutData it produces) would silently
  // discard whatever changed locally in the meantime. This ref always holds
  // the latest workoutData so the merge can be based on current state
  // instead of a snapshot from when the request started.
  const workoutDataRef = useRef(workoutData);
  useEffect(() => {
    workoutDataRef.current = workoutData;
  }, [workoutData]);

  // Mirrors currentSessionId so the async syncFromServer callback always
  // compares against the freshest value, not one captured when the sync
  // started (the same staleness concern as workoutDataRef above).
  const currentSessionIdRef = useRef(currentSessionId);
  useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const fetchSessionHistory = useCallback(
    async (
      limit: number = 30,
      includeTimings: boolean = false,
    ): Promise<WorkoutSession[]> => {
      try {
        // Deliberately unscoped: history feeds analytics, the home feed and
        // previous-best lookups, all of which go blank the moment the user
        // switches split if the query is filtered to the current one.
        const sessions = await workoutApi.getSessionHistory(
          null,
          null,
          limit,
          includeTimings,
        );
        return sessions ?? [];
      } catch (error) {
        console.error("Error fetching session history:", error);
        metric.count("sync.history_fetch_failed");
        captureException(error, { stage: "fetchSessionHistory" });
        // Rethrown rather than swallowed as an empty list: every caller renders
        // an error state, but "[]" reads as "you have never trained" and reset
        // the streak to 0 on a flaky connection.
        throw error;
      }
    },
    [workoutApi],
  );

  const fetchRecordSessions = useCallback(
    async (): Promise<WorkoutSession[] | null> => {
      try {
        return await workoutApi.getRecordSessions();
      } catch (error) {
        captureException(error, { stage: "fetchRecordSessions" });
        return null;
      }
    },
    [workoutApi],
  );

  const mergeProgramFromServer = useCallback(async (): Promise<WorkoutData | null> => {
    try {
      const latestWorkoutData = workoutDataRef.current;

      // Edits the server never accepted: merging its copy back would undo them,
      // and the day-count heuristic this replaces could not even see an edit
      // that left the program the same size. Push local up instead.
      if (latestWorkoutData && (await isProgramDirty(userId))) {
        try {
          await programApi.saveProgram(latestWorkoutData);
          await clearProgramDirty(userId);
        } catch (err) {
          log.warn("sync.program_push_failed", {
            reason: (err as Error).message,
          });
        }
        return null;
      }

      const savedProgram = await programApi.fetchSavedProgram();
      if (!savedProgram?.days) return null;
      if (!latestWorkoutData) return null;

      const mergedData: WorkoutData = {
        ...latestWorkoutData,
        days: latestWorkoutData.days.map((localDay) => {
          const serverDay = savedProgram.days.find(
            (d) => d.dayNumber === localDay.dayNumber,
          );
          if (!serverDay) return localDay;

          // The server copy is kept per split: a local edit the server never took is
          // handled above by the dirty flag, so reaching here means the server
          // has every edit this device made plus anything from another one.
          // Splits it doesn't know about are kept.
          return {
            ...localDay,
            split: { ...localDay.split, ...(serverDay.split || {}) },
          };
        }),
      };
      return mergedData;
    } catch (programErr) {
      console.warn(
        "Could not refresh program from server:",
        (programErr as Error).message,
      );
      log.warn("sync.program_refresh_failed", {
        reason: (programErr as Error).message,
      });
      return null;
    }
  }, [userId, programApi]);

  const processSetTimingsForDay = useCallback((
    timings: NonNullable<FullSession["setTimings"]>,
    exercises: Exercise[],
    dayNumber: number,
    newCompletedDays: CompletedDays,
  ): void => {
    timings.forEach((timing) => {
      // Matched by name only: falling back to the timing's position in the list
      // attributes a set the day no longer contains to whichever exercise
      // happens to sit at that index.
      if (!timing.exerciseName) return;
      const name = timing.exerciseName.toLowerCase();
      const exerciseIndex = exercises.findIndex(
        (ex) => ex.name.toLowerCase() === name,
      );
      if (exerciseIndex === -1) return;

      const setIndex = timing.setIndex;
      if (!newCompletedDays[dayNumber][exerciseIndex]) {
        newCompletedDays[dayNumber][exerciseIndex] = {};
      }

      const existing = newCompletedDays[dayNumber][exerciseIndex][setIndex];
      const serverTime = new Date(timing.endTime).getTime();
      if (!existing || serverTime > new Date(existing.completedAt).getTime()) {
        newCompletedDays[dayNumber][exerciseIndex][setIndex] = {
          weight: timing.weight ?? 0,
          reps: timing.reps ?? 0,
          completedAt: timing.endTime,
          note: timing.note ?? "",
          isWarmup: timing.isWarmup ?? false,
          ...(timing.rir != null && { rir: timing.rir }),
          ...(timing.machineName != null && { machineName: timing.machineName }),
          source: "server",
        };
      }
    });
  }, []);

  const buildCompletedDaysMap = useCallback((
    sessionResults: (FullSession | null)[],
    workoutData: WorkoutData,
  ): {
    newCompletedDays: CompletedDays;
    newLockedDays: LockedDays;
    activeSessionWasEndedRemotely: boolean;
  } => {
    const newCompletedDays: CompletedDays = {};
    const newLockedDays: LockedDays = { ...lockedDays };
    let activeSessionWasEndedRemotely = false;

    const collectDay = (fullSession: FullSession, dayNumber: number) => {
      if (unlockedOverrides[dayNumber]) return;
      if (!fullSession.setTimings?.length) return;

      const day = workoutData.days.find((d) => d.dayNumber === dayNumber);
      if (!day) return;
      const splitWorkout = day.split[selectedSplit!];
      if (!splitWorkout?.exercises) return;

      newCompletedDays[dayNumber] ??= {};
      processSetTimingsForDay(
        fullSession.setTimings,
        splitWorkout.exercises,
        dayNumber,
        newCompletedDays,
      );
    };

    for (const fullSession of sessionResults) {
      if (!fullSession) continue;
      const dayNumber = fullSession.dayNumber;

      if (fullSession.endTime && !unlockedOverrides[dayNumber]) {
        newLockedDays[dayNumber] = true;
      }
      if (
        fullSession.endTime &&
        currentSessionIdRef.current &&
        String(fullSession.id) === String(currentSessionIdRef.current)
      ) {
        activeSessionWasEndedRemotely = true;
      }
      collectDay(fullSession, dayNumber);
    }

    return { newCompletedDays, newLockedDays, activeSessionWasEndedRemotely };
  }, [lockedDays, selectedSplit, unlockedOverrides, processSetTimingsForDay]);

  // Sets recorded while a sync is in flight are absent from the closed-over
  // completedDays, and a merge built from that snapshot drops them.
  const completedDaysRef = useRef(completedDays);
  useEffect(() => {
    completedDaysRef.current = completedDays;
  }, [completedDays]);

  const preserveLocalSets = useCallback((newCompletedDays: CompletedDays): void => {
    // Anything not stamped `source: "server"` exists only on this device until
    // the sync queue replays, so the server-built map would wipe it off the
    // board, including after the workout ended, when there is no active
    // session left to scope the merge by.
    for (const [dayNumberStr, exercises] of Object.entries(
      completedDaysRef.current,
    )) {
      const dayNumber = Number(dayNumberStr);
      if (unlockedOverrides[dayNumber]) continue;

      for (const [exerciseIndexStr, sets] of Object.entries(exercises || {})) {
        const exerciseIndex = Number(exerciseIndexStr);

        for (const [setIndexStr, localSet] of Object.entries(sets || {})) {
          const setIndex = Number(setIndexStr);
          if (localSet.source === "server") continue;

          newCompletedDays[dayNumber] ??= {};
          newCompletedDays[dayNumber][exerciseIndex] ??= {};
          newCompletedDays[dayNumber][exerciseIndex][setIndex] ??= localSet;
        }
      }
    }
  }, [unlockedOverrides]);

  // Three independent triggers (mount, app foregrounded, trainer events) can
  // fire this at once. Overlapping runs each merge against state the other is
  // still writing, and one run's sets end up dropped.
  const syncInFlightRef = useRef<Promise<CompletedDays | undefined> | null>(
    null,
  );

  const runSync = useCallback(async (): Promise<CompletedDays | undefined> => {
    if (!userId || !selectedSplit || !workoutDataRef.current?.days) return;

    console.debug("🔄 Syncing completedDays...");

    try {
      let currentWorkoutData = workoutDataRef.current;

      const mergedProgram = await mergeProgramFromServer();
      if (mergedProgram) {
        currentWorkoutData = mergedProgram;
        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, mergedProgram, userId);
        setWorkoutData(mergedProgram);
        console.info("✅ Program refreshed");
      } else if (workoutDataRef.current) {
        currentWorkoutData = workoutDataRef.current;
      }

      const sessions = await fetchWeeklySessions(selectedSplit, workoutApi);

      if (!sessions.length) {
        console.debug(
          "No sessions found for the current week, skipping lock/completion sync",
        );
        return;
      }

      const { newCompletedDays, newLockedDays, activeSessionWasEndedRemotely } =
        buildCompletedDaysMap(sessions, currentWorkoutData);

      preserveLocalSets(newCompletedDays);

      await saveToStorage(
        STORAGE_KEYS.COMPLETED_DAYS,
        newCompletedDays,
        userId,
      );
      await saveToStorage(STORAGE_KEYS.LOCKED_DAYS, newLockedDays, userId);
      setCompletedDays(newCompletedDays);
      setLockedDays(newLockedDays);

      console.info(
        "✅ Sync complete:",
        Object.keys(newCompletedDays).length,
        "days synced,",
        Object.keys(newLockedDays).length,
        "days locked",
      );

      if (activeSessionWasEndedRemotely) {
        console.warn(
          "⚠ Current session was already ended server-side, clearing local active workout state",
        );
        metric.count("sync.remote_session_end");
        try {
          await clearActiveWorkout();
        } catch (err) {
          console.warn(
            "Failed to clear locally-active workout after remote end:",
            (err as Error).message,
          );
          captureException(err, { stage: "clearActiveWorkout" });
        }
      }

      metric.count("sync.from_server", 1, { attributes: { outcome: "ok" } });
      return newCompletedDays;
    } catch (error) {
      console.error("❌ Sync failed:", error);
      metric.count("sync.from_server", 1, { attributes: { outcome: "failed" } });
      captureException(error, { stage: "syncFromServer" });
    }
  }, [
    userId,
    selectedSplit,
    setWorkoutData,
    setCompletedDays,
    setLockedDays,
    saveToStorage,
    STORAGE_KEYS,
    clearActiveWorkout,
    buildCompletedDaysMap,
    preserveLocalSets,
    workoutApi,
    mergeProgramFromServer,
  ]);

  const syncFromServer = useCallback((): Promise<CompletedDays | undefined> => {
    syncInFlightRef.current ??= runSync().finally(() => {
      syncInFlightRef.current = null;
    });
    return syncInFlightRef.current;
  }, [runSync]);

  return useMemo(
    () => ({ fetchSessionHistory, fetchRecordSessions, syncFromServer }),
    [fetchSessionHistory, fetchRecordSessions, syncFromServer],
  );
};
