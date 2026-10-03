import type { CompletedDays, Exercise, WorkoutData } from "@shared/types";
import { normalizeExerciseName } from "@utils/exerciseMatching";

/** Session-only reshaping of one day, so a mid-workout day switch never edits the plan. */
export interface DayOverride {
  dayNumber: number;
  split: string;
  /** Logged exercises brought over from the previous day, after the plan's own. */
  carried: Exercise[];
  /** Raised set counts, by plan exercise index, so every carried log has a slot. */
  minSets: Record<number, number>;
}

export const dayExercises = (
  data: WorkoutData | null,
  dayNumber: number,
  split: string,
): Exercise[] =>
  data?.days?.find((d) => d.dayNumber === dayNumber)?.split?.[split]
    ?.exercises ?? [];

export const applyDayOverride = (
  data: WorkoutData | null,
  override: DayOverride | null,
): WorkoutData | null => {
  if (!data?.days || !override) return data;
  return {
    ...data,
    days: data.days.map((day) => {
      if (day.dayNumber !== override.dayNumber) return day;
      const exercises = [
        ...(day.split?.[override.split]?.exercises ?? []).map((ex, i) =>
          (override.minSets[i] ?? 0) > ex.sets
            ? { ...ex, sets: override.minSets[i] }
            : ex,
        ),
        ...override.carried,
      ];
      return {
        ...day,
        split: {
          ...day.split,
          [override.split]: {
            exercises,
            totalSets: exercises.reduce((sum, ex) => sum + ex.sets, 0),
          },
        },
      };
    }),
  };
};

/**
 * Moves every logged exercise of `fromDay` onto `toDay`. An exercise the new
 * day also has keeps the new day's template, with its set count raised only as
 * far as the logs need, and any other logged exercise is appended. Unlogged
 * exercises of the old day are left behind.
 */
export const carryOverDay = ({
  fromExercises,
  toExercises,
  completedDays,
  fromDay,
  toDay,
  split,
}: {
  fromExercises: Exercise[];
  toExercises: Exercise[];
  completedDays: CompletedDays;
  fromDay: number;
  toDay: number;
  split: string;
}): { completedDays: CompletedDays; override: DayOverride | null } => {
  const toLogs = { ...completedDays[toDay] };
  const carried: Exercise[] = [];
  const minSets: Record<number, number> = {};
  const taken = new Set<number>();

  for (const [indexKey, sets] of Object.entries(completedDays[fromDay] ?? {})) {
    const exercise = fromExercises[Number(indexKey)];
    const setIndexes = Object.keys(sets).map(Number);
    if (!exercise || setIndexes.length === 0) continue;
    const needed = Math.max(...setIndexes) + 1;

    const name = normalizeExerciseName(exercise.name);
    const match = toExercises.findIndex(
      (ex, i) => !taken.has(i) && normalizeExerciseName(ex.name) === name,
    );
    let target: number;
    if (match === -1) {
      target = toExercises.length + carried.length;
      carried.push({ ...exercise, sets: Math.max(exercise.sets, needed) });
    } else {
      target = match;
      taken.add(match);
      if (needed > toExercises[match].sets) minSets[match] = needed;
    }
    // ponytail: on a slot clash the moved (live-session) set is kept. The new day
    // only holds logs of its own when it was unlocked after an earlier session.
    toLogs[target] = { ...toLogs[target], ...sets };
  }

  const next: CompletedDays = { ...completedDays };
  delete next[fromDay];
  if (Object.keys(toLogs).length > 0) next[toDay] = toLogs;

  const changed = carried.length > 0 || Object.keys(minSets).length > 0;
  return {
    completedDays: next,
    override: changed ? { dayNumber: toDay, split, carried, minSets } : null,
  };
};
