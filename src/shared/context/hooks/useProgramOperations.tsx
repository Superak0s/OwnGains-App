import { useCallback, useMemo } from "react";
import { programApi as defaultProgramApi } from "@features/plan/services/index";
import type { ProgramApi } from "@features/plan/services/programApiFactory";
import {
  CUSTOM_EXERCISE_ID,
  type Exercise,
  type WorkoutData,
  type WorkoutDay,
} from "../../types";
import { matchExercise } from "@utils/exerciseDb";
import { captureException, log, metric } from "../../services/crashReporting";
import { markProgramDirty } from "../../services/programDirty";

import type { MachinePatch } from "@features/plan/types";

export type { MachinePatch };

export interface NewExerciseData {
  name: string;
  exerciseId?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  sets: number;
  reps?: string;
}

/**
 * Database id for an exact database name. Anything else is the user's own
 * wording, i.e. a custom exercise the plan matcher must not review.
 */
const exactExerciseId = (name: string): string => {
  const hit = matchExercise(name);
  return hit.status === "confident" && hit.candidates[0]?.score === 1
    ? hit.candidates[0].exercise.id
    : CUSTOM_EXERCISE_ID;
};

/** Builds a plan exercise from what the user entered. */
export const buildExercise = (exerciseData: NewExerciseData): Exercise => ({
  name: exerciseData.name,
  exerciseId: exerciseData.exerciseId ?? exactExerciseId(exerciseData.name),
  primaryMuscles: exerciseData.primaryMuscles ?? [],
  secondaryMuscles: exerciseData.secondaryMuscles ?? [],
  sets: exerciseData.sets,
  reps: exerciseData.reps,
});

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
  /**
   * The program is a client's, edited by their trainer. A refused write is
   * undone locally and rejects, since the client's server copy is the truth.
   */
  forTrainee?: boolean;
}

export interface UseProgramOperationsReturn {
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
    exerciseData: NewExerciseData,
  ) => Promise<void>;
}

export const useProgramOperations = ({
  workoutData,
  setWorkoutData,
  userId,
  saveToStorage,
  STORAGE_KEYS,
  programApi = defaultProgramApi,
  forTrainee = false,
}: UseProgramOperationsOptions): UseProgramOperationsReturn => {
  const serverWriteFailed = useCallback(
    async (op: string, err: unknown): Promise<void> => {
      if (forTrainee) {
        if (workoutData) {
          await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, workoutData, userId);
          setWorkoutData(workoutData);
        }
        throw err;
      }
      console.warn(`Could not sync ${op} to server:`, err);
      log.warn("program.server_sync_failed", {
        op,
        reason: (err as Error).message,
      });
      // The server now has an older program, so the next sync must push this
      // edit up instead of merging the stale copy back over it.
      await markProgramDirty(userId);
    },
    [forTrainee, workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS],
  );

  /**
   * Applies `edit` to a copy of one day, saves it on the device, then sends it to the server.
   *
   * @param edit - Changes the day in place and returns the server write, or nothing to cancel.
   */
  const editProgram = useCallback(
    async (
      op: string,
      dayNumber: number,
      edit: (day: WorkoutDay) => (() => Promise<unknown>) | undefined,
    ): Promise<void> => {
      try {
        if (!workoutData?.days) return;

        const updatedData = structuredClone(workoutData);
        const day = updatedData.days.find((d) => d.dayNumber === dayNumber);
        const push = day && edit(day);
        if (!push) return;

        await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, updatedData, userId);
        setWorkoutData(updatedData);

        try {
          await push();
        } catch (err) {
          await serverWriteFailed(op, err);
        }
      } catch (error) {
        if (forTrainee) throw error;
        console.error(`Program edit ${op} failed:`, error);
        metric.count("program.edit_failed", 1, { attributes: { op } });
        captureException(error, { op });
      }
    },
    [workoutData, setWorkoutData, userId, saveToStorage, STORAGE_KEYS, forTrainee, serverWriteFailed],
  );

  const updateExerciseName = useCallback<UseProgramOperationsReturn["updateExerciseName"]>(
    (dayNumber, split, exerciseIndex, newName, newPrimaryMuscles, newSecondaryMuscles) =>
      editProgram("renameExercise", dayNumber, (day) => {
        const exercise = day.split[split]?.exercises?.[exerciseIndex];
        if (!exercise) return;
        // The old id still points at whatever the exercise used to be, so a
        // rename has to re-resolve it.
        const exerciseId = exactExerciseId(newName);
        exercise.name = newName;
        exercise.exerciseId = exerciseId;
        if (newPrimaryMuscles !== undefined) exercise.primaryMuscles = newPrimaryMuscles;
        if (newSecondaryMuscles !== undefined) exercise.secondaryMuscles = newSecondaryMuscles;
        return () =>
          programApi.renameExercise(
            dayNumber,
            split,
            exerciseIndex,
            newName,
            newPrimaryMuscles,
            newSecondaryMuscles,
            exerciseId,
          );
      }),
    [editProgram, programApi],
  );

  const updateExerciseMachines = useCallback<UseProgramOperationsReturn["updateExerciseMachines"]>(
    (dayNumber, split, exerciseIndex, patch) =>
      editProgram("updateMachines", dayNumber, (day) => {
        const target = day.split[split]?.exercises?.[exerciseIndex];
        if (!target) return;
        Object.assign(target, patch);
        if (patch.selectedMachine === null) delete target.selectedMachine;
        if (patch.defaultMachine === null) delete target.defaultMachine;
        return () => programApi.updateExerciseMachines(dayNumber, split, exerciseIndex, patch);
      }),
    [editProgram, programApi],
  );

  const addExtraSetsToExercise = useCallback<UseProgramOperationsReturn["addExtraSetsToExercise"]>(
    (dayNumber, split, exerciseIndex, additionalSets) =>
      editProgram("patchExerciseSets", dayNumber, (day) => {
        const exercise = day.split[split]?.exercises?.[exerciseIndex];
        if (!exercise) return;
        // A removal must not take an exercise below one set.
        const delta = Math.max(additionalSets, 1 - exercise.sets);
        if (delta === 0) return;
        exercise.sets += delta;
        day.split[split].totalSets += delta;
        return () => programApi.patchExerciseSets(dayNumber, split, exerciseIndex, delta);
      }),
    [editProgram, programApi],
  );

  const addNewExercise = useCallback<UseProgramOperationsReturn["addNewExercise"]>(
    (dayNumber, split, exerciseData) =>
      editProgram("addExercise", dayNumber, (day) => {
        day.split[split] ??= { exercises: [], totalSets: 0 };
        const newExercise = buildExercise(exerciseData);
        day.split[split].exercises.push(newExercise);
        day.split[split].totalSets += exerciseData.sets;
        return () => programApi.addExercise(dayNumber, split, newExercise);
      }),
    [editProgram, programApi],
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
