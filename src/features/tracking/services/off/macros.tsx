import { createRecordStore, readJSON, writeJSON } from "@shared/services/offlineHelpers"
import { generateId, backdatedToIso, toDateString } from "@utils/format"
import type { LogMacrosParams, MacrosGoals } from "../../types"
import type { MacrosEntry } from "@shared/types"
import { captureException, metric } from "@shared/services/crashReporting"

const reportFailure = (op: string, error: unknown): void => {
  metric.count("tracking.op_failed", 1, {
    attributes: { feature: "macros", op, mode: "offline" },
  })
  captureException(error, { feature: "macros", op, mode: "offline" })
}

interface StoredMacrosEntry {
  id: string
  name: string | null
  protein: number | null
  carbs: number | null
  fat: number | null
  calories: number | null
  errorMargin: number
  time?: string
  date: string
  takenAt: string
  note: string | null
}

const ENTRIES_KEY = "@offline_macros_entries"
const GOALS_KEY = "@offline_macros_goals"

const entriesStore = createRecordStore<StoredMacrosEntry>(
  "macros_entries",
  ENTRIES_KEY,
  (e) => e.id,
  (e) => e.takenAt,
)

export const macrosTrackingApi = {
  logMacros: async ({
    name,
    protein,
    carbs,
    fat,
    calories,
    errorMargin = 0,
    time,
    date = null,
    note = null,
  }: LogMacrosParams): Promise<unknown> => {
    try {
      const takenAt = date
        ? backdatedToIso(date, time)
        : new Date().toISOString()

      const entry: StoredMacrosEntry = {
        id: generateId(),
        name: name ?? null,
        protein: protein ?? null,
        carbs: carbs ?? null,
        fat: fat ?? null,
        calories: calories ?? null,
        errorMargin: errorMargin ?? 0,
        time,
        date: date ?? toDateString(new Date()),
        takenAt,
        note,
      }

      await entriesStore.put(entry)

      return { success: true, entry }
    } catch (error) {
      console.error("Error logging macros (offline):", error)
      reportFailure("logMacros", error)
      throw error
    }
  },

  getMacrosHistory: async (
    days: number = 30,
  ): Promise<{ entries: MacrosEntry[] }> => {
    try {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      const entries = await entriesStore.getSince(cutoff)
      return { entries: entries.map((e) => ({ ...e, name: e.name ?? undefined })) }
    } catch (error) {
      console.error("Error getting macros history (offline):", error)
      reportFailure("getMacrosHistory", error)
      throw error
    }
  },

  getMacrosGoals: async (): Promise<MacrosGoals> =>
    readJSON<Required<MacrosGoals>>(GOALS_KEY, {
      protein: null,
      carbs: null,
      fat: null,
      calories: null,
    }),

  setMacrosGoals: async ({
    protein,
    carbs,
    fat,
    calories,
  }: MacrosGoals): Promise<unknown> => {
    try {
      const goals: Required<MacrosGoals> = {
        protein: protein ?? null,
        carbs: carbs ?? null,
        fat: fat ?? null,
        calories: calories ?? null,
      }
      await writeJSON(GOALS_KEY, goals)
      return { success: true, goals }
    } catch (error) {
      console.error("Error setting macros goals (offline):", error)
      reportFailure("setMacrosGoals", error)
      throw error
    }
  },

  deleteMacrosEntry: async (id: number | string): Promise<unknown> => {
    try {
      await entriesStore.remove(id)
      return { success: true }
    } catch (error) {
      console.error("Error deleting macros entry (offline):", error)
      reportFailure("deleteMacrosEntry", error)
      throw error
    }
  },
}
