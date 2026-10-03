import { createRecordStore, nextLocalId } from "@shared/services/offlineHelpers"
import type { ApiResponse , MeasurementEntry } from "../types"


const HISTORY_KEY = "@off_body_measurements"

const store = createRecordStore<MeasurementEntry>(
  "body_measurements",
  HISTORY_KEY,
  (e) => e.id,
  (e) => e.measuredAt,
)

export const bodyMeasurementsApi = {
  logMeasurement: async (
    waistCm?: number | null,
    armLeftCm?: number | null,
    armRightCm?: number | null,
    chestCm?: number | null,
    measuredAt?: string,
    note?: string,
  ): Promise<ApiResponse<MeasurementEntry>> => {
    const entry: MeasurementEntry = {
      id: nextLocalId(),
      waistCm: waistCm ?? null,
      armLeftCm: armLeftCm ?? null,
      armRightCm: armRightCm ?? null,
      chestCm: chestCm ?? null,
      measuredAt: measuredAt || new Date().toISOString(),
      note: note || null,
      createdAt: new Date().toISOString(),
    }
    await store.put(entry)
    return { success: true, data: entry }
  },

  getMeasurementHistory: async (
    limit: number = 90,
  ): Promise<ApiResponse<MeasurementEntry[]>> => {
    const data = await store.getRecent(limit)
    return { success: true, data }
  },

  deleteMeasurementEntry: async (
    id: number,
  ): Promise<ApiResponse<null>> => {
    await store.remove(id)
    return { success: true, data: null }
  },
}
