import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import { makeWorkoutApi } from "../workoutApiFactory";

export type {
  WorkoutAnalytics,
  UpdateSetParams,
  RecordSetParams,
  RenameExerciseResult,
  SessionHistoryPage,
  WorkoutApi,
} from "../workoutApiFactory";

export const workoutApi = makeWorkoutApi(authenticatedFetch);
