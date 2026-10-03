import { createDispatchProxy } from "@shared/services/dispatchProxy"
import { workoutApi as workoutApiOn } from "./on/workout"
import { workoutApi as workoutApiOff } from "./off/workout"

export const workoutApi = createDispatchProxy(
  workoutApiOn,
  workoutApiOff,
  "workout",
)

export type {
  WorkoutAnalytics,
  UpdateSetParams,
  RecordSetParams,
  RenameExerciseResult,
} from "./on/workout"
export type {
  SetTiming,
  WorkoutSession,
  FullSessionWithGroups,
} from "@shared/types"
