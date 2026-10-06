import {
  createContext,
  useState,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useLayoutEffect,
  useSyncExternalStore,
  useEffectEvent,
  type ReactNode,
} from "react";
import { useAuth, useAuthToken } from "./AuthContext";
import { showToast } from "@shared/components/toast";
import { useRealtimeSocket } from "./hooks/useRealtimeSocket";
import { workoutApi } from "@features/workout/services";
import { programApi } from "@features/plan/services";
import { makeWorkoutApi } from "@features/workout/services/workoutApiFactory";
import { makeProgramApi } from "@features/plan/services/programApiFactory";
import { traineeFetch } from "@shared/services/traineeFetch";
import {
  isTrainerEvent,
  onTrainerEvent,
  restoreActiveTrainee,
  type TrainerEvent,
} from "@shared/services/trainerEvents";
import type { WorkoutAnalytics } from "@features/workout/services/on/workout";
import type {
  WorkoutSession,
  WorkoutData,
  WorkoutDay,
  CompletedDays,
  LockedDays,
  PendingSync,
  Exercise,
} from "@shared/types";
import { captureException, log, metric, reportAndReturn } from "@shared/services/crashReporting";

import {
  STORAGE_KEYS,
  saveToStorage,
  loadMultipleFromStorage,
  removeFromStorage,
  removeMultipleFromStorage,
} from "../services/storage";
import { clearUserData } from "../services/sqliteStorage";
import { loadPendingSyncs } from "../services/pendingSyncStore";
import { deletePhotoFilesFor } from "@utils/deviceBackup";

import { isServerless } from "@shared/services/appMode";
import {
  getLocalISOString,
  isLocalSessionId,
  isOfflineSessionId,
  isSessionGone,
  isSessionIdForMode,
  isSessionInactive,
  calculateSessionTime,
  calculateRestTime,
  calculateSessionAverageRest,
  calculateRestByExercise,
  getLastSetExerciseIndex,
  getSessionStatistics,
  mergeRestHistory,
  pooledRestHistory,
  INACTIVITY_THRESHOLD_MS,
} from "../../utils/session";
import type { ExerciseRest, RestHistory } from "../../utils/session";
import {
  applyDayOverride,
  carryOverDay,
  dayExercises,
  type DayOverride,
} from "../../utils/dayCarryOver";

import {
  getEstimatedTimeRemaining,
  getEstimatedEndTime,
} from "../../utils/timeEstimation";

import { AppState, Platform } from "react-native";
import { hideHydrationNotification } from "@features/tracking/hydrationNotification";
import {
  cancelAllSupplementReminders,
  initializeSupplementNotifications,
  WORKOUT_TIMER_CHANNEL,
} from "@shared/services/supplementReminders";
import {
  cancelReminder,
  scheduleReminder,
} from "../services/notifications";

import {
  isSetComplete,
  getSetDetails,
  getExerciseCompletedSets,
  isDayComplete,
  isDayLocked,
  shouldResetForMonday,
} from "../../utils/dayCompletion";

import { useSyncManager } from "./hooks/useSyncManager";
import type { DroppedSync } from "./hooks/useSyncManager";
import {
  useSessionOperations,
  traineeWriteRefused,
} from "./hooks/useSessionOperations";
import type { SetDetailsOptions } from "./hooks/useSessionOperations";
import { useProgramOperations } from "./hooks/useProgramOperations";
import type { MachinePatch } from "@features/plan/types";
import { createEmitter } from "@utils/emitter";
import { useServerSync } from "./hooks/useServerSync";
import { JointSessionProvider } from "./JointSessionContext";

import type { WebSocketMessage } from "./hooks/useRealtimeSocket";
import type { JointExerciseEntry } from "./hooks/useJointSession";

type ServerAnalyticsType = WorkoutAnalytics | null;

interface WorkoutContextValue {
  userId: string | null;
  activeTrainer: string | null;
  actAs: { userId: string; username: string } | null;
  workoutData: WorkoutData | null;
  /** workoutData as the live session sees it, with exercises carried over by a mid-workout day switch. */
  sessionWorkoutData: WorkoutData | null;
  selectedSplit: string | null;
  currentDay: number;
  completedDays: CompletedDays;
  lockedDays: LockedDays;
  unlockedOverrides: Record<number, boolean>;
  isLoading: boolean;
  timeBetweenSets: number;
  workoutStartTime: string | null;
  currentSessionId: string | null;
  serverAnalytics: ServerAnalyticsType;
  useManualTime: boolean;
  lastActivityTime: number | null;
  lastSetEndTime: string | null;
  weightUnit: "kg" | "lbs";
  saveWorkoutData: (data: WorkoutData | null) => Promise<void>;
  saveSelectedSplit: (split: string) => Promise<void>;
  saveCurrentDay: (day: number) => Promise<void>;
  saveCompletedDays: (completed: CompletedDays) => Promise<void>;
  saveLockedDays: (locked: LockedDays) => Promise<void>;
  saveUnlockedOverrides: (overrides: Record<number, boolean>) => Promise<void>;
  saveTimeBetweenSets: (seconds: number) => Promise<void>;
  toggleUseManualTime: (enabled: boolean) => Promise<void>;
  hasActiveSession: () => boolean;
  startWorkout: () => Promise<string | null>;
  endWorkout: (autoCompleted?: boolean) => Promise<boolean>;
  saveWeightUnit: (unit: "kg" | "lbs") => Promise<void>;

  saveSetDetails: (
    dayNumber: number,
    exerciseIndex: number,
    setIndex: number,
    weight: number,
    reps: number,
    details?: SetDetailsOptions,
  ) => Promise<void>;
  deleteSetDetails: (
    dayNumber: number,
    exerciseIndex: number,
    setIndex: number,
  ) => Promise<boolean>;
  clearActiveWorkout: () => Promise<void>;
  isSetComplete: (
    dayNumber: number,
    exerciseIndex: number,
    setIndex: number,
  ) => boolean;
  getSetDetails: (
    dayNumber: number,
    exerciseIndex: number,
    setIndex: number,
  ) => unknown;
  getExerciseCompletedSets: (
    dayNumber: number,
    exerciseIndex: number,
  ) => unknown;
  isDayComplete: (dayNumber: number) => boolean;
  isDayLocked: (dayNumber: number) => boolean;
  getEstimatedTimeRemaining: (dayNumber: number) => number | null;
  getEstimatedEndTime: (dayNumber: number) => Date | null;
  getTotalSessionTime: () => number;
  getCurrentRestTime: () => number;
  getSessionAverageRestTime: (dayNumber: number) => number;
  /** Average rest for one exercise: this session's, else the learned history. */
  getExerciseRestTime: (dayNumber: number, exerciseIndex: number) => number | null;
  /** Which exercise the last logged set belongs to, i.e. what is being rested from. */
  getLastSetExercise: (dayNumber: number) => { index: number; name: string } | null;
  getSessionStats: (dayNumber: number) => unknown;
  updateExerciseName: (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    newName: string,
    newPrimaryMuscles?: string[],
    newSecondaryMuscles?: string[],
  ) => Promise<void>;
  updateExerciseMachines: (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    patch: MachinePatch,
  ) => Promise<void>;
  addExtraSetsToExercise: (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    additionalSets: number,
  ) => Promise<void>;
  addNewExercise: (
    dayNumber: number,
    split: string,
    exerciseData: {
      name: string;
      exerciseId?: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      sets: number;
      reps?: string;
    },
  ) => Promise<void>;
  fetchSessionHistory: (
    limit?: number,
    includeTimings?: boolean,
  ) => Promise<WorkoutSession[]>;
  /** Sessions with only their all-time-record sets, null when the server can't say. */
  fetchRecordSessions: () => Promise<WorkoutSession[] | null>;
  syncFromServer: () => Promise<void>;
  syncPendingData: () => Promise<void>;
  clearAllData: () => Promise<void>;
}

const WorkoutContext = createContext<WorkoutContextValue | undefined>(
  undefined,
);

export const useWorkout = (): WorkoutContextValue => {
  const context = useContext(WorkoutContext);
  if (!context)
    throw new Error("useWorkout must be used within a WorkoutProvider");
  return context;
};

interface WorkoutStore {
  get: () => WorkoutContextValue;
  set: (value: WorkoutContextValue) => void;
  subscribe: (listener: () => void) => () => void;
}

const createWorkoutStore = (initial: WorkoutContextValue): WorkoutStore => {
  let current = initial;
  const changes = createEmitter();
  return {
    get: () => current,
    set: (value) => {
      current = value;
      changes.trigger();
    },
    subscribe: changes.subscribe,
  };
};

const WorkoutStoreContext = createContext<WorkoutStore | null>(null);

/**
 * Like useWorkout(), but the caller re-renders only when one of `keys`
 * changes identity, not on every change to the workout state.
 */
export const useWorkoutPick = <K extends keyof WorkoutContextValue>(
  ...keys: K[]
): Pick<WorkoutContextValue, K> => {
  const store = useContext(WorkoutStoreContext);
  if (!store)
    throw new Error("useWorkoutPick must be used within a WorkoutProvider");
  const cache = useRef<Pick<WorkoutContextValue, K> | null>(null);
  const getSnapshot = () => {
    const value = store.get();
    const prev = cache.current;
    if (prev && keys.every((key) => Object.is(prev[key], value[key])))
      return prev;
    const next = {} as Pick<WorkoutContextValue, K>;
    for (const key of keys) next[key] = value[key];
    cache.current = next;
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot);
};

// isSyncing/pendingSyncs live in their own context so the 30s background-sync
// tick doesn't re-render every useWorkout() consumer. Only SettingsScreen
// (the one place that displays sync status) subscribes to this.
interface WorkoutSyncStatus {
  pendingSyncs: PendingSync[];
  isSyncing: boolean;
  droppedSyncs: DroppedSync[];
  droppedSyncCount: number;
  acknowledgeDroppedSyncs: () => void;
}

const WorkoutSyncStatusContext = createContext<WorkoutSyncStatus | undefined>(
  undefined,
);

export const useWorkoutSyncStatus = (): WorkoutSyncStatus => {
  const context = useContext(WorkoutSyncStatusContext);
  if (!context)
    throw new Error(
      "useWorkoutSyncStatus must be used within a WorkoutProvider",
    );
  return context;
};

const INACTIVITY_WARNING_ID = "workout-inactivity-warning";

const scheduleInactivityWarning = (
  lastSetEndTime: string,
  warningMs: number,
): Promise<void> =>
  scheduleReminder(INACTIVITY_WARNING_ID, async (Notifications) => {
    const fireAt = new Date(lastSetEndTime).getTime() + warningMs;
    if (!Number.isFinite(fireAt) || fireAt <= Date.now()) return null;
    if (!(await initializeSupplementNotifications(false))) return null;

    const minutes = Math.floor(warningMs / 60000);
    return {
      content: {
        title: `⚠️ Inactive workout detected`,
        body: `No sets logged in ${minutes} minutes. Your session will end in another ${minutes} minutes unless activity resumes.`,
        data: { type: "session_inactivity_warning" },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" && {
          channelId: WORKOUT_TIMER_CHANNEL,
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    };
  }).catch((err: unknown) => {
    console.warn("Failed to schedule inactivity warning:", err);
    log.warn("workout.inactivity_warning_failed", {
      reason: (err as Error).message,
    });
  });

function applyIfSet<T>(value: T | null | undefined, set: (value: T) => void) {
  if (value) set(value);
}

/** null rather than NaN, so a corrupt stored number is ignored instead of applied. */
function intOrNull(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const WorkoutProvider = ({
  children,
  actAs,
}: {
  children: ReactNode;
  /** Log against another user's account, which requires their `trainer` grant. */
  actAs?: { userId: string; username: string };
}) => {
  const { user, logout, consented } = useAuth();
  const authToken = useAuthToken();
  const userId = actAs?.userId ?? user?.id ?? null;

  const api = useMemo(() => {
    if (!actAs) return { workoutApi, programApi };
    const traineeHttp = traineeFetch(actAs.userId);
    // These are the raw online factories, so nothing but this check stops a
    // trainee provider from issuing real network calls in offline mode.
    const http: typeof traineeHttp = async (url, options) => {
      if (await isServerless()) throw new Error("TRAINER_MODE_REQUIRES_ONLINE");
      return traineeHttp(url, options);
    };
    return {
      workoutApi: makeWorkoutApi(http),
      programApi: makeProgramApi(http),
    };
  }, [actAs]);

  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(null);
  const [dayOverride, setDayOverride] = useState<DayOverride | null>(null);
  const [selectedSplit, setSelectedSplit] = useState<string | null>(null);
  const [currentDay, setCurrentDay] = useState(1);
  const currentDayRef = useRef(currentDay);
  currentDayRef.current = currentDay;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const [completedDays, setCompletedDays] = useState<CompletedDays>({});
  const [lockedDays, setLockedDays] = useState<LockedDays>({});
  const [unlockedOverrides, setUnlockedOverrides] = useState<
    Record<number, boolean>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const [timeBetweenSets, setTimeBetweenSets] = useState(120);
  const [useManualTime, setUseManualTime] = useState(true);
  const [restHistory, setRestHistory] = useState<RestHistory>({});

  const [workoutStartTime, setWorkoutStartTime] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [lastSetEndTime, setLastSetEndTime] = useState<string | null>(null);
  const [lastActivityTime, setLastActivityTime] = useState<number | null>(null);

  const sessionData = useMemo(
    () => (workoutStartTime ? applyDayOverride(workoutData, dayOverride) : workoutData),
    [workoutData, dayOverride, workoutStartTime],
  );

  const [serverAnalytics, setServerAnalytics] =
    useState<ServerAnalyticsType>(null);
  const [pendingSyncs, setPendingSyncs] = useState<PendingSync[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  const hasSyncedRef = useRef(false);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lbs">("kg");
  const [activeTrainer, setActiveTrainer] = useState<string | null>(null);

  const currentDayAllExercises = useMemo((): JointExerciseEntry[] => {
    if (!sessionData?.days || !currentDay) return [];
    const day = sessionData.days.find(
      (d: WorkoutDay) => d.dayNumber === currentDay,
    );
    if (!day?.split) return [];
    const result: JointExerciseEntry[] = [];
    Object.entries(day.split).forEach(([split, splitWorkout]) => {
      (splitWorkout?.exercises ?? []).forEach((ex: Exercise) => {
        result.push({ name: ex.name, sets: ex.sets ?? 0, split });
      });
    });
    return result;
  }, [sessionData, currentDay]);

  const jointSessionMessageHandlerRef = useRef<
    ((msg: WebSocketMessage) => void) | null
  >(null);

  const handleSocketMessage = useCallback((msg: WebSocketMessage) => {
    if (isTrainerEvent(msg)) onTrainerEvent.trigger(msg);
    jointSessionMessageHandlerRef.current?.(msg);
  }, []);

  const socket = useRealtimeSocket({
    // From AuthContext, not a one-shot read: the silent refresh replaces the
    // token roughly hourly, and a socket holding the old one is rejected and
    // then refuses to retry until the token changes.
    token: authToken || null,
    accountId: userId,
    enabled: !!userId && consented && !actAs,
    onMessage: handleSocketMessage,
  });

  // The hook refuses to reconnect with a token the server already rejected, so
  // without this the user has no signal that joint sessions, watching and
  // trainer events have stopped working.
  const liveFeaturesWarnedRef = useRef(false);
  useEffect(() => {
    if (!socket.authError && !socket.connectionFailed) {
      liveFeaturesWarnedRef.current = false;
      return;
    }
    if (liveFeaturesWarnedRef.current) return;
    liveFeaturesWarnedRef.current = true;
    showToast("Live features are offline. Reopen the app to reconnect.");
  }, [socket.authError, socket.connectionFailed]);

  // On boot, both the selectedSplit-change effect and the stale-session-check
  // effect can call this in the same tick (the latter needs fresh numbers
  // after auto-ending a stale session), so coalesce overlapping calls into one.
  const fetchAnalyticsInFlightRef = useRef<Promise<void> | null>(null);
  const analyticsScopeRef = useRef<string | null>(null);
  const fetchAnalytics = useCallback(async () => {
    const scope = `${selectedSplit}:${currentDay}`;
    // Only coalesce with an in-flight call for the *same* split/day. Otherwise
    // a split change mid-flight would be handed the previous split's numbers.
    if (fetchAnalyticsInFlightRef.current && analyticsScopeRef.current === scope)
      return fetchAnalyticsInFlightRef.current;
    analyticsScopeRef.current = scope;
    const run = (async () => {
      try {
        const analytics = await api.workoutApi.getAnalytics(
          selectedSplit,
          currentDay,
        );
        if (analyticsScopeRef.current !== scope) return;
        if (analytics) setServerAnalytics(analytics);
      } catch (error) {
        console.error("Error fetching analytics:", error);
        metric.count("analytics.fetch_failed");
        captureException(error, { stage: "fetchAnalytics" });
      } finally {
        fetchAnalyticsInFlightRef.current = null;
      }
    })();
    fetchAnalyticsInFlightRef.current = run;
    return run;
  }, [selectedSplit, currentDay, api]);

  // Automatic mode now learns from the user's own per-exercise rest. The server
  // average it used to read counted the walk between stations as rest, and
  // added set duration on top of it.
  useEffect(() => {
    if (useManualTime) return;
    const learned = pooledRestHistory(restHistory);
    if (learned !== null) setTimeBetweenSets(learned);
  }, [useManualTime, restHistory]);

  const syncManager = useSyncManager({
    pendingSyncs,
    setPendingSyncs,
    isSyncing,
    setIsSyncing,
    currentSessionId,
    setCurrentSessionId,
    userId,
    saveToStorage,
    STORAGE_KEYS,
    useManualTime,
    fetchAnalytics,
    workoutApi: api.workoutApi,
  });

  // A dropped op is lost data, and its only other trace is a badge in
  // Settings that nobody opens after a workout.
  const droppedSeenRef = useRef(0);
  useEffect(() => {
    const total = syncManager.droppedSyncs.length;
    if (total <= droppedSeenRef.current) {
      droppedSeenRef.current = total;
      return;
    }
    const lost = total - droppedSeenRef.current;
    droppedSeenRef.current = total;
    showToast(
      `${lost} workout update${lost === 1 ? "" : "s"} couldn't be saved to the server. See Settings › Sync.`,
    );
  }, [syncManager.droppedSyncs]);

  const addPendingSync = useCallback(
    async (sync: PendingSync) => {
      if (actAs) {
        log.warn("trainer.offline_write_refused", { type: sync.type });
        throw traineeWriteRefused();
      }
      await syncManager.addPendingSync(sync);
    },
    [actAs, syncManager],
  );

  const sessionOps = useSessionOperations({
    workoutStartTime,
    setWorkoutStartTime,
    currentSessionId,
    setCurrentSessionId,
    lastSetEndTime,
    setLastSetEndTime,
    lastActivityTime,
    setLastActivityTime,
    currentDay,
    selectedSplit,
    workoutData: sessionData,
    completedDays,
    setCompletedDays,
    lockedDays,
    setLockedDays,
    unlockedOverrides,
    setUnlockedOverrides,
    userId,
    saveToStorage,
    removeFromStorage,
    STORAGE_KEYS,
    addPendingSync,
    removePendingSyncs: syncManager.removePendingSyncs,
    canQueueOffline: !actAs,
    useManualTime,
    fetchAnalytics,
    syncPendingData: syncManager.syncPendingData,
    pendingSyncs,
    workoutApi: api.workoutApi,
  });

  const programOps = useProgramOperations({
    workoutData,
    setWorkoutData,
    userId,
    saveToStorage,
    STORAGE_KEYS,
    programApi: api.programApi,
  });

  const serverSync = useServerSync({
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
    clearActiveWorkout: sessionOps.clearActiveWorkout,
    workoutApi: api.workoutApi,
    programApi: api.programApi,
  });

  const serverSyncRef = useRef(serverSync);
  serverSyncRef.current = serverSync;

  const saveWorkoutData = useCallback(
    async (data: WorkoutData | null) => {
      await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, data, userId);
      setWorkoutData(data);
    },
    [userId],
  );

  const saveSelectedSplit = useCallback(
    async (split: string) => {
      await saveToStorage(STORAGE_KEYS.SELECTED_SPLIT, split, userId);
      setSelectedSplit(split);
    },
    [userId],
  );

  const sessionOpsRef = useRef(sessionOps);
  sessionOpsRef.current = sessionOps;

  const saveDayOverride = useCallback(
    async (override: DayOverride | null) => {
      if (override) {
        await saveToStorage(STORAGE_KEYS.SESSION_DAY_OVERRIDE, override, userId);
      } else {
        await removeFromStorage(STORAGE_KEYS.SESSION_DAY_OVERRIDE, userId);
      }
      setDayOverride(override);
    },
    [userId],
  );

  const relabelSession = useCallback(
    async (sessionId: string, day: number) => {
      const dayTitle = workoutData?.days?.find(
        (d) => d.dayNumber === day,
      )?.dayTitle;
      const queue = () =>
        addPendingSync({
          type: "updateSessionDay",
          data: { sessionId, dayNumber: day, dayTitle },
          timestamp: getLocalISOString(),
        });
      try {
        if (isLocalSessionId(sessionId)) return await queue();
        try {
          await api.workoutApi.updateSessionDay(sessionId, day, dayTitle);
        } catch (error) {
          if (!isSessionGone(error)) await queue();
        }
      } catch (error) {
        log.warn("workout.session_relabel_failed", { error: String(error) });
        captureException(error, { stage: "relabelSession" });
      }
    },
    [api, workoutData, addPendingSync],
  );

  const moveSessionToDay = useCallback(
    async (day: number) => {
      const split = selectedSplit ?? "";
      const moved = carryOverDay({
        fromExercises: dayExercises(sessionData, currentDay, split),
        toExercises: dayExercises(workoutData, day, split),
        completedDays,
        fromDay: currentDay,
        toDay: day,
        split,
      });
      await saveToStorage(STORAGE_KEYS.COMPLETED_DAYS, moved.completedDays, userId);
      setCompletedDays(moved.completedDays);
      await saveDayOverride(moved.override);
      if (currentSessionId) await relabelSession(currentSessionId, day);
      metric.count("workout.session_day_changed");
    },
    [
      selectedSplit,
      sessionData,
      workoutData,
      currentDay,
      completedDays,
      userId,
      saveDayOverride,
      currentSessionId,
      relabelSession,
    ],
  );

  const saveCurrentDay = useCallback(
    async (day: number) => {
      if (day !== currentDay && workoutStartTime) await moveSessionToDay(day);
      await saveToStorage(STORAGE_KEYS.CURRENT_DAY, day.toString(), userId);
      setCurrentDay(day);
      try {
        await api.programApi.setCurrentDay(day);
      } catch (error) {
        log.warn("program.current_day_push_failed", { error: String(error) });
        captureException(error, { stage: "pushCurrentDay" });
      }
    },
    [api, userId, currentDay, workoutStartTime, moveSessionToDay],
  );

  useEffect(() => {
    if (!isLoading && !workoutStartTime && dayOverride) void saveDayOverride(null);
  }, [isLoading, workoutStartTime, dayOverride, saveDayOverride]);

  // Plan exercises are appended after the day's last exercise, where carried-over
  // exercises sit, so their logs have to shift one slot to stay attached.
  const addNewExercise = useCallback<WorkoutContextValue["addNewExercise"]>(
    async (dayNumber, split, exerciseData) => {
      const override =
        workoutStartTime &&
        dayOverride?.dayNumber === dayNumber &&
        dayOverride.split === split &&
        dayOverride.carried.length > 0
          ? dayOverride
          : null;
      if (override) {
        const planLength = dayExercises(workoutData, dayNumber, split).length;
        const shifted = Object.fromEntries(
          Object.entries(completedDays[dayNumber] ?? {}).map(([i, sets]) => [
            Number(i) >= planLength ? Number(i) + 1 : Number(i),
            sets,
          ]),
        );
        const next = { ...completedDays, [dayNumber]: shifted };
        await saveToStorage(STORAGE_KEYS.COMPLETED_DAYS, next, userId);
        setCompletedDays(next);
      }
      await programOps.addNewExercise(dayNumber, split, exerciseData);
    },
    [workoutStartTime, dayOverride, workoutData, completedDays, userId, programOps],
  );

  const addExtraSetsToExercise = useCallback<
    WorkoutContextValue["addExtraSetsToExercise"]
  >(
    async (dayNumber, split, exerciseIndex, additionalSets) => {
      const planLength = dayExercises(workoutData, dayNumber, split).length;
      const override =
        workoutStartTime &&
        dayOverride?.dayNumber === dayNumber &&
        dayOverride.split === split
          ? dayOverride
          : null;
      if (override && exerciseIndex >= planLength) {
        const carried = override.carried.map((ex, i) =>
          i === exerciseIndex - planLength
            ? { ...ex, sets: Math.max(1, ex.sets + additionalSets) }
            : ex,
        );
        await saveDayOverride({ ...override, carried });
        return;
      }
      if (override?.minSets[exerciseIndex]) {
        const minSets = {
          ...override.minSets,
          [exerciseIndex]: Math.max(
            1,
            override.minSets[exerciseIndex] + additionalSets,
          ),
        };
        await saveDayOverride({ ...override, minSets });
      }
      await programOps.addExtraSetsToExercise(
        dayNumber,
        split,
        exerciseIndex,
        additionalSets,
      );
    },
    [workoutStartTime, dayOverride, workoutData, saveDayOverride, programOps],
  );

  const saveCompletedDays = useCallback(
    async (completed: CompletedDays) => {
      await saveToStorage(STORAGE_KEYS.COMPLETED_DAYS, completed, userId);
      setCompletedDays(completed);
    },
    [userId],
  );

  const saveLockedDays = useCallback(
    async (locked: LockedDays) => {
      await saveToStorage(STORAGE_KEYS.LOCKED_DAYS, locked, userId);
      setLockedDays(locked);
    },
    [userId],
  );

  const saveUnlockedOverrides = useCallback(
    async (overrides: Record<number, boolean>) => {
      await saveToStorage(STORAGE_KEYS.UNLOCKED_OVERRIDES, overrides, userId);
      setUnlockedOverrides(overrides);

      setCompletedDays((prev: CompletedDays) => {
        const next = { ...prev };
        let changed = false;
        Object.keys(overrides).forEach((dayNumberStr) => {
          const key = Number(dayNumberStr);
          if (next[key]) {
            delete next[key];
            changed = true;
          }
        });
        if (changed) {
          void saveToStorage(STORAGE_KEYS.COMPLETED_DAYS, next, userId);
          return next;
        }
        return prev;
      });
    },
    [userId],
  );

  const saveTimeBetweenSets = useCallback(
    async (seconds: number) => {
      await saveToStorage(
        STORAGE_KEYS.TIME_BETWEEN_SETS,
        seconds.toString(),
        userId,
      );
      setTimeBetweenSets(seconds);
    },
    [userId],
  );

  const toggleUseManualTime = useCallback(
    async (enabled: boolean) => {
      await saveToStorage(
        STORAGE_KEYS.USE_MANUAL_TIME,
        enabled.toString(),
        userId,
      );
      setUseManualTime(enabled);
      if (!enabled && selectedSplit) await fetchAnalytics();
    },
    [userId, selectedSplit, fetchAnalytics],
  );

  const saveWeightUnit = useCallback(
    async (unit: "kg" | "lbs") => {
      await saveToStorage(STORAGE_KEYS.WEIGHT_UNIT, unit, userId);
      setWeightUnit(unit);
    },
    [userId],
  );

  const resetAllState = useCallback(() => {
    setWorkoutData(null);
    setDayOverride(null);
    setSelectedSplit(null);
    setCurrentDay(1);
    setCompletedDays({});
    setLockedDays({});
    setUnlockedOverrides({});
    setWorkoutStartTime(null);
    setCurrentSessionId(null);
    setLastSetEndTime(null);
    setLastActivityTime(null);
    setTimeBetweenSets(120);
    setUseManualTime(true);
    setPendingSyncs([]);
    setServerAnalytics(null);
    setWeightUnit("kg");
    setIsLoading(false);
  }, []);

  const checkMondayReset = useCallback(
    async (resetDate: string | null, sessionActive: boolean) => {
      try {
        const newMondayDate = shouldResetForMonday(resetDate);
        if (!newMondayDate) return;
        // Deliberately not even seeding the marker: a workout opened before
        // midnight Sunday is still being logged into completedDays, and wiping
        // it mid-session throws those sets away. Retried on the next load.
        if (sessionActive) return;
        // Without a previous reset date there is no way to tell which week the
        // stored progress belongs to, so seed the marker instead of wiping it.
        if (resetDate) {
          console.info(
            "Resetting completed days and locked days for new week!",
          );
          const empty: CompletedDays = {};
          await saveToStorage(STORAGE_KEYS.COMPLETED_DAYS, empty, userId);
          await saveToStorage(STORAGE_KEYS.LOCKED_DAYS, {}, userId);
          setCompletedDays(empty);
          setLockedDays({});
        }
        await saveToStorage(
          STORAGE_KEYS.LAST_RESET_DATE,
          newMondayDate,
          userId,
        );
      } catch (error) {
        console.error("Error checking Monday reset:", error);
        captureException(error, { stage: "checkMondayReset" });
      }
    },
    [userId],
  );

  const fetchFallbackProgram = useCallback(async () => {
    try {
      const saved = await api.programApi.fetchSavedProgram();
      // Only `days` is required: the offline store stamps `success`, the
      // server does not, and demanding it drops a perfectly good program.
      if (saved?.days?.length) {
        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, saved, userId);
        return saved;
      }
    } catch (error) {
      if ((error as Error)?.message === "SESSION_EXPIRED") await logout();
      else captureException(error, { stage: "fetchSavedProgram" });
    }
    return null;
  }, [userId, logout, api]);

  // A trainee's split choice is stored on their own device, so infer it from their
  // latest logged session, falling back to the program's first split.
  const resolveTraineeSplit = useCallback(
    async (data: WorkoutData | null): Promise<string | null> => {
      try {
        const [recent] = await api.workoutApi.getSessionHistory(null, null, 1);
        if (recent?.split) return recent.split;
      } catch (error) {
        log.warn("trainer.split_lookup_failed", { error: String(error) });
        captureException(error, { stage: "trainerSplitLookup" });
      }
      return (
        data?.split?.[0] ?? Object.keys(data?.days?.[0]?.split ?? {})[0] ?? null
      );
    },
    [api],
  );

  const loadSavedData = useCallback(async () => {
    try {
      const raw = await loadMultipleFromStorage(
        [
          STORAGE_KEYS.WORKOUT_DATA,
          STORAGE_KEYS.SELECTED_SPLIT,
          STORAGE_KEYS.CURRENT_DAY,
          STORAGE_KEYS.COMPLETED_DAYS,
          STORAGE_KEYS.LOCKED_DAYS,
          STORAGE_KEYS.UNLOCKED_OVERRIDES,
          STORAGE_KEYS.LAST_RESET_DATE,
          STORAGE_KEYS.TIME_BETWEEN_SETS,
          STORAGE_KEYS.REST_BY_EXERCISE,
          STORAGE_KEYS.WORKOUT_START_TIME,
          STORAGE_KEYS.CURRENT_SESSION_ID,
          STORAGE_KEYS.USE_MANUAL_TIME,
          STORAGE_KEYS.LAST_ACTIVITY_TIME,
          STORAGE_KEYS.LAST_SET_END_TIME,
          STORAGE_KEYS.WEIGHT_UNIT,
          STORAGE_KEYS.SESSION_DAY_OVERRIDE,
        ],
        userId,
      );
      // One truncated value (a write killed mid-flight) must not take the
      // whole load down with it. That would lose program, progress and the
      // active session together.
      const json = <T,>(key: string): T | null => {
        if (!raw[key]) return null;
        try {
          return JSON.parse(raw[key]) as T;
        } catch (error) {
          console.error(`Corrupt stored value for ${key}, skipping:`, error);
          captureException(error, { stage: "loadSavedData", key });
          return null;
        }
      };
      const str = (key: string): string | null => raw[key] ?? null;

      const resolvedData =
        json<WorkoutData>(STORAGE_KEYS.WORKOUT_DATA) ??
        (await fetchFallbackProgram());
      if (resolvedData) {
        setWorkoutData(resolvedData);
      }

      const split =
        str(STORAGE_KEYS.SELECTED_SPLIT) ??
        (actAs ? await resolveTraineeSplit(resolvedData) : null);
      const day = str(STORAGE_KEYS.CURRENT_DAY);
      const completed = json<CompletedDays>(STORAGE_KEYS.COMPLETED_DAYS);
      const locked = json<LockedDays>(STORAGE_KEYS.LOCKED_DAYS);
      const overrides = json<Record<number, boolean>>(
        STORAGE_KEYS.UNLOCKED_OVERRIDES,
      );
      const timeBetween = str(STORAGE_KEYS.TIME_BETWEEN_SETS);
      const storedRestHistory = json<RestHistory>(STORAGE_KEYS.REST_BY_EXERCISE);
      const startTime = str(STORAGE_KEYS.WORKOUT_START_TIME);
      const manualTime = str(STORAGE_KEYS.USE_MANUAL_TIME);
      const syncs = await loadPendingSyncs(userId);
      const activity = str(STORAGE_KEYS.LAST_ACTIVITY_TIME);
      const setEndTime = str(STORAGE_KEYS.LAST_SET_END_TIME);
      const weightUnitLoaded = str(STORAGE_KEYS.WEIGHT_UNIT);

      const serverless = await isServerless();
      const storedSessionId = str(STORAGE_KEYS.CURRENT_SESSION_ID);
      const sessionIdUsable =
        !storedSessionId || isSessionIdForMode(storedSessionId, serverless);
      // The app mode changed while this session was open. Its id belongs to the
      // other store, so every set logged against it would fail. Drop the whole
      // active session rather than restore one that cannot be written to.
      const sessionId = sessionIdUsable ? storedSessionId : null;
      const startTimeUsable = sessionIdUsable ? startTime : null;
      if (!sessionIdUsable) {
        await removeMultipleFromStorage(
          [STORAGE_KEYS.CURRENT_SESSION_ID, STORAGE_KEYS.WORKOUT_START_TIME],
          userId,
        );
      }

      applyIfSet(split, setSelectedSplit);
      const localDay = day ? intOrNull(day) : null;
      if (localDay !== null) {
        currentDayRef.current = localDay;
        setCurrentDay(localDay);
      }
      applyIfSet(completed, setCompletedDays);
      applyIfSet(locked, setLockedDays);
      applyIfSet(overrides, setUnlockedOverrides);
      applyIfSet(timeBetween, (v) => applyIfSet(intOrNull(v), setTimeBetweenSets));
      applyIfSet(storedRestHistory, setRestHistory);
      applyIfSet(startTimeUsable, setWorkoutStartTime);
      if (startTimeUsable) {
        applyIfSet(json<DayOverride>(STORAGE_KEYS.SESSION_DAY_OVERRIDE), setDayOverride);
      }
      applyIfSet(sessionId, setCurrentSessionId);
      applyIfSet(manualTime, (v) => setUseManualTime(v === "true"));
      if (syncs.length > 0) setPendingSyncs(syncs);
      applyIfSet(activity, (v) => applyIfSet(intOrNull(v), setLastActivityTime));
      applyIfSet(setEndTime, setLastSetEndTime);
      if (weightUnitLoaded === "kg" || weightUnitLoaded === "lbs") {
        setWeightUnit(weightUnitLoaded);
      }

      if (!actAs) {
        await checkMondayReset(
          str(STORAGE_KEYS.LAST_RESET_DATE),
          !!startTimeUsable,
        );
      }

      // Kept off the loading path: on a bad signal this waits out the full
      // request timeout. A late answer must not undo a day the user picked since.
      if (!serverless) {
        const dayAtLoad = localDay ?? currentDayRef.current;
        void api.programApi
          .getCurrentDay()
          .then(async (remoteDay) => {
            if (
              remoteDay === null ||
              remoteDay === dayAtLoad ||
              userIdRef.current !== userId ||
              currentDayRef.current !== dayAtLoad
            )
              return;
            setCurrentDay(remoteDay);
            await saveToStorage(
              STORAGE_KEYS.CURRENT_DAY,
              remoteDay.toString(),
              userId,
            );
          })
          .catch(reportAndReturn(null, { stage: "loadCurrentDay" }));
      }
    } catch (error) {
      console.error("Error loading saved data:", error);
      captureException(error, { stage: "loadSavedData" });
    } finally {
      setIsLoading(false);
    }
  }, [
    api.programApi,
    checkMondayReset,
    userId,
    fetchFallbackProgram,
    actAs,
    resolveTraineeSplit,
  ]);

  const checkAndEndStaleSession = useCallback(async (): Promise<boolean> => {
    if (!workoutStartTime || !currentSessionId) return false;
    // A workout where nothing was logged has no lastSetEndTime. Fall back to
    // its start time so it still goes stale instead of remaining open forever.
    if (isSessionInactive(lastSetEndTime ?? workoutStartTime)) {
      console.info("🔍 Detected stale session, auto-ending...");
      await sessionOps.endWorkout(true);
      console.info("✅ Stale session ended");
      return true;
    }
    return false;
  }, [workoutStartTime, currentSessionId, lastSetEndTime, sessionOps]);

  const clearAllData = useCallback(async () => {
    if (!userId) return;
    const keys = Object.values(STORAGE_KEYS);
    await cancelAllSupplementReminders(userId);
    await hideHydrationNotification();
    await deletePhotoFilesFor(userId);
    await removeMultipleFromStorage(keys, userId);
    // The named keys are only this feature's. Everything tracking-related is
    // in kv_records and in keys this list doesn't know about.
    await clearUserData(userId);
    resetAllState();
  }, [userId, resetAllState]);

  const hasActiveSession = useCallback(
    () =>
      !!workoutStartTime &&
      !!currentSessionId &&
      !isDayLocked(lockedDays, currentDay),
    [workoutStartTime, currentSessionId, lockedDays, currentDay],
  );

  const getRestByExercise = useCallback(
    (dayNumber: number): Record<number, ExerciseRest> =>
      calculateRestByExercise(completedDays, dayNumber, workoutStartTime),
    [completedDays, workoutStartTime],
  );

  const exerciseNamesForDay = useCallback(
    (dayNumber: number): string[] =>
      dayExercises(sessionData, dayNumber, selectedSplit ?? "").map(
        (e) => e.name,
      ),
    [sessionData, selectedSplit],
  );

  /** This session's measured rest for the exercise, else what it usually is. */
  const getExerciseRestTime = useCallback(
    (dayNumber: number, exerciseIndex: number): number | null => {
      const measured = getRestByExercise(dayNumber)[exerciseIndex];
      if (measured) return measured.averageSec;
      const name = exerciseNamesForDay(dayNumber)[exerciseIndex];
      return (name ? restHistory[name] : undefined) ?? null;
    },
    [getRestByExercise, exerciseNamesForDay, restHistory],
  );

  const getLastSetExercise = useCallback(
    (dayNumber: number) => {
      const index = getLastSetExerciseIndex(completedDays, dayNumber);
      if (index === null) return null;
      const name = exerciseNamesForDay(dayNumber)[index];
      return name ? { index, name } : null;
    },
    [completedDays, exerciseNamesForDay],
  );

  const getEstimatedTimeRemainingForDay = useCallback(
    (dayNumber: number) =>
      getEstimatedTimeRemaining({
        workoutData: sessionData,
        selectedSplit,
        dayNumber,
        completedDays,
        timeBetweenSets,
        sessionRestByExercise: getRestByExercise(dayNumber),
        restHistory,
      }),
    [
      completedDays,
      timeBetweenSets,
      sessionData,
      selectedSplit,
      getRestByExercise,
      restHistory,
    ],
  );

  const getEstimatedEndTimeForDay = useCallback(
    (dayNumber: number): Date | null => {
      if (!workoutStartTime) return null;
      const remainingSeconds = getEstimatedTimeRemainingForDay(dayNumber);
      return getEstimatedEndTime(remainingSeconds);
    },
    [workoutStartTime, getEstimatedTimeRemainingForDay],
  );

  const getTotalSessionTime = useCallback(
    () => calculateSessionTime(workoutStartTime),
    [workoutStartTime],
  );
  const getCurrentRestTime = useCallback(
    () => calculateRestTime(lastSetEndTime),
    [lastSetEndTime],
  );
  const getSessionAverageRestTime = useCallback(
    (dayNumber: number) =>
      calculateSessionAverageRest(
        completedDays,
        dayNumber,
        workoutStartTime,
        timeBetweenSets,
      ),
    [completedDays, workoutStartTime, timeBetweenSets],
  );
  const getSessionStats = useCallback(
    (dayNumber: number) =>
      getSessionStatistics(
        workoutStartTime,
        lastSetEndTime,
        completedDays,
        dayNumber,
        sessionData,
        selectedSplit,
        timeBetweenSets,
      ),
    [
      workoutStartTime,
      lastSetEndTime,
      completedDays,
      sessionData,
      selectedSplit,
      timeBetweenSets,
    ],
  );

  const isSetCompleteFunc = useCallback(
    (dayNumber: number, exerciseIndex: number, setIndex: number) =>
      isSetComplete(completedDays, dayNumber, exerciseIndex, setIndex),
    [completedDays],
  );
  const getSetDetailsFunc = useCallback(
    (dayNumber: number, exerciseIndex: number, setIndex: number) =>
      getSetDetails(completedDays, dayNumber, exerciseIndex, setIndex),
    [completedDays],
  );
  const getExerciseCompletedSetsFunc = useCallback(
    (dayNumber: number, exerciseIndex: number) =>
      getExerciseCompletedSets(completedDays, dayNumber, exerciseIndex),
    [completedDays],
  );
  const isDayCompleteFunc = useCallback(
    (dayNumber: number) =>
      isDayComplete(
        lockedDays,
        dayNumber,
        sessionData,
        selectedSplit,
        completedDays,
      ),
    [lockedDays, sessionData, selectedSplit, completedDays],
  );
  const isDayLockedFunc = useCallback(
    (dayNumber: number) => isDayLocked(lockedDays, dayNumber),
    [lockedDays],
  );

  const onUserChange = useEffectEvent((id: typeof userId) => {
    if (id) void loadSavedData();
    else resetAllState();
  });
  useEffect(() => onUserChange(userId), [userId]);

  useEffect(() => {
    if (selectedSplit && !useManualTime && userId) void fetchAnalytics();
  }, [selectedSplit, currentDay, useManualTime, userId, fetchAnalytics]);

  // There is no connectivity listener anywhere in the app, so this poll is the
  // only thing that drains the queue after the network comes back. Depending on
  // `pendingSyncs` would restart the timer on every queued op, starving the
  // sync for as long as the user keeps training. syncPendingData already
  // no-ops on an empty queue or an in-flight run, so don't gate on the queue.
  const syncPendingDataRef = useRef(syncManager.syncPendingData);
  syncPendingDataRef.current = syncManager.syncPendingData;

  useEffect(() => {
    if (!userId || !consented || actAs) return;
    let syncInterval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      syncInterval ??= setInterval(
        () => void syncPendingDataRef.current(),
        30_000,
      );
    };
    const stop = () => {
      if (syncInterval) clearInterval(syncInterval);
      syncInterval = null;
    };

    if (AppState.currentState === "active") start();
    // Backgrounded, the poll only wakes the device to find the same queue it
    // left. Foregrounding drains it once immediately to cover the gap.
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return stop();
      void syncPendingDataRef.current();
      start();
    });

    return () => {
      stop();
      sub.remove();
    };
  }, [userId, consented, actAs]);

  const cleanupQueueOnLoad = useEffectEvent(() => {
    if (pendingSyncs.length > 0) void syncManager.cleanupInvalidSyncs();
  });
  useEffect(() => {
    if (!isLoading && userId && !actAs) cleanupQueueOnLoad();
  }, [isLoading, userId, actAs]);

  const endStaleSessionOnLoad = useEffectEvent(async () => {
    const hadStaleSession = await checkAndEndStaleSession();
    if (hadStaleSession && !useManualTime && selectedSplit)
      await fetchAnalytics();
  });
  useEffect(() => {
    if (!isLoading) void endStaleSessionOnLoad();
  }, [isLoading]);

  const pullFromServerOnce = useEffectEvent(() => {
    if (!workoutData || hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    void serverSync.syncFromServer();
  });
  useEffect(() => {
    if (!isLoading && userId && consented && selectedSplit) pullFromServerOnce();
  }, [isLoading, userId, consented, selectedSplit]);

  useEffect(() => {
    hasSyncedRef.current = false;
  }, [selectedSplit, userId]);

  const hasWorkoutData = !!workoutData;

  // Without this the server is pulled once per (user, split) for the whole app
  // lifetime, so a workout logged on another device never shows up here.
  useEffect(() => {
    if (isLoading || !userId || !selectedSplit || !hasWorkoutData || actAs)
      return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void serverSyncRef.current.syncFromServer();
    });
    return () => sub.remove();
  }, [isLoading, userId, selectedSplit, actAs, hasWorkoutData]);

  useEffect(() => {
    setActiveTrainer(null);
    if (!actAs) void restoreActiveTrainee(userId);
  }, [userId, actAs]);

  useEffect(() => {
    // Inside a trainee provider `userId` is the trainee's, so an unguarded
    // subscription would match the trainer's own events and banner them back
    // at the trainer. The banner only belongs on the trainee's own device.
    if (!userId || actAs) return;
    let syncTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = onTrainerEvent.subscribe((e: TrainerEvent) => {
      if (e.traineeId !== userId) return;
      if (
        e.type === "trainer_set_recorded" ||
        e.type === "trainer_session_started"
      )
        setActiveTrainer(e.trainerUsername);
      if (e.type === "trainer_session_ended") setActiveTrainer(null);
      if (syncTimer) clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        syncTimer = null;
        void serverSyncRef.current.syncFromServer();
      }, 1000);
    });
    return () => {
      unsubscribe();
      if (syncTimer) clearTimeout(syncTimer);
    };
  }, [userId, actAs]);

  useEffect(() => {
    if (!workoutStartTime || !currentSessionId) return;
    if (actAs) return;

    const interval = setInterval(() => {
      void checkAndEndStaleSession();
    }, 60_000);

    return () => clearInterval(interval);
  }, [workoutStartTime, currentSessionId, checkAndEndStaleSession, actAs]);

  // Scheduled with the OS rather than from the interval above, which JS stops
  // running once the app is backgrounded, exactly when this warning matters.
  useEffect(() => {
    if (actAs) return;
    if (!workoutStartTime || !currentSessionId || !lastSetEndTime) {
      void cancelReminder(INACTIVITY_WARNING_ID);
      return;
    }

    void scheduleInactivityWarning(
      lastSetEndTime,
      Math.floor(INACTIVITY_THRESHOLD_MS / 2),
    );
    return () => {
      void cancelReminder(INACTIVITY_WARNING_ID);
    };
  }, [workoutStartTime, currentSessionId, lastSetEndTime, actAs]);

  // The server's 30-minute sweep ends idle workouts on its own. Without this the
  // app kept showing a live workout whose server row was closed, and every set
  // logged after it 404'd. The local timer above only fires while the app is in
  // the foreground, so it can't be relied on to catch the same moment.
  const { subscribe: subscribeSocket, send: sendSocket } = socket;
  useEffect(() => {
    if (!currentSessionId || actAs) return;
    return subscribeSocket((msg) => {
      if (msg.type !== "session_auto_ended") return;
      if (String(msg.sessionId) !== currentSessionId) return;
      // Re-ending a closed workout is a server-side no-op, so this reuses the
      // normal path (day locked, analytics refreshed) rather than a second one.
      void sessionOpsRef.current.endWorkout(true);
    });
  }, [currentSessionId, actAs, subscribeSocket]);

  // Depend on sendSocket (stable across messages) rather than the socket
  // object itself (a fresh reference on every message) so these (and the
  // memoised value below, which depends on them) don't churn on every
  // incoming WebSocket message.
  const startWorkout = useCallback(
    (): Promise<string | null> => sessionOps.startWorkout(),
    [sessionOps],
  );

  // Announced from an effect rather than at startWorkout: a session queued
  // offline only gets its server id when the sync queue replays, and one
  // announced while the socket was still connecting never went out at all,
  // leaving friends unable to watch a workout that is plainly live.
  const announcedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    if (actAs || !workoutStartTime || !currentSessionId) return;
    if (isLocalSessionId(currentSessionId)) return;
    if (isOfflineSessionId(currentSessionId)) return;
    if (announcedSessionRef.current === currentSessionId) return;
    if (sendSocket({ type: "session_started", sessionId: currentSessionId })) {
      announcedSessionRef.current = currentSessionId;
    }
  }, [actAs, workoutStartTime, currentSessionId, socket.connected, sendSocket]);

  /** Before endWorkout, since it clears workoutStartTime, and rest is unmeasurable without it. */
  const learnRestFromSession = useCallback(async () => {
    const sessionRest = getRestByExercise(currentDay);
    if (Object.keys(sessionRest).length === 0) return;
    const names = exerciseNamesForDay(currentDay);
    const merged = mergeRestHistory(restHistory, sessionRest, (i) => names[i]);
    setRestHistory(merged);
    await saveToStorage(
      STORAGE_KEYS.REST_BY_EXERCISE,
      JSON.stringify(merged),
      userId,
    );
  }, [
    getRestByExercise,
    currentDay,
    exerciseNamesForDay,
    restHistory,
    userId,
  ]);

  const endWorkout = useCallback(
    async (autoCompleted = false) => {
      await learnRestFromSession();
      const result = await sessionOps.endWorkout(autoCompleted);
      // Only when the session really ended: announcing an end that was refused
      // (a trainer write, a failed server call) leaves watchers looking at a
      // workout the owner is still logging into.
      if (result) {
        announcedSessionRef.current = null;
        sendSocket({ type: "session_ended" });
      }
      return result;
    },
    [sessionOps, sendSocket, learnRestFromSession],
  );

  const syncFromServer = useCallback(async (): Promise<void> => {
    await serverSync.syncFromServer();
  }, [serverSync]);

  const value = useMemo<WorkoutContextValue>(
    () => ({
      userId,
      activeTrainer,
      actAs: actAs ?? null,
      workoutData,
      sessionWorkoutData: sessionData,
      selectedSplit,
      currentDay,
      completedDays,
      lockedDays,
      unlockedOverrides,
      isLoading,
      timeBetweenSets,
      workoutStartTime,
      currentSessionId,
      serverAnalytics,
      useManualTime,
      lastActivityTime,
      lastSetEndTime,
      weightUnit,
      saveWorkoutData,
      saveSelectedSplit,
      saveCurrentDay,
      saveCompletedDays,
      saveLockedDays,
      saveUnlockedOverrides,
      saveTimeBetweenSets,
      toggleUseManualTime,
      hasActiveSession,
      startWorkout,
      endWorkout,
      saveWeightUnit,
      saveSetDetails: sessionOps.saveSetDetails,
      deleteSetDetails: sessionOps.deleteSetDetails,
      clearActiveWorkout: sessionOps.clearActiveWorkout,
      isSetComplete: isSetCompleteFunc,
      getSetDetails: getSetDetailsFunc,
      getExerciseCompletedSets: getExerciseCompletedSetsFunc,
      isDayComplete: isDayCompleteFunc,
      isDayLocked: isDayLockedFunc,
      getEstimatedTimeRemaining: getEstimatedTimeRemainingForDay,
      getEstimatedEndTime: getEstimatedEndTimeForDay,
      getTotalSessionTime,
      getCurrentRestTime,
      getSessionAverageRestTime,
      getExerciseRestTime,
      getLastSetExercise,
      getSessionStats,
      updateExerciseName: programOps.updateExerciseName,
      updateExerciseMachines: programOps.updateExerciseMachines,
      addExtraSetsToExercise,
      addNewExercise,
      fetchSessionHistory: serverSync.fetchSessionHistory,
      fetchRecordSessions: serverSync.fetchRecordSessions,
      syncFromServer,
      syncPendingData: syncManager.syncPendingData,
      clearAllData,
    }),
    [
      userId,
      activeTrainer,
      actAs,
      workoutData,
      sessionData,
      selectedSplit,
      currentDay,
      completedDays,
      lockedDays,
      unlockedOverrides,
      isLoading,
      timeBetweenSets,
      workoutStartTime,
      currentSessionId,
      serverAnalytics,
      useManualTime,
      lastActivityTime,
      lastSetEndTime,
      weightUnit,
      saveWorkoutData,
      saveSelectedSplit,
      saveCurrentDay,
      saveCompletedDays,
      saveLockedDays,
      saveUnlockedOverrides,
      saveTimeBetweenSets,
      toggleUseManualTime,
      hasActiveSession,
      startWorkout,
      endWorkout,
      saveWeightUnit,
      sessionOps.saveSetDetails,
      sessionOps.deleteSetDetails,
      sessionOps.clearActiveWorkout,
      isSetCompleteFunc,
      getSetDetailsFunc,
      getExerciseCompletedSetsFunc,
      isDayCompleteFunc,
      isDayLockedFunc,
      getEstimatedTimeRemainingForDay,
      getEstimatedEndTimeForDay,
      getTotalSessionTime,
      getCurrentRestTime,
      getSessionAverageRestTime,
      getExerciseRestTime,
      getLastSetExercise,
      getSessionStats,
      programOps.updateExerciseName,
      programOps.updateExerciseMachines,
      addExtraSetsToExercise,
      addNewExercise,
      serverSync.fetchSessionHistory,
      serverSync.fetchRecordSessions,
      syncFromServer,
      syncManager.syncPendingData,
      clearAllData,
    ],
  );

  const syncStatusValue = useMemo<WorkoutSyncStatus>(
    () => ({
      pendingSyncs,
      isSyncing,
      droppedSyncs: syncManager.droppedSyncs,
      droppedSyncCount: syncManager.droppedSyncCount,
      acknowledgeDroppedSyncs: syncManager.acknowledgeDroppedSyncs,
    }),
    [
      pendingSyncs,
      isSyncing,
      syncManager.droppedSyncs,
      syncManager.droppedSyncCount,
      syncManager.acknowledgeDroppedSyncs,
    ],
  );

  const storeRef = useRef<WorkoutStore | null>(null);
  storeRef.current ??= createWorkoutStore(value);
  const store = storeRef.current;
  useLayoutEffect(() => {
    store.set(value);
  }, [store, value]);

  const body = actAs ? (
    children
  ) : (
    <JointSessionProvider
      socket={socket}
      messageHandlerRef={jointSessionMessageHandlerRef}
      userId={userId}
      currentSessionId={currentSessionId}
      workoutStartTime={workoutStartTime}
      currentDayExercises={currentDayAllExercises}
      selectedSplit={selectedSplit}
    >
      {children}
    </JointSessionProvider>
  );

  return (
    <WorkoutContext.Provider value={value}>
      <WorkoutStoreContext.Provider value={store}>
        <WorkoutSyncStatusContext.Provider value={syncStatusValue}>
          {body}
        </WorkoutSyncStatusContext.Provider>
      </WorkoutStoreContext.Provider>
    </WorkoutContext.Provider>
  );
};
