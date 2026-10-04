import { generateId, backdatedToIso } from "@utils/format"
import { createRecordStore } from "@shared/services/offlineHelpers"
import type {
  BodyFatMeasurements,
  Gender,
  WeightUnit,
} from "../../types"
import type {
  BodyFatEntry,
  WeightHistoryResponse,
} from "@shared/types"
import { captureException, metric } from "@shared/services/crashReporting"

const WEIGHT_KEY = "@off_body_weight_history"
const BODYFAT_KEY = "@off_body_fat_history"

const lbsToKg = (lbs: number): number => lbs * 0.453592

const reportFailure = (op: string, error: unknown): void => {
  metric.count("tracking.op_failed", 1, {
    attributes: { feature: "bodyStats", op, mode: "offline" },
  })
  captureException(error, { feature: "bodyStats", op, mode: "offline" })
}


interface WeightRecord {
  id: string
  weightKg: number
  note: string | null
  recordedAt: string
}

interface BodyFatRecord {
  id: string
  percentage: number
  measurements: BodyFatMeasurements
  gender: Gender
  calculatedAt: string
  method: "us_navy"
}

const weightStore = createRecordStore<WeightRecord>(
  "body_weight",
  WEIGHT_KEY,
  (r) => r.id,
  (r) => r.recordedAt,
)
const bodyFatStore = createRecordStore<BodyFatRecord>(
  "body_fat",
  BODYFAT_KEY,
  (r) => r.id,
  (r) => r.calculatedAt,
)


export const bodyTrackingApi = {
  logWeight: async (
    weight: number,
    unit: WeightUnit,
    note: string | null = null,
    recordedAt: string | null = null,
  ): Promise<unknown> => {
    try {
      const weightKg = unit === "lbs" ? lbsToKg(weight) : weight
      const entry: WeightRecord = {
        id: generateId(),
        weightKg: weightKg,
        note,
        recordedAt: recordedAt || new Date().toISOString(),
      }
      await weightStore.put(entry)
      return { success: true, entry }
    } catch (error) {
      console.error("Error logging weight locally:", error)
      reportFailure("logWeight", error)
      throw error
    }
  },

  getWeightHistory: async (
    limit: number = 90,
  ): Promise<WeightHistoryResponse> => {
    try {
      const entries = await weightStore.getRecent(limit)
      return { entries }
    } catch (error) {
      console.error("Error getting local weight history:", error)
      reportFailure("getWeightHistory", error)
      throw error
    }
  },

  deleteWeightEntry: async (id: number | string): Promise<unknown> => {
    try {
      await weightStore.remove(id)
      return { success: true }
    } catch (error) {
      console.error("Error deleting local weight entry:", error)
      reportFailure("deleteWeightEntry", error)
      throw error
    }
  },

  /** Shape mirrors services/on/bodyStats.tsx so getCurrentBodyWeight works in either mode. */
  getCurrentWeight: async (): Promise<{ entry?: { weightKg: number } }> => {
    try {
      const [latest] = await weightStore.getRecent(1)
      return latest ? { entry: { weightKg: latest.weightKg } } : {}
    } catch (error) {
      console.error("Error getting local current weight:", error)
      reportFailure("getCurrentWeight", error)
      throw error
    }
  },
}

/** `userId` is unused offline. The parameter exists for parity with services/on/bodyStats.tsx. */
export const getCurrentBodyWeight = async (
  _userId?: string | null,
): Promise<number | null> => {
  try {
    const { entry } = await bodyTrackingApi.getCurrentWeight()
    return entry ? entry.weightKg : null
  } catch (error) {
    captureException(error, { stage: "getCurrentBodyWeight" })
    return null
  }
}

export const bodyFatApi = {
  logBodyFat: async (
    percentage: number,
    measurements: BodyFatMeasurements,
    gender: Gender,
    date: string | null = null,
  ): Promise<unknown> => {
    try {
      let calculatedAt: string
      if (date) {
        calculatedAt = /^\d{4}-\d{2}-\d{2}$/.test(date)
          ? backdatedToIso(date)
          : date
      } else {
        calculatedAt = new Date().toISOString()
      }
      const record: BodyFatRecord = {
        id: generateId(),
        percentage,
        measurements,
        gender,
        calculatedAt: calculatedAt,
        method: "us_navy",
      }
      await bodyFatStore.put(record)
      return { success: true, entry: record }
    } catch (error) {
      console.error("Error logging local body fat:", error)
      reportFailure("logBodyFat", error)
      throw error
    }
  },

  getBodyFatHistory: async (
    limit: number = 90,
  ): Promise<{ entries: BodyFatEntry[] }> => {
    try {
      const entries = await bodyFatStore.getRecent(limit)
      return { entries }
    } catch (error) {
      console.error("Error getting local body fat history:", error)
      reportFailure("getBodyFatHistory", error)
      throw error
    }
  },

  deleteBodyFatEntry: async (id: number | string): Promise<unknown> => {
    try {
      await bodyFatStore.remove(id)
      return { success: true }
    } catch (error) {
      console.error("Error deleting local body fat entry:", error)
      reportFailure("deleteBodyFatEntry", error)
      throw error
    }
  },
}
