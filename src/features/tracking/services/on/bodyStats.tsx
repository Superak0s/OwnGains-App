import { apiCall } from "@shared/services/apiClient"
import { log, metric } from "@shared/services/crashReporting"
import type {
  BodyFatMeasurements,
  Gender,
  WeightUnit,
} from "../../types"
import { backdatedToIso } from "@utils/format"
import type {
  BodyFatEntry,
  WeightHistoryResponse,
} from "@shared/types"

interface MetricEntry {
  id: number
  value: number
  measuredAt: string
  note: string | null
}

export const bodyTrackingApi = {

  logWeight: async (
    weight: number,
    unit: WeightUnit,
    note: string | null = null,
    recordedAt: string | null = null,
  ): Promise<unknown> => {
    const weightKg = unit === "lbs" ? weight * 0.453592 : weight
    return apiCall(`/api/tracking/bodystats/weight`, {
      method: "POST",
      body: JSON.stringify({
        weightKg,
        measuredAt: recordedAt || new Date().toISOString(),
        note,
      }),
    })
  },

  getWeightHistory: async (
    limit: number = 90,
  ): Promise<WeightHistoryResponse> => {
    const res = await apiCall<{ data?: MetricEntry[] }>(
      `/api/tracking/bodystats/weight?limit=${limit}`,
    )
    return {
      entries: (res.data ?? []).map((e) => ({
        id: e.id,
        weightKg: e.value,
        recordedAt: e.measuredAt,
      })),
    }
  },

  deleteWeightEntry: async (id: number | string): Promise<unknown> =>
    apiCall(`/api/tracking/bodystats/weight/${id}`, { method: "DELETE" }),

  getCurrentWeight: async (): Promise<{ entry?: { weightKg: number } }> => {
    const res = await apiCall<{ data?: MetricEntry | null }>(
      `/api/tracking/bodystats/weight/current`,
    )
    const entry = res.data
    return entry ? { entry: { weightKg: entry.value } } : {}
  },
}

export const getCurrentBodyWeight = async (
  _userId?: string | null,
): Promise<number | null> => {
  try {
    const { entry } = await bodyTrackingApi.getCurrentWeight()
    return entry ? entry.weightKg : null
  } catch (err) {
    console.warn(
      "Failed to get current weight from server:",
      err,
    )
    metric.count("tracking.current_weight_fetch_failed")
    log.warn("tracking.current_weight_fetch_failed")
    return null
  }
}

export const bodyFatApi = {
  logBodyFat: async (
    percentage: number,
    measurements: BodyFatMeasurements | null,
    gender: Gender | null,
    date: string | null = null,
  ): Promise<unknown> => {
    let measuredAt: string
    if (date) {
      measuredAt = /^\d{4}-\d{2}-\d{2}$/.test(date)
        ? backdatedToIso(date)
        : date
    } else {
      measuredAt = new Date().toISOString()
    }
    return apiCall(`/api/tracking/bodystats/bodyfat/log`, {
      method: "POST",
      body: JSON.stringify({
        percentage,
        measurements,
        bfFormulaSex: gender ?? undefined,
        measuredAt,
      }),
    })
  },

  getBodyFatHistory: async (
    limit: number = 90,
  ): Promise<{ entries: BodyFatEntry[] }> => {
    const res = await apiCall<{ data?: BodyFatEntry[] }>(
      `/api/tracking/bodystats/bodyfat/log?limit=${limit}`,
    )
    return { entries: res.data ?? [] }
  },

  deleteBodyFatEntry: async (id: number | string): Promise<unknown> =>
    apiCall(`/api/tracking/bodystats/bodyfat/log/${id}`, { method: "DELETE" }),
}
