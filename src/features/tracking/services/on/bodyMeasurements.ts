import { apiCall } from "@shared/services/apiClient"
import type { ApiResponse, MeasurementEntry } from "../types"

const METRICS = "waist_cm,arm_left_cm,arm_right_cm,chest_cm"

const toValues = (
  waistCm?: number | null,
  armLeftCm?: number | null,
  armRightCm?: number | null,
  chestCm?: number | null,
): Record<string, number> => {
  const values: Record<string, number> = {}
  if (waistCm != null) values.waist_cm = waistCm
  if (armLeftCm != null) values.arm_left_cm = armLeftCm
  if (armRightCm != null) values.arm_right_cm = armRightCm
  if (chestCm != null) values.chest_cm = chestCm
  return values
}

export const bodyMeasurementsApi = {
  logMeasurement: async (
    waistCm?: number | null,
    armLeftCm?: number | null,
    armRightCm?: number | null,
    chestCm?: number | null,
    measuredAt?: string,
    note?: string,
  ): Promise<unknown> =>
    apiCall(`/api/tracking/measurements`, {
      method: "POST",
      body: JSON.stringify({
        values: toValues(waistCm, armLeftCm, armRightCm, chestCm),
        measuredAt: measuredAt || new Date().toISOString(),
        note: note || null,
      }),
    }),

  getMeasurementHistory: async (limit: number = 90): Promise<ApiResponse<MeasurementEntry[]>> => {
    const res = await apiCall<{
      data: Array<{
        id: number
        measuredAt: string
        note?: string | null
        values?: Record<string, number | null>
      }>
    }>(`/api/tracking/measurements?metrics=${METRICS}&limit=${limit}`)
    return {
      success: true,
      data: (res.data ?? []).map((row) => ({
        id: row.id,
        waistCm: row.values?.waist_cm ?? null,
        armLeftCm: row.values?.arm_left_cm ?? null,
        armRightCm: row.values?.arm_right_cm ?? null,
        chestCm: row.values?.chest_cm ?? null,
        measuredAt: row.measuredAt,
        note: row.note ?? null,
        createdAt: row.measuredAt,
      })),
    }
  },

  deleteMeasurementEntry: async (id: number): Promise<unknown> =>
    apiCall(`/api/tracking/measurements/${id}?metrics=${METRICS}`, { method: "DELETE" }),
}
