import { useCallback, useMemo } from "react";
import { programApi as defaultProgramApi } from "@features/plan/services/index";
import type { ProgramApi } from "@features/plan/services/programApiFactory";
import { CUSTOM_EXERCISE_ID, type WorkoutData } from "../../types";
import { matchExercise } from "@utils/exerciseDb";
import { captureException, log, metric } from "../../services/crashReporting";
import { markProgramDirty } from "../../services/programDirty";

import type { MachinePatch } from "@features/plan/types";

export type { MachinePatch };

interface UseProgramOperationsOptions {
  workoutData: WorkoutData | null;
  setWorkoutData: (data: WorkoutData) => void;
  userId: string | null;
  saveToStorage: (
    key: string,
    value: unknown,
    userId: string | null,
  ) => Promise<boolean>;
  STORAGE_KEYS: { WORKOUT_DATA: string };
  programApi?: ProgramApi;
}

interface UseProgramOperationsReturn {
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
}

export const useProgramOperations = ({
  workoutData,
  setWorkoutData,
  userId,
  saveToStorage,
  STORAGE_KEYS,
  programApi = defaultProgramApi,
}: UseProgramOperationsOptions): UseProgramOperationsReturn => {
  const updateExerciseName = useCallback(
    async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      newName: string,
      newPrimaryMuscles?: string[],
      newSecondaryMuscles?: string[],
    ): Promise<void> => {
      try {
        if (!workoutData?.days) return;

        const updatedData = structuredClone(workoutData);
        const dayIndex = updatedData.days.findIndex(
          (d) => d.dayNumber === dayNumber,
        );
        if (dayIndex === -1) return;

        const day = updatedData.days[dayIndex];
        if (!day.split[split]?.exercises?.[exerciseIndex]) return;

        // The old id still points at whatever the exercise used to be, so a
        // rename has to re-resolve it. Only an exact database name is taken.
        // Anything else is the user's own wording, i.e. a custom exercise.
        const hit = matchExercise(newName);
        const newExerciseId =
          hit.status === "confident" && hit.candidates[0]?.score === 1
            ? hit.candidates[0].exercise.id
            : CUSTOM_EXERCISE_ID;

        day.split[split].exercises[exerciseIndex].name = newName;
        day.split[split].exercises[exerciseIndex].exerciseId = newExerciseId;
        if (newPrimaryMuscles !== undefined) {
          day.split[split].exercises[exerciseIndex].primaryMuscles =
            newPrimaryMuscles;
        }
        if (newSecondaryMuscles !== undefined) {
          day.split[split].exercises[exerciseIndex].secondaryMuscles =
            newSecondaryMuscles;
        }

        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, updatedData, userId);
        setWorkoutData(updatedData);

        try {
          await programApi.renameExercise(
            dayNumber,
            split,
            exerciseIndex,
            newName,
            newPrimaryMuscles,
            newSecondaryMuscles,
            newExerciseId,
          );
        } catch (err) {
          console.warn(
            "Could not sync exercise rename to server:",
            err,
          );
          log.warn("program.server_sync_failed", {
            op: "renameExercise",
            reason: (err as Error).message,
          });
          // The server now has an older program, so the next sync must push this
          // edit up instead of merging the stale copy back over it.
          await markProgramDirty(userId);
        }
      } catch (error) {
        console.error("Error updating exercise name:", error);
        metric.count("program.edit_failed", 1, {
          attributes: { op: "renameExercise" },
        });
        captureException(error, { op: "renameExercise" });
      }
    },
    [workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS, programApi],
  );

  const updateExerciseMachines = useCallback(
    async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      patch: MachinePatch,
    ): Promise<void> => {
      try {
        if (!workoutData?.days) return;

        const updatedData = structuredClone(workoutData);
        const day = updatedData.days.find((d) => d.dayNumber === dayNumber);
        const target = day?.split[split]?.exercises?.[exerciseIndex];
        if (!target) return;

        Object.assign(target, patch);
        if (patch.selectedMachine === null) delete target.selectedMachine;
        if (patch.defaultMachine === null) delete target.defaultMachine;

        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, updatedData, userId);
        setWorkoutData(updatedData);

        try {
          await programApi.updateExerciseMachines(
            dayNumber,
            split,
            exerciseIndex,
            patch,
          );
        } catch (err) {
          console.warn(
            "Could not sync machine settings to server:",
            err,
          );
          log.warn("program.server_sync_failed", {
            op: "updateMachines",
            reason: (err as Error).message,
          });
          // The server now has an older program, so the next sync must push this
          // edit up instead of merging the stale copy back over it.
          await markProgramDirty(userId);
        }
      } catch (error) {
        console.error("Error updating exercise machines:", error);
        metric.count("program.edit_failed", 1, {
          attributes: { op: "updateMachines" },
        });
        captureException(error, { op: "updateMachines" });
      }
    },
    [workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS, programApi],
  );

  const addExtraSetsToExercise = useCallback(
    async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      additionalSets: number,
    ): Promise<void> => {
      try {
        if (!workoutData?.days) return;

        const updatedData = structuredClone(workoutData);
        const dayIndex = updatedData.days.findIndex(
          (d) => d.dayNumber === dayNumber,
        );
        if (dayIndex === -1) return;

        const day = updatedData.days[dayIndex];
        if (!day.split[split]?.exercises?.[exerciseIndex]) return;

        const exercise = day.split[split].exercises[exerciseIndex];
        // A removal must not take an exercise below one set.
        const delta = Math.max(additionalSets, 1 - exercise.sets);
        if (delta === 0) return;
        exercise.sets += delta;
        day.split[split].totalSets += delta;

        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, updatedData, userId);
        setWorkoutData(updatedData);

        try {
          await programApi.patchExerciseSets(
            dayNumber,
            split,
            exerciseIndex,
            delta,
          );
        } catch (err) {
          console.warn(
            "Could not sync set count change to server:",
            err,
          );
          log.warn("program.server_sync_failed", {
            op: "patchExerciseSets",
            reason: (err as Error).message,
          });
          // The server now has an older program, so the next sync must push this
          // edit up instead of merging the stale copy back over it.
          await markProgramDirty(userId);
        }
      } catch (error) {
        console.error("Error adding extra sets:", error);
        metric.count("program.edit_failed", 1, {
          attributes: { op: "patchExerciseSets" },
        });
        captureException(error, { op: "patchExerciseSets" });
      }
    },
    [workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS, programApi],
  );

  const addNewExercise = useCallback(
    async (
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
    ): Promise<void> => {
      try {
        if (!workoutData?.days) return;

        const updatedData = structuredClone(workoutData);
        const dayIndex = updatedData.days.findIndex(
          (d) => d.dayNumber === dayNumber,
        );
        if (dayIndex === -1) return;

        const day = updatedData.days[dayIndex];
        if (!day.split[split]) {
          day.split[split] = { exercises: [], totalSets: 0 };
        }

        // An imported id takes precedence. Otherwise an exact database name resolves to its
        // entry, exactly as a rename does. Anything else is the user's own
        // wording, i.e. a custom exercise the plan matcher must not review.
        const hit = matchExercise(exerciseData.name);
        const newExercise = {
          name: exerciseData.name,
          exerciseId:
            exerciseData.exerciseId ??
            (hit.status === "confident" && hit.candidates[0]?.score === 1
              ? hit.candidates[0].exercise.id
              : CUSTOM_EXERCISE_ID),
          primaryMuscles: exerciseData.primaryMuscles ?? [],
          secondaryMuscles: exerciseData.secondaryMuscles ?? [],
          sets: exerciseData.sets,
          reps: exerciseData.reps,
        };

        day.split[split].exercises.push(newExercise);
        day.split[split].totalSets += exerciseData.sets;

        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, updatedData, userId);
        setWorkoutData(updatedData);

        try {
          await programApi.addExercise(dayNumber, split, newExercise);
        } catch (err) {
          console.warn(
            "Could not sync new exercise to server:",
            err,
          );
          log.warn("program.server_sync_failed", {
            op: "addExercise",
            reason: (err as Error).message,
          });
          // The server now has an older program, so the next sync must push this
          // edit up instead of merging the stale copy back over it.
          await markProgramDirty(userId);
        }
      } catch (error) {
        console.error("Error adding new exercise:", error);
        metric.count("program.edit_failed", 1, {
          attributes: { op: "addExercise" },
        });
        captureException(error, { op: "addExercise" });
      }
    },
    [workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS, programApi],
  );

  return useMemo(
    () => ({
      updateExerciseName,
      updateExerciseMachines,
      addExtraSetsToExercise,
      addNewExercise,
    }),
    [
      updateExerciseName,
      updateExerciseMachines,
      addExtraSetsToExercise,
      addNewExercise,
    ],
  );
};
