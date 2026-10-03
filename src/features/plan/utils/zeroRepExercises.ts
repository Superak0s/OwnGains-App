import type { WorkoutData } from "@shared/types";

export interface ZeroRepExercise {
  day: string;
  name: string;
}

/** An explicit 0 in the reps column schedules a set nobody can perform, but a blank reps value just means the program doesn't prescribe any. */
export function zeroRepExercises(
  workoutData: WorkoutData | null | undefined,
  split: string | null = null,
): ZeroRepExercise[] {
  return (workoutData?.days ?? []).flatMap((day, idx) =>
    (split ? (day.split?.[split]?.exercises ?? []) : (day.exercises ?? []))
      .filter((e) => {
        const reps = String(e.reps ?? "").trim();
        return reps !== "" && Number(reps) === 0;
      })
      .map((e) => ({
        day: day.dayTitle || `Day ${day.dayNumber ?? idx + 1}`,
        name: e.name,
      })),
  );
}
