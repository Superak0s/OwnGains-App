import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { makeProgramApi } from "../programApiFactory"

export type { ProgramApi } from "../programApiFactory"

export const programApi = makeProgramApi(authenticatedFetch)
