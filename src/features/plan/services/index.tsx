import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { programApi as programApiOn } from "./on/program"
import { programApi as programApiOff } from "./off/program"

export const programApi = createDispatchProxy(
  programApiOn,
  programApiOff,
  "program",
)

export type { SavedProgram, ExercisePayload } from "../types"
