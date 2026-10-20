import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { scheduleApi as scheduleApiOn } from "./on/schedule"
import { scheduleApi as scheduleApiOff } from "./off/schedule"

export const scheduleApi = createDispatchProxy(scheduleApiOn, scheduleApiOff, undefined, "schedule")
export { makeScheduleApi } from "./scheduleApiFactory"
export type { ScheduledWorkout, ScheduleParams } from "../types"
