import { apiCall } from "@shared/services/apiClient"
import type {
  ApiResponse,
  DOMSStats,
  LogSorenessParams,
  SorenessEntry,
  UpdateSorenessParams,
} from "../../types/muscleRecovery"

export const sorenessApi = {
  logSoreness: async ({
    muscleGroup,
    intensity,
    note,
    loggedAt,
  }: LogSorenessParams): Promise<ApiResponse<SorenessEntry>> =>
    apiCall(`/api/tracking/soreness`, {
      method: "POST",
      body: JSON.stringify({
        muscleGroup,
        intensity: Math.round(intensity),
        loggedAt: loggedAt || new Date().toISOString(),
        note: note || null,
      }),
    }),

  getSorenessHistory: async (
    limit: number = 100,
  ): Promise<ApiResponse<SorenessEntry[]>> =>
    apiCall(`/api/tracking/soreness?limit=${limit}`),

  getActiveSoreness: async (): Promise<ApiResponse<SorenessEntry[]>> =>
    apiCall(`/api/tracking/soreness?status=active`),

  updateSoreness: async ({
    sorenessId,
    intensity,
    status,
    note,
  }: UpdateSorenessParams): Promise<ApiResponse<SorenessEntry>> => {
    const res = await sorenessApi.batchFollowUp([{ sorenessId, intensity, status, note }])
    return { ...res, data: res.data?.[0] }
  },

  batchFollowUp: async (
    updates: UpdateSorenessParams[],
  ): Promise<ApiResponse<SorenessEntry[]>> =>
    apiCall(`/api/tracking/soreness/follow-ups`, {
      method: "POST",
      body: JSON.stringify({
        updates: updates.map((u) => ({
          sorenessId: u.sorenessId,
          intensity: Math.round(u.intensity),
          status: u.status,
          note: u.note || null,
        })),
      }),
    }),

  getHistoryByMuscle: async (
    muscle: string,
  ): Promise<ApiResponse<SorenessEntry[]>> =>
    apiCall(`/api/tracking/soreness?muscle=${encodeURIComponent(muscle)}`),

  getStats: async (days: number = 30): Promise<ApiResponse<DOMSStats>> =>
    apiCall(`/api/tracking/soreness/stats?days=${days}`),

  deleteSorenessEntry: async (id: number): Promise<ApiResponse<null>> =>
    apiCall(`/api/tracking/soreness/${id}`, { method: "DELETE" }),
}
