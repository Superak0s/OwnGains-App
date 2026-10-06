import { apiCall } from "@shared/services/apiClient"
import type {
  CreateSupplementParams,
  LogSupplementParams,
  SupplementLogResponse,
  SupplementSummary,
  UpdateSupplementParams,
} from "../../types"


// The server answers { success, data } on every tracking route. These adapters
// unwrap it into the format the screens and the offline version share, so
// the envelope stops at this file.
type Enveloped<T> = { data?: T }

// Servers without multi-dose support omit these fields. One dose a day is what
// they model.
type ServerSummary = Omit<
  SupplementSummary,
  "dosesPerDay" | "doseIntervalMinutes" | "dosesToday" | "lastTakenAt"
> &
  Partial<SupplementSummary>

const withDoseDefaults = (s: ServerSummary): SupplementSummary => ({
  ...s,
  dosesPerDay: s.dosesPerDay ?? 1,
  doseIntervalMinutes: s.doseIntervalMinutes ?? null,
  dosesToday: s.dosesToday ?? (s.takenToday ? 1 : 0),
  lastTakenAt: s.lastTakenAt ?? null,
})

export const supplementsApi = {

  list: async (): Promise<{ success: boolean; supplements: SupplementSummary[] }> => {
    const res = await apiCall<Enveloped<ServerSummary[]>>(
      `/api/tracking/supplements`,
    )
    return {
      success: true,
      supplements: (res.data ?? []).map(withDoseDefaults),
    }
  },

  create: async (
    params: CreateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<ServerSummary>>(
      `/api/tracking/supplements`,
      { method: "POST", body: JSON.stringify(params) },
    )
    return { success: true, supplement: withDoseDefaults(res.data!) }
  },

  update: async (
    id: number,
    params: UpdateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<ServerSummary>>(
      `/api/tracking/supplements/${id}`,
      { method: "PATCH", body: JSON.stringify(params) },
    )
    return { success: true, supplement: withDoseDefaults(res.data!) }
  },

  delete: (id: number): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${id}`, { method: "DELETE" }),


  log: async (
    id: number,
    params: LogSupplementParams = {},
  ): Promise<{ success: boolean; id: number; streak: number }> => {
    const res = await apiCall<Enveloped<{ id: number; streak: number }>>(
      `/api/tracking/supplements/${id}/log`,
      { method: "POST", body: JSON.stringify(params) },
    )
    return { success: true, ...res.data! }
  },

  getLog: async (id: number, limit = 30): Promise<SupplementLogResponse> => {
    const res = await apiCall<Enveloped<Omit<SupplementLogResponse, "success">>>(
      `/api/tracking/supplements/${id}/log?limit=${limit}`,
    )
    return { success: true, ...res.data! }
  },

  deleteLogEntry: (
    supplementId: number,
    entryId: number,
  ): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${supplementId}/log/${entryId}`, {
      method: "DELETE",
    }),
}
