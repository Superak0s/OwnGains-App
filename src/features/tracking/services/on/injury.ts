import { apiCall } from "@shared/services/apiClient";
import type {
  ApiResponse,
  InjuryRecord,
  InjuryStatus,
  LogInjuryParams,
} from "../../types/muscleRecovery";

export const injuryApi = {
  logInjury: async (params: LogInjuryParams): Promise<ApiResponse<InjuryRecord>> =>
    apiCall(`/api/tracking/injuries`, {
      method: "POST",
      body: JSON.stringify(params),
    }),

  getAllInjuries: async (): Promise<ApiResponse<InjuryRecord[]>> =>
    apiCall(`/api/tracking/injuries`),

  getInjuriesByMuscle: async (muscle: string): Promise<ApiResponse<InjuryRecord[]>> =>
    apiCall(`/api/tracking/injuries/muscle/${encodeURIComponent(muscle)}`),

  updateInjury: async (
    id: number,
    updates: { painLevel?: number; status?: InjuryStatus; recoveryDate?: string; note?: string },
  ): Promise<ApiResponse<InjuryRecord>> =>
    apiCall(`/api/tracking/injuries/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  deleteInjury: async (id: number): Promise<ApiResponse<null>> =>
    apiCall(`/api/tracking/injuries/${id}`, { method: "DELETE" }),
};
