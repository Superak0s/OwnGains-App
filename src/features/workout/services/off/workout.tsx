import * as DocumentPicker from "expo-document-picker";
import {
  nextId,
  createRecordStore,
  withLock,
} from "@shared/services/offlineHelpers";
import type {
  SetTiming,
  WorkoutSession,
  FullSessionWithGroups,
  WorkoutData,
} from "@shared/types";
import {
  fillDemoSessions,
  type DemoFillResult,
} from "@features/settings/utils/demoData";
import type {
  RenameExerciseResult,
  UpdateSetParams,
  RecordSetParams,
  SessionHistoryPage,
  WorkoutAnalytics,
} from "../on/workout";

import { programApi } from "@features/plan/services/index";
import { computeWorkoutAnalytics } from "./workoutAnalytics";
import { pickRecordSessions } from "@utils/recordSets";

interface StoredSession extends Omit<WorkoutSession, "endTime"> {
  split: string;
  endTime: string | null;
  setTimings: SetTiming[];
  isDemo: boolean;
}

const SESSIONS_KEY = "@offline:workout:sessions";
const SESSION_ID_COUNTER = "@offline:workout:session_id_counter";
const SET_ID_COUNTER = "@offline:workout:set_id_counter";

const DEFAULT_SPLIT = "local";

// Every mutator here is a read-modify-write over a whole stored session, so
// two overlapping ones (a last set and End Workout) would clobber each other.
const SESSIONS_LOCK = "workout_sessions";

const sessionsStore = createRecordStore<StoredSession>(
  "workout_sessions",
  SESSIONS_KEY,
  (s) => s.id,
  (s) => s.startTime ?? "",
);

const uniqueMuscles = (
  timings: SetTiming[],
  key: "exercisePrimaryMuscles" | "exerciseSecondaryMuscles",
): string[] => [...new Set(timings.flatMap((t) => t[key] ?? []))];

// The server derives these server-side. The offline store only holds raw
// timings, so history rows would otherwise render "0 sets" with no duration.
function summarize(s: StoredSession) {
  const seconds =
    s.endTime && s.startTime
      ? Math.max(
          0,
          Math.round(
            (new Date(s.endTime).getTime() - new Date(s.startTime).getTime()) /
              1000,
          ),
        )
      : undefined;
  return {
    completedSets: s.setTimings.filter((t) => !t.isWarmup).length,
    totalDuration: Number.isFinite(seconds) ? seconds : undefined,
    primaryMuscles: uniqueMuscles(s.setTimings, "exercisePrimaryMuscles"),
    secondaryMuscles: uniqueMuscles(s.setTimings, "exerciseSecondaryMuscles"),
  };
}

function toPublicSession(
  s: StoredSession,
  includeTimings: boolean,
): WorkoutSession & { setTimings?: SetTiming[] } {
  const { isDemo: _isDemo, setTimings, endTime, ...rest } = s;
  const base = { ...rest, endTime: endTime ?? undefined, ...summarize(s) };
  if (includeTimings) return { ...base, setTimings };
  return { ...base, setCount: setTimings.length };
}

function toFullSession(s: StoredSession): FullSessionWithGroups {
  return {
    id: s.id,
    dayNumber: s.dayNumber ?? 0,
    endTime: s.endTime ?? undefined,
    setTimings: s.setTimings,
    startTime: s.startTime,
    dayTitle: s.dayTitle,
    ...summarize(s),
  };
}

function applyRenameToSession(
  session: StoredSession,
  oldName: string,
  updates: {
    newName?: string;
    primaryMuscles?: string[] | null;
    secondaryMuscles?: string[] | null;
  },
): number {
  let renamed = 0;
  for (const timing of session.setTimings) {
    if (timing.exerciseName !== oldName) continue;
    if (updates.newName !== undefined) timing.exerciseName = updates.newName;
    if (updates.primaryMuscles !== undefined)
      timing.exercisePrimaryMuscles = updates.primaryMuscles ?? undefined;
    if (updates.secondaryMuscles !== undefined)
      timing.exerciseSecondaryMuscles = updates.secondaryMuscles ?? undefined;
    renamed += 1;
  }
  return renamed;
}

export const workoutApi = {
  pickWorkoutFile: async (): Promise<string | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/vnd.oasis.opendocument.spreadsheet",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
        "application/octet-stream",
        "*/*",
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    return result.assets?.[0]?.uri ?? null;
  },

  startSession: async (
    split: string | null,
    dayNumber: number,
    dayTitle?: string,
    _primaryMuscles?: string[],
    _secondaryMuscles?: string[],
    isDemo: boolean = false,
    startTime: string | null = null,
  ): Promise<number | string> => {
    // Prefixed so an offline id can never be mistaken for a server session id
    // after a switch back to online mode.
    const id = `off_${await nextId(SESSION_ID_COUNTER)}`;
    const session: StoredSession = {
      id,
      split: split ?? DEFAULT_SPLIT,
      dayNumber,
      dayTitle,
      startTime: startTime ?? new Date().toISOString(),
      endTime: null,
      setTimings: [],
      isDemo,
    };
    await sessionsStore.put(session);
    return id;
  },

  updateSessionDay: async (
    sessionId: number | string,
    dayNumber: number,
    dayTitle?: string,
  ): Promise<void> =>
    withLock(SESSIONS_LOCK, async () => {
      const session = await sessionsStore.getOne(sessionId);
      if (!session) return;
      await sessionsStore.put({ ...session, dayNumber, dayTitle });
    }),

  recordSet: async (
    sessionId: number | string,
    {
      exerciseName,
      setIndex,
      startTime,
      endTime,
      weight,
      reps,
      note = "",
      isWarmup = false,
      rir,
      primaryMuscles = [],
      secondaryMuscles = [],
      machineName,
    }: RecordSetParams,
  ): Promise<SetTiming> =>
    withLock(SESSIONS_LOCK, async () => {
      const session = await sessionsStore.getOne(sessionId);
      if (!session) throw new Error("Failed to record set: session not found");

      const timing: SetTiming = {
        id: await nextId(SET_ID_COUNTER),
        exerciseName,
        exercisePrimaryMuscles: primaryMuscles,
        exerciseSecondaryMuscles: secondaryMuscles,
        setIndex,
        startTime,
        endTime,
        weight,
        reps,
        note,
        isWarmup: isWarmup,
        rir,
        machineName,
      };
      session.setTimings.push(timing);
      await sessionsStore.put(session);
      return timing;
    }),

  updateSet: async (
    sessionId: number | string,
    setId: number | string,
    updates: UpdateSetParams,
  ): Promise<SetTiming> =>
    withLock(SESSIONS_LOCK, async () => {
      const session = await sessionsStore.getOne(sessionId);
      if (!session) throw new Error("Failed to update set: session not found");

      const timing = session.setTimings.find(
        (t) => String(t.id) === String(setId),
      );
      if (!timing) throw new Error("Failed to update set: set not found");

      if (updates.exerciseName !== undefined)
        timing.exerciseName = updates.exerciseName;
      if (updates.primaryMuscles !== undefined)
        timing.exercisePrimaryMuscles = updates.primaryMuscles ?? undefined;
      if (updates.secondaryMuscles !== undefined)
        timing.exerciseSecondaryMuscles = updates.secondaryMuscles ?? undefined;
      if (updates.weight !== undefined) timing.weight = updates.weight;
      if (updates.reps !== undefined) timing.reps = updates.reps;
      if (updates.startTime !== undefined) timing.startTime = updates.startTime;
      if (updates.endTime !== undefined) timing.endTime = updates.endTime;
      if (updates.note !== undefined) timing.note = updates.note;
      if (updates.isWarmup !== undefined) timing.isWarmup = updates.isWarmup;
      if (updates.rir !== undefined) timing.rir = updates.rir ?? undefined;

      await sessionsStore.put(session);
      return timing;
    }),

  deleteSet: async (
    sessionId: number | string,
    exerciseName: string,
    setIndex: number,
  ): Promise<{ deletedCount: number }> =>
    withLock(SESSIONS_LOCK, async () => {
      const session = await sessionsStore.getOne(sessionId);
      if (!session) throw new Error("Failed to delete set: session not found");

      // Every match, like the server: a re-logged set leaves duplicates behind,
      // and deleting one at a time makes the row reappear after each delete.
      const kept = session.setTimings.filter(
        (t) => !(t.exerciseName === exerciseName && t.setIndex === setIndex),
      );
      const deletedCount = session.setTimings.length - kept.length;
      if (deletedCount === 0) return { deletedCount: 0 };

      session.setTimings = kept;
      await sessionsStore.put(session);
      return { deletedCount };
    }),

  renameExercise: async (
    split: string,
    oldName: string,
    updates: {
      newName?: string;
      primaryMuscles?: string[] | null;
      secondaryMuscles?: string[] | null;
    },
  ): Promise<RenameExerciseResult> =>
    withLock(SESSIONS_LOCK, async () => {
      const sessions = await sessionsStore.getWhere({ split });
      let updatedCount = 0;
      const changedSessions: StoredSession[] = [];

      for (const session of sessions) {
        const renamed = applyRenameToSession(session, oldName, updates);
        if (renamed > 0) {
          updatedCount += renamed;
          changedSessions.push(session);
        }
      }

      await sessionsStore.putMany(changedSessions);
      return { updatedCount };
    }),

  endSession: async (
    sessionId: number | string,
    endTime: string | null = null,
  ): Promise<WorkoutSession> =>
    withLock(SESSIONS_LOCK, async () => {
      const session = await sessionsStore.getOne(sessionId);
      if (!session) throw new Error("Failed to end session: session not found");

      session.endTime = endTime ?? new Date().toISOString();
      await sessionsStore.put(session);
      return toPublicSession(session, true);
    }),

  getAnalytics: async (
    split: string | null = null,
    dayNumber: number | null = null,
    days: number = 365,
  ): Promise<WorkoutAnalytics> => {
    // Same window the server applies, so the numbers don't jump when the same
    // user goes offline.
    const cutoff = Date.now() - days * 86_400_000;
    // Sort keys are local-offset ISO strings, so the SQL bound is widened by a
    // day and the exact cutoff is applied below.
    const sessions = await sessionsStore.getSince(
      new Date(cutoff - 86_400_000).toISOString(),
    );
    const filtered = sessions.filter(
      (s) =>
        (!split || s.split === split) &&
        (!dayNumber || s.dayNumber === dayNumber) &&
        new Date(s.startTime ?? 0).getTime() >= cutoff,
    );

    return computeWorkoutAnalytics(filtered);
  },

  getSessionHistory: async (
    split: string | null = null,
    dayNumber: number | null = null,
    limit: number = 10,
    includeTimings: boolean = false,
  ): Promise<WorkoutSession[]> => {
    const where = {
      ...(split && { split }),
      ...(dayNumber && { dayNumber }),
    };
    const sessions = await sessionsStore.getWhere(where, limit);
    const filtered = sessions
      .sort(
        (a, b) =>
          new Date(b.startTime ?? 0).getTime() -
          new Date(a.startTime ?? 0).getTime(),
      )
      .slice(0, limit);

    return filtered.map((s) => toPublicSession(s, includeTimings));
  },

  getSessionHistoryPage: async (
    split: string | null = null,
    before: string | null = null,
    limit: number = 1000,
    includeTimings: boolean = false,
  ): Promise<SessionHistoryPage> => {
    const sessions = (await sessionsStore.getWhere(split ? { split } : {}))
      .sort(
        (a, b) =>
          new Date(b.startTime ?? 0).getTime() -
          new Date(a.startTime ?? 0).getTime(),
      );
    const offset = before ? Math.max(0, Number.parseInt(before, 10) || 0) : 0;
    const end = offset + limit;
    return {
      sessions: sessions
        .slice(offset, end)
        .map((s) => toPublicSession(s, includeTimings)),
      nextCursor: end < sessions.length ? String(end) : null,
    };
  },

  getRecordSessions: async (): Promise<WorkoutSession[] | null> => {
    const sessions = await sessionsStore.getAll();
    return pickRecordSessions(sessions).map((s) => toPublicSession(s, true));
  },

  getSession: async (
    sessionId: number | string,
  ): Promise<FullSessionWithGroups> => {
    const session = await sessionsStore.getOne(sessionId);
    if (!session) throw new Error("Failed to get session: session not found");
    return toFullSession(session);
  },

  fillDemoData: async (
    program: WorkoutData,
    split: string,
  ): Promise<DemoFillResult> => {
    await workoutApi.clearDemoSessions();
    return fillDemoSessions(workoutApi, program, split);
  },

  clearDemoSessions: async (): Promise<unknown> => {
    const sessions = await sessionsStore.getAll();
    const demoIds = sessions.filter((s) => s.isDemo).map((s) => s.id);
    await sessionsStore.removeMany(demoIds);
    return { success: true, deletedCount: demoIds.length };
  },

  deleteAllSessionsForSplit: async (split: string): Promise<unknown> => {
    const sessions = await sessionsStore.getWhere({ split });
    const toDelete = sessions.map((s) => s.id);
    await sessionsStore.removeMany(toDelete);
    return { success: true, deletedCount: toDelete.length };
  },

  deleteAllUserData: async (_password?: string): Promise<unknown> => {
    await sessionsStore.clear();
    await programApi.deleteProgram();
    return { success: true };
  },
};
