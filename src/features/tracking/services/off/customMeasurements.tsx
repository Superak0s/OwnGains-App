import {
  createRecordStore,
  nextLocalId,
} from "@shared/services/offlineHelpers"
import type { CustomMeasurementType, CustomMeasurementValue } from "../../types"


export function createCustomMeasurementsApi(user?: string) {
  const typeStore = createRecordStore<CustomMeasurementType>(
    "custom_measurement_types",
    (t) => t.id,
    (t) => t.createdAt,
    user,
  )

  const valueStore = createRecordStore<CustomMeasurementValue>(
    "custom_measurement_values",
    (v) => v.id,
    (v) => v.measuredAt,
    user,
  )

  const customMeasurementsApi = {
    // The server rejects a duplicate keyName and the caller recovers by looking
    // it up. Offline there is nothing to reject against, so return the match.
    createType: async (
      keyName: string,
      label: string,
      unit?: string,
    ): Promise<CustomMeasurementType> => {
      const [existing] = await typeStore.getWhere({ keyName })
      if (existing) return existing

      const type: CustomMeasurementType = {
        id: nextLocalId(),
        keyName,
        label,
        unit: unit ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      await typeStore.put(type)
      return type
    },

    listTypes: async (): Promise<{ data: CustomMeasurementType[] }> => ({
      data: await typeStore.getAll(),
    }),

    logValue: async (
      keyName: string,
      value: number,
      measuredAt?: string,
      note?: string,
    ): Promise<CustomMeasurementValue> => {
      const entry: CustomMeasurementValue = {
        id: nextLocalId(),
        keyName,
        value,
        measuredAt: measuredAt || new Date().toISOString(),
        note: note || null,
      }
      await valueStore.put(entry)
      return entry
    },
  }
  return { customMeasurementsApi }
}

export const { customMeasurementsApi } = createCustomMeasurementsApi()
