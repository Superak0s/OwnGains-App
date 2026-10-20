import { parseApiResponse } from "@shared/services/apiClient"
import type { HttpFetch } from "@shared/services/authenticatedFetch"
import type { ScheduledWorkout, ScheduleParams } from "../types"

export const makeScheduleApi = (http: HttpFetch) => {
  const entry = async (url: string, options: RequestInit): Promise<ScheduledWorkout> =>
    (await parseApiResponse<{ scheduled: ScheduledWorkout }>(await http(url, options))).scheduled

  return {
    list: async (from: Date, to: Date, includeCancelled = false): Promise<ScheduledWorkout[]> => {
      const query = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}${includeCancelled ? "&includeCancelled=1" : ""}`
      return (await parseApiResponse<{ scheduled: ScheduledWorkout[] }>(await http(`/api/schedule?${query}`))).scheduled
    },
    create: (params: ScheduleParams): Promise<ScheduledWorkout> => entry("/api/schedule", { method: "POST", body: JSON.stringify(params) }),
    update: (id: number, patch: Partial<ScheduleParams>): Promise<ScheduledWorkout> =>
      entry(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
    accept: (id: number): Promise<ScheduledWorkout> => entry(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify({ accepted: true }) }),
    /** The only way a trainer can take back a suggestion, since they may not delete. */
    cancel: (id: number): Promise<ScheduledWorkout> => entry(`/api/schedule/${id}`, { method: "PATCH", body: JSON.stringify({ cancelled: true }) }),
    remove: async (id: number): Promise<void> => {
      await parseApiResponse(await http(`/api/schedule/${id}`, { method: "DELETE" }))
    },
  }
}

export type ScheduleApi = ReturnType<typeof makeScheduleApi>
