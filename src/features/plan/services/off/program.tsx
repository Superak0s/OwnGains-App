import type { SavedProgram, ExercisePayload, MachinePatch } from "../../types"
import type { WorkoutData } from "@shared/types"
import {
  saveToStorage,
  loadFromStorage,
  removeFromStorage,
  STORAGE_KEYS,
} from "@shared/services/storage"
import { captureException, metric } from "@shared/services/crashReporting"
import { getRecordStoreUser } from "@shared/services/offlineHelpers"

const loadProgram = async (): Promise<SavedProgram | null> => {
  return loadFromStorage<SavedProgram>(
    STORAGE_KEYS.WORKOUT_DATA,
    getRecordStoreUser(),
  )
}

const reportFailure = (op: string, error: unknown): void => {
  metric.count("program.op_failed", 1, { attributes: { op, mode: "offline" } })
  captureException(error, { op, mode: "offline" })
}

const saveProgram = async (program: WorkoutData | SavedProgram): Promise<void> => {
  const ok = await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, program, getRecordStoreUser())
  if (!ok) throw new Error("Failed to save program to storage")
}

export const programApi = {
  saveProgram: async (program: WorkoutData): Promise<unknown> => {
    try {
      const toSave: WorkoutData = {
        totalDays: program.days.length,
        split: program.split ?? [],
        days: program.days,
      }
      await saveProgram(toSave)
      return { success: true, program: { success: true, ...toSave } }
    } catch (error) {
      console.warn(
        "programApi.saveProgram (offline) failed:",
        (error as Error).message,
      )
      reportFailure("saveProgram", error)
      throw error
    }
  },

  fetchSavedProgram: async (): Promise<SavedProgram | null> => {
    return loadProgram()
  },

  deleteProgram: async (): Promise<unknown> => {
    try {
      await removeFromStorage(STORAGE_KEYS.WORKOUT_DATA, getRecordStoreUser())
      return { success: true, message: "Program deleted successfully" }
    } catch (error) {
      console.error("Error deleting offline program:", error)
      reportFailure("deleteProgram", error)
      throw error
    }
  },

  renameExercise: async (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    newName: string,
    newPrimaryMuscles?: string[],
    newSecondaryMuscles?: string[],
    newExerciseId?: string | null,
  ): Promise<unknown> => {
    try {
      const program = await loadProgram()
      if (!program) throw new Error("No saved program")

      const days = program.days
      const day = days.find((d) => d.dayNumber === dayNumber)
      if (!day) throw new Error(`Day ${dayNumber} not found`)

      const splitData = day.split?.[split]
      const exercise = splitData?.exercises?.[exerciseIndex]
      if (!exercise) throw new Error(`Exercise ${exerciseIndex} not found`)

      exercise.name = newName
      if (newExerciseId !== undefined) exercise.exerciseId = newExerciseId
      if (newPrimaryMuscles !== undefined)
        exercise.primaryMuscles = newPrimaryMuscles
      if (newSecondaryMuscles !== undefined)
        exercise.secondaryMuscles = newSecondaryMuscles

      await saveProgram(program)
      return { success: true, program }
    } catch (error) {
      console.warn(
        "programApi.renameExercise (offline) failed:",
        (error as Error).message,
      )
      reportFailure("renameExercise", error)
      throw error
    }
  },

  updateExerciseMachines: async (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    patch: MachinePatch,
  ): Promise<unknown> => {
    try {
      const program = await loadProgram()
      if (!program) throw new Error("No saved program")

      const exercise = program.days.find((d) => d.dayNumber === dayNumber)
        ?.split?.[split]?.exercises?.[exerciseIndex]
      if (!exercise) throw new Error(`Exercise ${exerciseIndex} not found`)

      Object.assign(exercise, patch)
      if (patch.selectedMachine === null) delete exercise.selectedMachine
      if (patch.defaultMachine === null) delete exercise.defaultMachine
      await saveProgram(program)
      return { success: true, program }
    } catch (error) {
      console.warn(
        "programApi.updateExerciseMachines (offline) failed:",
        (error as Error).message,
      )
      reportFailure("updateExerciseMachines", error)
      throw error
    }
  },

  // Offline there is no second device and no trainer, so the device's own
  // stored day is the only pointer there is.
  getCurrentDay: async (): Promise<number | null> => null,

  setCurrentDay: async (): Promise<unknown> => undefined,

  addExercise: async (
    dayNumber: number,
    split: string,
    exercise: ExercisePayload,
  ): Promise<unknown> => {
    try {
      const program = await loadProgram()
      if (!program) throw new Error("No saved program")

      const days = program.days
      const day = days.find((d) => d.dayNumber === dayNumber)
      if (!day) throw new Error(`Day ${dayNumber} not found`)

      const splitData = day.split?.[split]
      if (!splitData) throw new Error(`Split ${split} not found`)
      if (!splitData.exercises) splitData.exercises = []
      splitData.exercises.push(exercise)

      await saveProgram(program)
      return { success: true, program }
    } catch (error) {
      console.warn(
        "programApi.addExercise (offline) failed:",
        (error as Error).message,
      )
      reportFailure("addExercise", error)
      throw error
    }
  },

  patchExerciseSets: async (
    dayNumber: number,
    split: string,
    exerciseIndex: number,
    additionalSets: number,
  ): Promise<unknown> => {
    try {
      const program = await loadProgram()
      if (!program) throw new Error("No saved program")

      const days = program.days
      const day = days.find((d) => d.dayNumber === dayNumber)
      if (!day) throw new Error(`Day ${dayNumber} not found`)

      const splitData = day.split?.[split]
      const exercise = splitData?.exercises?.[exerciseIndex]
      if (!exercise) throw new Error(`Exercise ${exerciseIndex} not found`)

      // Clamped and mirrored onto totalSets to match the online path. Without
      // it the day's total drifts out of step with the sum of its exercises.
      const previous = exercise.sets
      exercise.sets = Math.max(1, previous + additionalSets)
      if (splitData) {
        splitData.totalSets =
          (splitData.totalSets ?? previous) + (exercise.sets - previous)
      }

      await saveProgram(program)
      return { success: true, program }
    } catch (error) {
      console.warn(
        "programApi.patchExerciseSets (offline) failed:",
        (error as Error).message,
      )
      reportFailure("patchExerciseSets", error)
      throw error
    }
  },
}
