import {
  apiCall,
  fetchIdempotent,
  parseApiResponse,
} from "@shared/services/apiClient"
import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { generateId } from "@utils/format"
import { DEFAULT_HYDRATION_SETTINGS } from "../types"
import type { ApiResponse, HydrationEntry, HydrationSettings } from "../types"

export const hydrationApi = {
  logHydration: async (
    amountMl: number,
    note?: string,
    loggedAt: string | null = null,
    idempotencyKey: string = generateId("idem"),
    errorMargin = 0,
  ): Promise<ApiResponse<{ id: number }>> => {
    // Two drinks at the same measuredAt are two entries, so only the key stops a resend from double-logging.
    const res = await fetchIdempotent(
      authenticatedFetch,
      `/api/tracking/hydration`,
      {
        method: "POST",
        body: JSON.stringify({
          amountMl,
          measuredAt: loggedAt || new Date().toISOString(),
          note: note || null,
          errorMargin,
        }),
      },
      idempotencyKey,
    )
    return parseApiResponse(res)
  },

  getHydrationHistory: async (limit: number = 100): Promise<ApiResponse<HydrationEntry[]>> => {
    const res = await apiCall<{
      data: Array<{ id: number; value: number; measuredAt: string; note: string | null; errorMargin?: number | null; createdAt: string }>
    }>(`/api/tracking/hydration?limit=${limit}`)
    return {
      success: true,
      data: (res.data ?? []).map((row) => ({
        id: row.id,
        amountMl: row.value,
        loggedAt: row.measuredAt,
        note: row.note,
        errorMargin: row.errorMargin ?? 0,
        createdAt: row.createdAt,
      })),
    }
  },

  deleteHydrationEntry: async (id: number): Promise<ApiResponse<null>> =>
    apiCall(`/api/tracking/hydration/${id}`, { method: "DELETE" }),

  getSettings: async (): Promise<ApiResponse<HydrationSettings>> => {
    const res = await apiCall<{
      data?: { hydrationGoalMl?: number | null; hydrationErrorPercent?: number | null }
    }>(`/api/settings`)
    return {
      success: true,
      data: {
        goalMl: res.data?.hydrationGoalMl ?? DEFAULT_HYDRATION_SETTINGS.goalMl,
        measurementErrorPercent:
          res.data?.hydrationErrorPercent ??
          DEFAULT_HYDRATION_SETTINGS.measurementErrorPercent,
      },
    }
  },

  setSettings: async (goalMl?: number, measurementErrorPercent?: number): Promise<ApiResponse<null>> => {
    const patch: Record<string, number> = {}
    if (goalMl != null) patch.hydrationGoalMl = goalMl
    if (measurementErrorPercent != null) patch.hydrationErrorPercent = measurementErrorPercent
    await apiCall(`/api/settings`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
    return { success: true, data: null }
  },
};
