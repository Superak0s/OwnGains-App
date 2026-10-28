import { createRecordStore, readJSON, writeJSON, nextLocalId, withLock } from "@shared/services/offlineHelpers"
import { DEFAULT_HYDRATION_SETTINGS } from "../types"
import type {
  ApiResponse,
  HydrationEntry,
  HydrationSettings,
} from "../types"

const SETTINGS_KEY = "@off_hydration_settings"

export function createHydrationApi(user?: string) {
  const store = createRecordStore<HydrationEntry>(
    "hydration_entries",
    (e) => e.id,
    (e) => e.loggedAt,
    user,
  )

  const hydrationApi = {
    logHydration: async (
      amountMl: number,
      note?: string,
      loggedAt: string | null = null,
      _idempotencyKey?: string,
      errorMargin = 0,
    ): Promise<ApiResponse<{ id: number }>> => {
      const entry: HydrationEntry = {
        id: nextLocalId(),
        amountMl,
        loggedAt: loggedAt || new Date().toISOString(),
        note: note || null,
        errorMargin,
        createdAt: new Date().toISOString(),
      }
      await store.put(entry)
      return { success: true, data: { id: entry.id } }
    },

    getHydrationHistory: async (
      limit: number = 100,
    ): Promise<ApiResponse<HydrationEntry[]>> => {
      const data = await store.getRecent(limit)
      return { success: true, data }
    },

    deleteHydrationEntry: async (
      id: number,
    ): Promise<ApiResponse<null>> => {
      await store.remove(id)
      return { success: true, data: null }
    },

    getSettings: async (): Promise<ApiResponse<HydrationSettings>> => {
      const settings = await readJSON(SETTINGS_KEY, DEFAULT_HYDRATION_SETTINGS, user)
      return { success: true, data: settings }
    },

    setSettings: async (
      goalMl?: number,
      measurementErrorPercent?: number,
    ): Promise<ApiResponse<null>> =>
      withLock(SETTINGS_KEY, async () => {
        const current = await readJSON(SETTINGS_KEY, DEFAULT_HYDRATION_SETTINGS, user)
        await writeJSON(SETTINGS_KEY, {
          goalMl: goalMl ?? current.goalMl,
          measurementErrorPercent:
            measurementErrorPercent ?? current.measurementErrorPercent,
        }, user)
        return { success: true, data: null }
      }),
  }
  return { hydrationApi }
}

export const { hydrationApi } = createHydrationApi()
