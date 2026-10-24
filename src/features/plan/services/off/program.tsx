import type { SavedProgram, ProgramSnapshot } from "../../types"
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
        error,
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

  // The caller has already saved the edit to this device's program, so
  // applying it again here would store it twice.
  renameExercise: async (): Promise<unknown> => ({ success: true }),

  updateExerciseMachines: async (): Promise<unknown> => ({ success: true }),

  addExercise: async (): Promise<unknown> => ({ success: true }),

  patchExerciseSets: async (): Promise<unknown> => ({ success: true }),

  // Offline there is no second device and no trainer, so the device's own
  // stored day is the only pointer there is.
  getCurrentDay: async (): Promise<number | null> => null,

  setCurrentDay: async (): Promise<unknown> => undefined,

  // No trainer offline, so nothing to undo.
  listSnapshots: async (): Promise<ProgramSnapshot[]> => [],

  restoreSnapshot: async (): Promise<SavedProgram | null> => loadProgram(),

  dismissSnapshot: async (): Promise<unknown> => ({ success: true }),
}
