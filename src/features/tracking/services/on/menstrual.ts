import { apiCall } from "@shared/services/apiClient";
import type { ApiResponse, CycleStats, MenstrualEntry } from "../types";

const DEFAULT_PERIOD_DAYS = 5
const DEFAULT_CYCLE_LENGTH_DAYS = 28

export const menstrualApi = {
  logMenstrualCycle: async (
    cycleStart: Date | string,
    symptoms?: string[],
  ): Promise<ApiResponse<MenstrualEntry>> => {
    const startStr =
      cycleStart instanceof Date ? cycleStart.toISOString() : cycleStart;
    return apiCall(`/api/tracking/menstrual`, {
      method: "POST",
      body: JSON.stringify({
        cycleStart: startStr,
        symptoms: symptoms || [],
      }),
    });
  },

  updateMenstrualCycle: async (
    id: number,
    updates: { cycleEnd?: string | null; symptoms?: string[] },
  ): Promise<ApiResponse<MenstrualEntry>> =>
    apiCall(`/api/tracking/menstrual/${id}`, {
      method: "PATCH",
      body: JSON.stringify(updates),
    }),

  getMenstrualHistory: async (
    limit: number = 12,
  ): Promise<ApiResponse<MenstrualEntry[]>> =>
    apiCall(`/api/tracking/menstrual?limit=${limit}`),

  getCycleStats: async (settingsOverride?: {
    periodDays: number;
    cycleLengthDays: number;
  }): Promise<ApiResponse<CycleStats>> => {
    const params = new URLSearchParams();
    if (settingsOverride) {
      params.set("periodDays", String(settingsOverride.periodDays));
      params.set("cycleLengthDays", String(settingsOverride.cycleLengthDays));
    }
    const query = params.toString();
    const path = "/api/tracking/menstrual/stats";
    return apiCall(query ? `${path}?${query}` : path);
  },

  deleteMenstrualEntry: async (id: number): Promise<ApiResponse<null>> =>
    apiCall(`/api/tracking/menstrual/${id}`, { method: "DELETE" }),

  getSettings: async (): Promise<
    ApiResponse<{
      periodDays: number;
      cycleLengthDays: number;
    }>
  > => {
    const res = await apiCall<{
      data?: { cyclePeriodDays?: number; cycleLengthDays?: number }
    }>(`/api/settings`)
    return {
      success: true,
      data: {
        periodDays: res.data?.cyclePeriodDays ?? DEFAULT_PERIOD_DAYS,
        cycleLengthDays: res.data?.cycleLengthDays ?? DEFAULT_CYCLE_LENGTH_DAYS,
      },
    }
  },

  setSettings: async (
    periodDays?: number,
    cycleLengthDays?: number,
  ): Promise<ApiResponse<null>> => {
    const patch: Record<string, number> = {}
    if (periodDays != null) patch.cyclePeriodDays = periodDays
    if (cycleLengthDays != null) patch.cycleLengthDays = cycleLengthDays
    await apiCall(`/api/settings`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
    return { success: true, data: null }
  },
};
