import { apiCall } from "@shared/services/apiClient"
import type { CustomMeasurementType } from "../../types"

export const customMeasurementsApi = {
  createType: async (keyName: string, label: string, unit?: string) =>
    apiCall<CustomMeasurementType>(`/api/tracking/measurements/definitions`, {
      method: "POST",
      body: JSON.stringify({ keyName, label, unit }),
    }),

  listTypes: async () =>
    apiCall<{ data: CustomMeasurementType[] }>(`/api/tracking/measurements/definitions`),

  logValue: async (keyName: string, value: number, measuredAt?: string, note?: string): Promise<unknown> =>
    apiCall(`/api/tracking/measurements`, {
      method: "POST",
      body: JSON.stringify({ values: { [keyName]: value }, measuredAt: measuredAt || null, note: note || null }),
    }),
}
