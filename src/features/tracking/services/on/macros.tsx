import { apiCall } from "@shared/services/apiClient"
import type { LogMacrosParams, MacrosGoals } from "../../types"
import type { MacrosEntry } from "@shared/types"
import { backdatedToIso } from "@utils/format"

export const macrosTrackingApi = {
  logMacros: async ({
    name,
    protein,
    carbs,
    fat,
    calories,
    errorMargin = 0,
    time,
    date = null,
    note = null,
  }: LogMacrosParams): Promise<unknown> => {
    const takenAt = date ? backdatedToIso(date, time) : new Date().toISOString()

    return apiCall(`/api/tracking/macros/log`, {
      method: "POST",
      body: JSON.stringify({
        name: name || null,
        protein: protein ?? null,
        carbs: carbs ?? null,
        fat: fat ?? null,
        calories: calories ?? null,
        errorMargin: errorMargin ?? 0,
        takenAt,
        note,
      }),
    })
  },

  getMacrosHistory: async (
    days: number = 30,
  ): Promise<{ entries: MacrosEntry[] }> => {
    type Row = MacrosEntry & { takenAt: string }
    const res = await apiCall<{ data?: Row[]; entries?: Row[] }>(
      `/api/tracking/macros/log?days=${days}`,
    )
    return {
      entries: (res.data ?? res.entries ?? []).map((e) => ({
        ...e,
        loggedAt: e.takenAt,
      })),
    }
  },

  getMacrosGoals: async (): Promise<MacrosGoals> => {
    const res = await apiCall<{
      data?: {
        macroProteinGoal?: number | null
        macroCarbsGoal?: number | null
        macroFatGoal?: number | null
        macroCaloriesGoal?: number | null
      }
    }>(`/api/settings`)
    return {
      protein: res.data?.macroProteinGoal ?? null,
      carbs: res.data?.macroCarbsGoal ?? null,
      fat: res.data?.macroFatGoal ?? null,
      calories: res.data?.macroCaloriesGoal ?? null,
    }
  },

  setMacrosGoals: async ({
    protein,
    carbs,
    fat,
    calories,
  }: MacrosGoals): Promise<unknown> => {
    const patch: Record<string, number> = {}
    if (protein != null) patch.macroProteinGoal = protein
    if (carbs != null) patch.macroCarbsGoal = carbs
    if (fat != null) patch.macroFatGoal = fat
    if (calories != null) patch.macroCaloriesGoal = calories
    return apiCall(`/api/settings`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
  },

  deleteMacrosEntry: async (id: number | string): Promise<unknown> =>
    apiCall(`/api/tracking/macros/log/${id}`, { method: "DELETE" }),
}
