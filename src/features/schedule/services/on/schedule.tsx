import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { makeScheduleApi } from "../scheduleApiFactory"

export const scheduleApi = makeScheduleApi(authenticatedFetch)
