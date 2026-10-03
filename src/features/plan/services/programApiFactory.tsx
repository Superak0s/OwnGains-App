import { parseApiResponse } from "@shared/services/apiClient"
import type { HttpFetch } from "@shared/services/authenticatedFetch"
import type { SavedProgram, ExercisePayload, MachinePatch } from "../types"
import type { WorkoutData } from "@shared/types"
import { log, metric } from "@shared/services/crashReporting"

export const makeProgramApi = (http: HttpFetch) => {
  const call = async <T = unknown,>(
    url: string,
    options?: RequestInit,
  ): Promise<T> => parseApiResponse<T>(await http(url, options))

  return {
    saveProgram: async (program: WorkoutData): Promise<unknown> =>
      call(`/api/program/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weeklyPlan: program,
          originalFilename: "template-update",
        }),
      }),

    /**
     * Fetch the user's saved program from the server.
     * GET /api/program
     * Returns null if no program saved yet.
     */
    fetchSavedProgram: async (): Promise<SavedProgram | null> => {
      try {
        const response = await http(`/api/program`)
        if (response.status === 404) return null
        return await parseApiResponse(response)
      } catch (error) {
        if ((error as Error).message === "SESSION_EXPIRED") throw error
        console.warn("Could not fetch saved program:", (error as Error).message)
        metric.count("program.fetch_failed")
        log.warn("program.fetch_failed")
        return null
      }
    },

    deleteProgram: async (): Promise<unknown> =>
      call(`/api/program`, { method: "DELETE" }),

    renameExercise: async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      newName: string,
      newPrimaryMuscles?: string[],
      newSecondaryMuscles?: string[],
      // Omitted leaves the stored id alone, and explicit null clears it.
      newExerciseId?: string | null,
    ): Promise<unknown> =>
      call(`/api/program/exercise/rename`, {
        method: "PATCH",
        body: JSON.stringify({
          dayNumber,
          split,
          exerciseIndex,
          newName,
          ...(newPrimaryMuscles !== undefined && { newPrimaryMuscles }),
          ...(newSecondaryMuscles !== undefined && { newSecondaryMuscles }),
          ...(newExerciseId !== undefined && { newExerciseId }),
        }),
      }),

    /**
     * Patch just the machine fields of one exercise.
     *
     * This is deliberately NOT `saveProgram`: /api/program/upload replaces the
     * whole program and the server restricts it with `denyTrainer`, so a trainer
     * editing a trainee's machine setup would get a silent 403. It is also
     * safer for the user's own account, since a whole-program write from a stale
     * client copy clobbers edits made on another device.
     */
    updateExerciseMachines: async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      patch: MachinePatch,
    ): Promise<unknown> =>
      call(`/api/program/exercise/machine`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayNumber, split, exerciseIndex, patch }),
      }),

    /**
     * The day pointer is stored on the server, not just on the device: a trainer
     * acting for a trainee, and the user's own second device, have to move the
     * same marker.
     */
    getCurrentDay: async (): Promise<number | null> => {
      try {
        const response = await http(`/api/program/current-day`)
        if (response.status === 404) return null
        const data = await parseApiResponse<{ currentDay?: number | null }>(
          response,
        )
        return data?.currentDay ?? null
      } catch (error) {
        if ((error as Error).message === "SESSION_EXPIRED") throw error
        return null
      }
    },

    setCurrentDay: async (day: number): Promise<unknown> =>
      call(`/api/program/current-day`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentDay: day }),
      }),

    addExercise: async (
      dayNumber: number,
      split: string,
      exercise: ExercisePayload,
    ): Promise<unknown> =>
      call(`/api/program/exercise/add`, {
        method: "PATCH",
        body: JSON.stringify({ dayNumber, split, exercise }),
      }),

    patchExerciseSets: async (
      dayNumber: number,
      split: string,
      exerciseIndex: number,
      additionalSets: number,
    ): Promise<unknown> =>
      call(`/api/program/exercise/sets`, {
        method: "PATCH",
        body: JSON.stringify({
          dayNumber,
          split,
          exerciseIndex,
          additionalSets,
        }),
      }),
  }
}

export type ProgramApi = ReturnType<typeof makeProgramApi>
