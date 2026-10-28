import { apiCall, timeZoneHeader } from "@shared/services/apiClient"
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

export const supplementsApi = {

  list: async (): Promise<{ success: boolean; supplements: SupplementSummary[] }> => {
    const res = await apiCall<Enveloped<SupplementSummary[]>>(
      `/api/tracking/supplements`,
      { headers: timeZoneHeader() },
    )
    return {
      success: true,
      supplements: res.data ?? [],
    }
  },

  create: async (
    params: CreateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<SupplementSummary>>(
      `/api/tracking/supplements`,
      { method: "POST", body: JSON.stringify(params), headers: timeZoneHeader() },
    )
    return { success: true, supplement: res.data! }
  },

  update: async (
    id: number,
    params: UpdateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<SupplementSummary>>(
      `/api/tracking/supplements/${id}`,
      { method: "PATCH", body: JSON.stringify(params), headers: timeZoneHeader() },
    )
    return { success: true, supplement: res.data! }
  },

  delete: (id: number): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${id}`, { method: "DELETE", headers: timeZoneHeader() }),


  log: async (
    id: number,
    params: LogSupplementParams = {},
  ): Promise<{ success: boolean; id: number; streak: number }> => {
    const res = await apiCall<Enveloped<{ id: number; streak: number }>>(
      `/api/tracking/supplements/${id}/log`,
      { method: "POST", body: JSON.stringify(params), headers: timeZoneHeader() },
    )
    return { success: true, ...res.data! }
  },

  getLog: async (id: number, limit = 30): Promise<SupplementLogResponse> => {
    const res = await apiCall<Enveloped<Omit<SupplementLogResponse, "success">>>(
      `/api/tracking/supplements/${id}/log?limit=${limit}`,
      { headers: timeZoneHeader() },
    )
    return { success: true, ...res.data! }
  },

  deleteLogEntry: (
    supplementId: number,
    entryId: number,
  ): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${supplementId}/log/${entryId}`, {
      method: "DELETE",
      headers: timeZoneHeader(),
    }),
}
