import {
  createRecordStore,
  nextLocalId,
  nowIso,
} from "@shared/services/offlineHelpers"
import type { CustomMeasurementType, CustomMeasurementValue } from "../../types"

const TYPES_KEY = "@off_custom_measurement_types"
const VALUES_KEY = "@off_custom_measurement_values"

const typeStore = createRecordStore<CustomMeasurementType>(
  "custom_measurement_types",
  TYPES_KEY,
  (t) => t.id,
  (t) => t.createdAt,
)

const valueStore = createRecordStore<CustomMeasurementValue>(
  "custom_measurement_values",
  VALUES_KEY,
  (v) => v.id,
  (v) => v.measuredAt,
)

export const customMeasurementsApi = {
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
      createdAt: nowIso(),
      updatedAt: nowIso(),
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
      measuredAt: measuredAt || nowIso(),
      note: note || null,
    }
    await valueStore.put(entry)
    return entry
  },
}
