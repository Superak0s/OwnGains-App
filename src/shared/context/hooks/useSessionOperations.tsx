import { useCallback, useMemo, useRef } from "react";
import { Alert } from "react-native";
import {
  getLocalISOString,
  isLocalSessionId,
  isSessionGone,
} from "../../../utils/session";
import { generateId } from "../../../utils/format";
import { workoutApi as defaultWorkoutApi } from "@features/workout/services/index";
import type { WorkoutApi } from "@features/workout/services/workoutApiFactory";
import type { WorkoutData, PendingSync } from "../../types";
import type { CompletedDays, LockedDays } from "../../../utils/dayCompletion";
import {
  metric,
  log,
  captureException,
  trackWorkoutCompleted,
} from "../../services/crashReporting";
import { userFacingError } from "../../services/apiError";

export const TRAINEE_WRITE_REFUSED_MESSAGE =
  "You need to be online to log for a trainee. This set was not saved.";

// Writing for a trainee must never fall back to the offline queue: a `local_`
// id created here would belong to the trainer's device but the trainee's
// account. The marker lets callers roll back their optimistic state and tell
// the user, instead of the refusal being swallowed as a generic failure.
export const traineeWriteRefused = (): Error =>
  Object.assign(new Error(TRAINEE_WRITE_REFUSED_MESSAGE), {
    traineeWriteRefused: true,
  });

export const isTraineeWriteRefused = (error: unknown): error is Error =>
  (error as { traineeWriteRefused?: boolean } | null)?.traineeWriteRefused ===
  true;

interface UseSessionOperationsOptions {
  workoutStartTime: string | null;
  setWorkoutStartTime: (time: string | null) => void;
  currentSessionId: string | null;
  setCurrentSessionId: (id: string | null) => void;
  lastSetEndTime: string | null;
  setLastSetEndTime: (time: string | null) => void;
  lastActivityTime: number | null;
  setLastActivityTime: (time: number | null) => void;
  currentDay: number;
  selectedSplit: string | null;
  workoutData: WorkoutData | null;
  completedDays: CompletedDays;
  setCompletedDays: (days: CompletedDays) => void;
  lockedDays: LockedDays;
  setLockedDays: (days: LockedDays) => void;
  unlockedOverrides: Record<number, boolean>;
  setUnlockedOverrides: (overrides: Record<number, boolean>) => void;
  userId: string | null;
  saveToStorage: (
    key: string,
    value: unknown,
    userId: string | null,
  ) => Promise<boolean>;
  removeFromStorage: (key: string, userId: string | null) => Promise<boolean>;
  STORAGE_KEYS: {
    LAST_ACTIVITY_TIME: string;
    LAST_SET_END_TIME: string;
    LOCKED_DAYS: string;
    UNLOCKED_OVERRIDES: string;
    WORKOUT_START_TIME: string;
    CURRENT_SESSION_ID: string;
    COMPLETED_DAYS: string;
    PENDING_SYNCS: string;
  };
  addPendingSync: (sync: PendingSync) => Promise<void>;
  removePendingSyncs?: (
    match: (sync: PendingSync) => boolean,
  ) => Promise<number>;
  canQueueOffline?: boolean;
  useManualTime: boolean;
  fetchAnalytics?: (() => Promise<void>) | null;
  syncPendingData?: (() => Promise<void>) | null;
  pendingSyncs: PendingSync[];
  workoutApi?: WorkoutApi;
}

export interface SetDetailsOptions {
  note?: string;
  isWarmup?: boolean;
  rir?: number;
}

interface UseSessionOperationsReturn {
  updateLastActivityTime: () => Promise<void>;
  clearActiveWorkout: () => Promise<void>;
  startWorkout: () => Promise<string | null>;
  endWorkout: (autoCompleted?: boolean) => Promise<boolean>;
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
}

export const useSessionOperations = ({
  workoutStartTime,
  setWorkoutStartTime,
  currentSessionId,
  setCurrentSessionId,
  lastSetEndTime,
  setLastSetEndTime,
  setLastActivityTime,
  currentDay,
  selectedSplit,
  workoutData,
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
  removePendingSyncs,
  canQueueOffline = true,
  useManualTime,
  fetchAnalytics,
  syncPendingData,
  pendingSyncs,
  workoutApi = defaultWorkoutApi,
}: UseSessionOperationsOptions): UseSessionOperationsReturn => {
  const updateLastActivityTime = useCallback(async (): Promise<void> => {
    const now = Date.now();
    await saveToStorage(STORAGE_KEYS.LAST_ACTIVITY_TIME, now, userId);
    setLastActivityTime(now);
  }, [saveToStorage, STORAGE_KEYS, userId, setLastActivityTime]);

  const lockDay = useCallback(
    async (dayNumber: number): Promise<void> => {
      try {
        const newLockedDays = { ...lockedDays, [dayNumber]: true };
        await saveToStorage(STORAGE_KEYS.LOCKED_DAYS, newLockedDays, userId);
        setLockedDays(newLockedDays);

        if (unlockedOverrides[dayNumber]) {
          const newOverrides = { ...unlockedOverrides };
          delete newOverrides[dayNumber];
          await saveToStorage(
            STORAGE_KEYS.UNLOCKED_OVERRIDES,
            newOverrides,
            userId,
          );
          setUnlockedOverrides(newOverrides);
        }
      } catch (error) {
        console.error("Error locking day:", error);
      }
    },
    [
      lockedDays,
      setLockedDays,
      unlockedOverrides,
      setUnlockedOverrides,
      userId,
      saveToStorage,
      STORAGE_KEYS,
    ],
  );

  const clearActiveWorkout = useCallback(async (): Promise<void> => {
    try {
      console.debug("Clearing active workout session...");

      await removeFromStorage(STORAGE_KEYS.WORKOUT_START_TIME, userId);
      await removeFromStorage(STORAGE_KEYS.CURRENT_SESSION_ID, userId);
      await removeFromStorage(STORAGE_KEYS.LAST_ACTIVITY_TIME, userId);
      await removeFromStorage(STORAGE_KEYS.LAST_SET_END_TIME, userId);

      setWorkoutStartTime(null);
      setCurrentSessionId(null);
      setLastSetEndTime(null);
      setLastActivityTime(null);

      console.info("✓ Active workout session cleared");
    } catch (error) {
      console.error("Error clearing active workout:", error);
    }
  }, [
    removeFromStorage,
    STORAGE_KEYS,
    userId,
    setWorkoutStartTime,
    setCurrentSessionId,
    setLastSetEndTime,
    setLastActivityTime,
  ]);

  // Guards against a double-tap (or any other concurrent caller) firing two
  // overlapping calls before the first one's setState has re-rendered,
  // both would otherwise read stale null currentSessionId/workoutStartTime
  // and each start a session on the server.
  const startWorkoutInFlightRef = useRef<Promise<string | null> | null>(null);
  // saveSetDetails' `lastSetEndTime` closure still holds the *previous*
  // session's value right after startWorkout clears it, so the first set of a
  // fresh session would be timed from the last set of the old one.
  const sessionStartTimeRef = useRef<string | null>(null);
  const startWorkoutImplRef = useRef<(() => Promise<string | null>) | null>(
    null,
  );

  const startWorkout = useCallback((): Promise<string | null> => {
    if (startWorkoutInFlightRef.current) {
      return startWorkoutInFlightRef.current;
    }
    const promise = startWorkoutImplRef.current!().finally(() => {
      startWorkoutInFlightRef.current = null;
    });
    startWorkoutInFlightRef.current = promise;
    return promise;
  }, []);

  const startWorkoutImpl = useCallback(async (): Promise<string | null> => {
    try {
      if (workoutStartTime && currentSessionId) {
        console.debug(
          "Workout already started, returning existing session ID:",
          currentSessionId,
        );
        return currentSessionId;
      }

      sessionStartTimeRef.current = null;
      // Resolve the day before anything is persisted: bailing out after
      // writing WORKOUT_START_TIME would leave hasActiveSession() reporting
      // an active workout that has no session behind it.
      const day = workoutData?.days?.find((d) => d.dayNumber === currentDay);
      if (!day) {
        console.error(
          "startWorkout: no matching day found for currentDay.",
          "workoutData may not be loaded yet, or currentDay is stale.",
          {
            currentDay,
            hasWorkoutData: !!workoutData,
            dayCount: workoutData?.days?.length,
          },
        );
        return null;
      }

      const startTime = getLocalISOString();
      sessionStartTimeRef.current = startTime;
      await saveToStorage(STORAGE_KEYS.WORKOUT_START_TIME, startTime, userId);
      setWorkoutStartTime(startTime);

      await updateLastActivityTime();

      let newSessionId: string | null = null;
      const localSessionId = generateId("local");

      const queueLocalSession = async (
        outcome: string,
        warning: string,
      ): Promise<string> => {
        if (!canQueueOffline) {
          // The start time was already persisted. Without a session id behind
          // it hasActiveSession() would report a workout that doesn't exist.
          await clearActiveWorkout();
          throw traineeWriteRefused();
        }
        await saveToStorage(
          STORAGE_KEYS.CURRENT_SESSION_ID,
          localSessionId,
          userId,
        );
        setCurrentSessionId(localSessionId);
        await addPendingSync({
          type: "startSession",
          localSessionId,
          data: {
            split: selectedSplit ?? "",
            dayNumber: currentDay,
            dayTitle: day.dayTitle,
            primaryMuscles: day.primaryMuscles,
            secondaryMuscles: day.secondaryMuscles,
          },
          timestamp: startTime,
        });
        console.warn(warning, localSessionId);
        metric.count("workout.session_started", 1, {
          attributes: { outcome },
        });
        return localSessionId;
      };

      try {
        const sessionId = await workoutApi.startSession(
          selectedSplit,
          currentDay,
          day.dayTitle,
          false,
          startTime,
        );

        if (sessionId) {
          newSessionId = String(sessionId);
          await saveToStorage(
            STORAGE_KEYS.CURRENT_SESSION_ID,
            newSessionId,
            userId,
          );
          setCurrentSessionId(newSessionId);
          console.info("✓ Session started, ID:", newSessionId);
          metric.count("workout.session_started", 1, {
            attributes: { outcome: "server" },
          });
        } else {
          console.error(
            "startSession resolved without a usable session ID, falling back to local session.",
            { sessionId },
          );
          newSessionId = await queueLocalSession(
            "queued_no_id",
            "⚠ Session queued for sync with local ID (no id returned):",
          );
          log.error("workout.start_session_no_id");
        }
      } catch (error) {
        console.error("Failed to start session:", error);
        newSessionId = await queueLocalSession(
          "queued_offline",
          "⚠ Session queued for sync with local ID:",
        );
      }

      await removeFromStorage(STORAGE_KEYS.LAST_SET_END_TIME, userId);
      setLastSetEndTime(null);
      return newSessionId;
    } catch (error) {
      metric.count("workout.session_start_failed");
      if (isTraineeWriteRefused(error)) throw error;
      // WORKOUT_START_TIME may already be persisted. Leaving it there reports
      // an active workout with no session to log sets into.
      await clearActiveWorkout();
      console.error("Error starting workout:", error);
      captureException(error, { stage: "startWorkout" });
      return null;
    }
  }, [
    workoutStartTime,
    currentSessionId,
    currentDay,
    selectedSplit,
    workoutData,
    saveToStorage,
    removeFromStorage,
    setWorkoutStartTime,
    setCurrentSessionId,
    setLastSetEndTime,
    updateLastActivityTime,
    addPendingSync,
    canQueueOffline,
    clearActiveWorkout,
    userId,
    STORAGE_KEYS,
    workoutApi,
  ]);
  startWorkoutImplRef.current = startWorkoutImpl;

  const endServerSession = useCallback(
    async (sessionId: string, auto: boolean): Promise<void> => {
      try {
        await workoutApi.endSession(sessionId, getLocalISOString());
        console.info("✓ Session ended");
        metric.count("workout.session_ended", 1, {
          attributes: { outcome: "server", auto },
        });
      } catch (error) {
        console.error("Failed to end session:", error);

        if (isSessionGone(error)) {
          console.warn("⚠ Session doesn't exist anymore, not queuing sync");
          return;
        }

        await addPendingSync({
          type: "endSession",
          data: { sessionId },
          timestamp: getLocalISOString(),
        });
        console.warn("⚠ endSession queued for sync");
        metric.count("workout.session_ended", 1, {
          attributes: { outcome: "queued", auto },
        });
      }
    },
    [addPendingSync, workoutApi],
  );

  /** Resolves true when the workout was actually ended, false when it failed. */
  const endWorkout = useCallback(
    async (autoCompleted: boolean = false): Promise<boolean> => {
      try {
        const sessionIdToEnd = currentSessionId;
        const isLocal = isLocalSessionId(sessionIdToEnd);

        if (isLocal && sessionIdToEnd) {
          // Queued against the local id on purpose: the replay remaps it to the
          // real server id once startSession syncs. Without this marker the
          // session is never ended server-side at all.
          await addPendingSync({
            type: "endSession",
            data: { sessionId: sessionIdToEnd },
            timestamp: getLocalISOString(),
          });
          console.warn(
            "⚠ Local session, will be ended when startSession syncs",
          );
          metric.count("workout.session_ended", 1, {
            attributes: { outcome: "local", auto: autoCompleted },
          });
        } else if (sessionIdToEnd) {
          await endServerSession(sessionIdToEnd, autoCompleted);
        }

        // After the session end, not before: a trainee write refused offline
        // throws out of the branches above, and a day locked first would stay
        // locked over a workout that never ended.
        await lockDay(currentDay);
        await clearActiveWorkout();
        if (workoutStartTime) {
          const exercises = Object.values(completedDays[currentDay] ?? {});
          trackWorkoutCompleted(Date.parse(workoutStartTime), {
            sets: exercises.reduce((n, sets) => n + Object.keys(sets).length, 0),
            exercises: exercises.filter((sets) => Object.keys(sets).length > 0).length,
            auto: autoCompleted,
          });
        }

        if (!useManualTime && fetchAnalytics) {
          await fetchAnalytics();
        }

        if (pendingSyncs.length > 0 && syncPendingData) {
          setTimeout(() => syncPendingData(), 1000);
        }

        return true;
      } catch (error) {
        if (isTraineeWriteRefused(error)) {
          // Only a trainer write hits this, and it can never succeed offline.
          // Leaving the session open leaves the trainer's device with a
          // workout it cannot close until the 30-minute sweep.
          await clearActiveWorkout();
          Alert.alert(
            "Workout not ended",
            isTraineeWriteRefused(error)
              ? error.message
              : userFacingError(error, "Could not end the workout."),
          );
          return false;
        }
        console.error("Error ending workout:", error);
        captureException(error, { stage: "endWorkout" });
        return false;
      }
    },
    [
      currentDay,
      currentSessionId,
      workoutStartTime,
      completedDays,
      pendingSyncs,
      addPendingSync,
      lockDay,
      clearActiveWorkout,
      endServerSession,
      syncPendingData,
      useManualTime,
      fetchAnalytics,
    ],
  );

  const saveSetDetails = useCallback(
    async (
      dayNumber: number,
      exerciseIndex: number,
      setIndex: number,
      weight: number,
      reps: number,
      details: SetDetailsOptions = {},
    ): Promise<void> => {
      const { note = "", isWarmup = false, rir } = details;
      let optimisticallyCompleted = false;
      try {
        let sessionId = currentSessionId;
        const startingNewSession = !workoutStartTime || !sessionId;
        if (startingNewSession) {
          console.debug("Starting new workout session...");
          sessionId = await startWorkout();
          console.debug("Workout session started, session ID:", sessionId);
        }

        // startWorkout() already stamps activity time when it starts a new
        // session, so avoid writing it twice in the same action.
        if (!startingNewSession) await updateLastActivityTime();

        const setStartTime = startingNewSession
          ? (sessionStartTimeRef.current ?? getLocalISOString())
          : lastSetEndTime || workoutStartTime || getLocalISOString();
        const setEndTime = getLocalISOString();

        const day = workoutData?.days?.find((d) => d.dayNumber === dayNumber);
        const exercise =
          day?.split?.[selectedSplit ?? ""]?.exercises?.[exerciseIndex];
        const exerciseName = exercise?.name ?? `Exercise ${exerciseIndex}`;
        const primaryMuscles = exercise?.primaryMuscles ?? [];
        const secondaryMuscles = exercise?.secondaryMuscles ?? [];
        const machineName =
          exercise?.selectedMachine ?? exercise?.defaultMachine ?? undefined;

        if (!sessionId) {
          console.error("No session ID available, set not saved");
          log.error("workout.set_without_session");
          Alert.alert(
            "Set not saved",
            "Couldn't start a workout session for this day. Reopen the workout and try again.",
          );
          return;
        }

        const newCompleted: CompletedDays = { ...completedDays };
        newCompleted[dayNumber] = { ...newCompleted[dayNumber] };
        newCompleted[dayNumber][exerciseIndex] = {
          ...newCompleted[dayNumber][exerciseIndex],
        };

        newCompleted[dayNumber][exerciseIndex][setIndex] = {
          weight: weight || 0,
          reps: reps || 0,
          completedAt: setEndTime,
          note: note || "",
          isWarmup: isWarmup || false,
          rir,
          machineName,
        };

        const savedLocally = await saveToStorage(
          STORAGE_KEYS.COMPLETED_DAYS,
          newCompleted,
          userId,
        );
        setCompletedDays(newCompleted);
        optimisticallyCompleted = true;
        if (!savedLocally) {
          log.error("workout.set_persist_failed", { dayNumber, setIndex });
          captureException(new Error("Set could not be saved to device storage"), {
            stage: "recordSet",
            dayNumber,
            setIndex,
          });
          Alert.alert(
            "Set may not be saved",
            "This set couldn't be written to this device's storage. It's on screen for now, but may be missing if the app restarts.",
          );
        }

        try {
          await workoutApi.recordSet(sessionId, {
            exerciseName,
            setIndex,
            startTime: setStartTime,
            endTime: setEndTime,
            weight,
            reps,
            note,
            isWarmup,
            rir,
            primaryMuscles,
            secondaryMuscles,
            machineName,
          });
          console.debug("✓ Set recorded");
          metric.count("workout.set_recorded", 1, {
            attributes: { outcome: "server" },
          });
        } catch (error) {
          console.error("Failed to record set:", error);
          await addPendingSync({
            type: "recordSet",
            data: {
              sessionId,
              exerciseName,
              primaryMuscles,
              secondaryMuscles,
              machineName,
              setIndex,
              startTime: setStartTime,
              endTime: setEndTime,
              weight: weight || 0,
              reps: reps || 0,
              note: note || "",
              isWarmup: isWarmup || false,
              rir,
            },
            timestamp: setEndTime,
          });
          console.warn("⚠ Set queued for sync");
          metric.count("workout.set_recorded", 1, {
            attributes: { outcome: "queued" },
          });
        }

        await saveToStorage(STORAGE_KEYS.LAST_SET_END_TIME, setEndTime, userId);
        setLastSetEndTime(setEndTime);
      } catch (error) {
        if (isTraineeWriteRefused(error)) {
          if (optimisticallyCompleted) {
            await saveToStorage(
              STORAGE_KEYS.COMPLETED_DAYS,
              completedDays,
              userId,
            );
            setCompletedDays(completedDays);
          }
          Alert.alert(
            "Set not saved",
            isTraineeWriteRefused(error)
              ? error.message
              : userFacingError(error, "Could not save that set."),
          );
          return;
        }
        console.error("Error saving set details:", error);
        captureException(error, { stage: "saveSetDetails" });
        throw error;
      }
    },
    [
      currentSessionId,
      workoutStartTime,
      lastSetEndTime,
      completedDays,
      setCompletedDays,
      setLastSetEndTime,
      startWorkout,
      updateLastActivityTime,
      addPendingSync,
      saveToStorage,
      workoutData,
      selectedSplit,
      userId,
      STORAGE_KEYS,
      workoutApi,
    ],
  );

  const deleteSetDetails = useCallback(
    async (
      dayNumber: number,
      exerciseIndex: number,
      setIndex: number,
    ): Promise<boolean> => {
      try {
        if (!completedDays[dayNumber]?.[exerciseIndex]?.[setIndex])
          return false;

        const newCompletedDays: CompletedDays = { ...completedDays };
        newCompletedDays[dayNumber] = { ...newCompletedDays[dayNumber] };
        newCompletedDays[dayNumber][exerciseIndex] = {
          ...newCompletedDays[dayNumber][exerciseIndex],
        };
        delete newCompletedDays[dayNumber][exerciseIndex][setIndex];

        if (
          Object.keys(newCompletedDays[dayNumber][exerciseIndex]).length === 0
        ) {
          delete newCompletedDays[dayNumber][exerciseIndex];
        }

        if (Object.keys(newCompletedDays[dayNumber]).length === 0) {
          delete newCompletedDays[dayNumber];
        }

        // Only the live session can be addressed server-side. A set on a past
        // day has no session id here and remains local-only.
        if (currentSessionId && dayNumber === currentDay) {
          const exerciseName = workoutData?.days?.find(
            (d) => d.dayNumber === dayNumber,
          )?.split?.[selectedSplit ?? ""]?.exercises?.[exerciseIndex]?.name;
          if (exerciseName) {
            await removePendingSyncs?.(
              (sync) =>
                sync.type === "recordSet" &&
                String(sync.data.sessionId) === String(currentSessionId) &&
                sync.data.exerciseName === exerciseName &&
                sync.data.setIndex === setIndex,
            );
            try {
              await workoutApi.deleteSet(
                currentSessionId,
                exerciseName,
                setIndex,
              );
            } catch (error) {
              if (!isSessionGone(error)) {
                console.error("Failed to delete set on the server:", error);
                captureException(error, { stage: "deleteSetDetails" });
                Alert.alert(
                  "Set removed here only",
                  "The set was removed from this device but the server still has it. It may reappear after the next sync.",
                );
              }
            }
          }
        }

        await saveToStorage(
          STORAGE_KEYS.COMPLETED_DAYS,
          newCompletedDays,
          userId,
        );
        setCompletedDays(newCompletedDays);
        return true;
      } catch (error) {
        console.error("Error deleting set details:", error);
        captureException(error, { stage: "deleteSetDetails" });
        return false;
      }
    },
    [
      completedDays,
      setCompletedDays,
      saveToStorage,
      userId,
      STORAGE_KEYS,
      currentSessionId,
      currentDay,
      workoutData,
      selectedSplit,
      workoutApi,
      removePendingSyncs,
    ],
  );

  return useMemo(
    () => ({
      updateLastActivityTime,
      clearActiveWorkout,
      startWorkout,
      endWorkout,
      saveSetDetails,
      deleteSetDetails,
    }),
    [
      updateLastActivityTime,
      clearActiveWorkout,
      startWorkout,
      endWorkout,
      saveSetDetails,
      deleteSetDetails,
    ],
  );
};
