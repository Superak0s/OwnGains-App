import type { SetTiming } from "@shared/types";
import type { WorkoutAnalytics } from "../on/workout";

const countWorkingSets = (session: { setTimings: SetTiming[] }): number =>
  session.setTimings.filter((t) => !t.isWarmup).length;

export function computeWorkoutAnalytics(
  sessions: { setTimings: SetTiming[] }[],
): WorkoutAnalytics {
  return {
    totalSessions: sessions.length,
    totalSetsCompleted: sessions.reduce(
      (count, session) => count + countWorkingSets(session),
      0,
    ),
  };
}
