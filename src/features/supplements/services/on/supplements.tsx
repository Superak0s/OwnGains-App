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
// the envelope stops at this file. The `?? res.<legacy>` fallbacks keep this
// build working against a server image older than the envelope change.
type Enveloped<K extends string, T> = { data?: T } & { [P in K]?: T }

const unwrap = <K extends string, T>(res: Enveloped<K, T>, legacy: K): T | undefined =>
  res.data ?? res[legacy]

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
    const res = await apiCall<Enveloped<"supplements", ServerSummary[]>>(
      `/api/tracking/supplements`,
    )
    return {
      success: true,
      supplements: (unwrap(res, "supplements") ?? []).map(withDoseDefaults),
    }
  },

  create: async (
    params: CreateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<"supplement", ServerSummary>>(
      `/api/tracking/supplements`,
      { method: "POST", body: JSON.stringify(params) },
    )
    return { success: true, supplement: withDoseDefaults(unwrap(res, "supplement")!) }
  },

  update: async (
    id: number,
    params: UpdateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> => {
    const res = await apiCall<Enveloped<"supplement", ServerSummary>>(
      `/api/tracking/supplements/${id}`,
      { method: "PATCH", body: JSON.stringify(params) },
    )
    return { success: true, supplement: withDoseDefaults(unwrap(res, "supplement")!) }
  },

  delete: (id: number): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${id}`, { method: "DELETE" }),


  log: async (
    id: number,
    params: LogSupplementParams = {},
  ): Promise<{ success: boolean; id: number; streak: number }> => {
    const res = await apiCall<{
      data?: { id: number; streak: number }
      id?: number
      streak?: number
    }>(`/api/tracking/supplements/${id}/log`, {
      method: "POST",
      body: JSON.stringify(params),
    })
    const logged = res.data ?? { id: res.id!, streak: res.streak! }
    return { success: true, ...logged }
  },

  getLog: async (id: number, limit = 30): Promise<SupplementLogResponse> => {
    const res = await apiCall<
      { data?: Omit<SupplementLogResponse, "success"> } & Partial<SupplementLogResponse>
    >(`/api/tracking/supplements/${id}/log?limit=${limit}`)
    const log = res.data ?? {
      entries: res.entries ?? [],
      streak: res.streak ?? 0,
      takenToday: !!res.takenToday,
      todayEntry: res.todayEntry ?? null,
    }
    return { success: true, ...log }
  },

  deleteLogEntry: (
    supplementId: number,
    entryId: number,
  ): Promise<{ success: boolean }> =>
    apiCall(`/api/tracking/supplements/${supplementId}/log/${entryId}`, {
      method: "DELETE",
    }),
}
