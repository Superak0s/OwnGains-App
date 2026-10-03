import type { WorkoutData, WorkoutDay } from "@shared/types";
import { getExerciseById } from "@utils/exerciseDb";
import { targetMusclesOf } from "./matchProgram";

export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

export interface MuscleFrequencyRow {
  muscle: string;
  setsPerWeek: number;
}

interface ProgramExercise {
  name?: string;
  exerciseId?: string | null;
  primaryMuscles?: string[];
  sets?: number;
  setsBySplit?: Record<string, number>;
}

const exercisesOf = (
  day: WorkoutDay,
  split: string | null,
): ProgramExercise[] => {
  const splits = day.split ?? {};
  const chosen = split && splits[split] ? splits[split] : undefined;
  if (chosen) return chosen.exercises ?? [];
  const first = Object.values(splits)[0];
  return first?.exercises ?? day.exercises ?? [];
};

const setsOf = (exercise: ProgramExercise, split: string | null): number => {
  if (typeof exercise.sets === "number") return exercise.sets;
  const bySplit = exercise.setsBySplit ?? {};
  // No entry for the split being viewed means the exercise is not part of it.
  // Another split's count would be a different program's volume.
  return split ? (bySplit[split] ?? 0) : (Object.values(bySplit)[0] ?? 0);
};

// A custom exercise has no database entry, so its program label is the only
// muscle information there is, and a body-part label ("Legs") is used for
// every muscle it covers.
export const musclesOf = (
  exercise: ProgramExercise,
): { primary: string[]; secondary: string[] } => {
  const entry = exercise.exerciseId
    ? getExerciseById(exercise.exerciseId)
    : undefined;
  if (entry)
    return {
      primary: entry.primaryMuscles.map((m) => m.toLowerCase()),
      secondary: entry.secondaryMuscles.map((m) => m.toLowerCase()),
    };
  return {
    primary: targetMusclesOf(exercise.primaryMuscles) ?? [],
    secondary: [],
  };
};

// Programs are written as one training cycle, which is a week for almost all
// of them. Anything longer is spread back over the weeks it spans. Rounded up,
// not to nearest: a 10-day cycle is not one week of training.
const weeksIn = (dayCount: number): number =>
  Math.max(1, Math.ceil(dayCount / 7));

export const muscleFrequency = (
  program: WorkoutData | null | undefined,
  split: string | null = null,
): MuscleFrequencyRow[] => {
  const days = program?.days ?? [];
  if (days.length === 0) return [];

  const totals = new Map<string, number>();
  const add = (muscle: string, score: number) =>
    totals.set(muscle, (totals.get(muscle) ?? 0) + score);

  for (const day of days) {
    for (const exercise of exercisesOf(day, split)) {
      const sets = setsOf(exercise, split);
      if (sets <= 0) continue;
      const muscles = musclesOf(exercise);
      muscles.primary.forEach((m) => add(m, sets * PRIMARY_WEIGHT));
      muscles.secondary.forEach((m) => add(m, sets * SECONDARY_WEIGHT));
    }
  }

  const weeks = weeksIn(days.length);
  return Array.from(totals, ([muscle, score]) => ({
    muscle,
    setsPerWeek: Math.round((score / weeks) * 10) / 10,
  })).sort(
    (a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle),
  );
};
