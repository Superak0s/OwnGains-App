import {
  CUSTOM_EXERCISE_ID,
  type ExerciseWithSets,
  type WorkoutData,
  type WorkoutDay,
} from "@shared/types";
import { visibleDaysForSplit } from "@utils/programDays";
import type { SplitDayDraft } from "../types";

export const DEFAULT_SETS = 3;

/**
 * Digits with at most one internal hyphen: "1-2-3" targets 3 once
 * targetRepCeiling takes the largest run, and "-8" is not a range at all.
 */
export const sanitizeRepsInput = (value: string): string => {
  const [first = "", ...rest] = value
    .replace(/[^\d-]/g, "")
    .replace(/^-+/, "")
    .split("-");
  return rest.length > 0 ? `${first}-${rest.join("").replaceAll("-", "")}` : first;
};

export const normalizeReps = (value: string): string =>
  sanitizeRepsInput(value).replace(/-$/, "");

// Recomputed, never merged with the day's previous labels: a union would keep
// reporting "Chest" after the last chest exercise was removed.
const musclesOf = (
  exercises: readonly ExerciseWithSets[],
  pick: (e: ExerciseWithSets) => readonly string[] | undefined,
): string[] => [
  ...new Set(
    exercises
      .filter((e) =>
        Object.values(e.setsBySplit ?? {}).some((s) => Number(s) > 0),
      )
      .flatMap((e) => pick(e) ?? []),
  ),
];

const setsFor = (exercise: ExerciseWithSets, split: string): number =>
  Number(exercise.setsBySplit?.[split] ?? 0);

export function draftsFromProgram(
  days: readonly WorkoutDay[],
  split: string,
): SplitDayDraft[] {
  return visibleDaysForSplit(days, split).map(({ day, dayIdx }) => ({
    id: `day-${dayIdx}`,
    dayIdx,
    dayTitle: day.dayTitle ?? "",
    exercises: (day.exercises ?? [])
      .filter((ex) => setsFor(ex, split) > 0)
      .map((ex) => ({
        name: ex.name,
        exerciseId: ex.exerciseId ?? "",
        primaryMuscles: ex.primaryMuscles ?? [],
        secondaryMuscles: ex.secondaryMuscles ?? [],
        sets: String(setsFor(ex, split)),
        reps: ex.reps ?? "",
      })),
  }));
}

function writeDraft(
  day: WorkoutDay,
  split: string,
  draft: SplitDayDraft,
  splits: readonly string[],
): WorkoutDay {
  const exercises = [...(day.exercises ?? [])];
  const splitExercises = draft.exercises.map((d) => {
    const parsed = Number(d.sets);
    const sets =
      d.sets.trim() === "" || !Number.isFinite(parsed) ? DEFAULT_SETS : parsed;
    const reps = d.reps.trim();
    // Every custom exercise shares one id, so only a real database id
    // identifies a row, and the rest are told apart by name.
    const byId = d.exerciseId && d.exerciseId !== CUSTOM_EXERCISE_ID;
    const existing = exercises.findIndex((e) =>
      byId ? e.exerciseId === d.exerciseId : e.name === d.name,
    );
    if (existing >= 0) {
      exercises[existing] = {
        ...exercises[existing],
        setsBySplit: { ...exercises[existing].setsBySplit, [split]: sets },
        reps: reps || undefined,
      };
    } else {
      exercises.push({
        name: d.name,
        exerciseId: d.exerciseId || undefined,
        primaryMuscles: d.primaryMuscles,
        secondaryMuscles: d.secondaryMuscles,
        setsBySplit: Object.fromEntries(
          splits.map((s) => [s, s === split ? sets : 0]),
        ),
        reps: reps || undefined,
      });
    }
    return {
      name: d.name,
      exerciseId: d.exerciseId || undefined,
      primaryMuscles: d.primaryMuscles,
      secondaryMuscles: d.secondaryMuscles,
      sets,
      reps: reps || undefined,
    };
  });

  return {
    ...day,
    dayTitle: draft.dayTitle || day.dayTitle,
    primaryMuscles: musclesOf(exercises, (e) => e.primaryMuscles),
    secondaryMuscles: musclesOf(exercises, (e) => e.secondaryMuscles),
    exercises,
    split: {
      ...day.split,
      [split]: {
        exercises: splitExercises,
        totalSets: splitExercises.reduce((sum, e) => sum + e.sets, 0),
      },
    },
  };
}

/**
 * Days are shared across every split, so editing one split never deletes a day
 * outright: it only zeroes that split's sets. A day that ends up with no sets
 * for any split is dropped, which is how removing a day actually happens.
 */
export function applySplitDraft(
  workoutData: WorkoutData,
  split: string,
  drafts: readonly SplitDayDraft[],
): WorkoutData {
  const splits = workoutData.split ?? [split];
  const edits = new Map(
    drafts
      .filter((d) => d.dayIdx !== undefined)
      .map((d) => [d.dayIdx as number, d]),
  );

  const cleared = (workoutData.days ?? []).map((day) => ({
    ...day,
    exercises: (day.exercises ?? []).map((e) => ({
      ...e,
      setsBySplit: { ...e.setsBySplit, [split]: 0 },
    })),
    split: { ...day.split, [split]: { exercises: [], totalSets: 0 } },
  }));

  let nextDayNumber = cleared.reduce(
    (max, d) => Math.max(max, d.dayNumber ?? 0),
    0,
  );

  const edited = cleared.map((day, idx) => {
    const draft = edits.get(idx);
    return draft ? writeDraft(day, split, draft, splits) : day;
  });

  const added = drafts
    .filter((d) => d.dayIdx === undefined)
    .map((draft) => {
      nextDayNumber += 1;
      const blank: WorkoutDay = {
        dayNumber: nextDayNumber,
        dayTitle: draft.dayTitle,
        primaryMuscles: [],
        secondaryMuscles: [],
        exercises: [],
        split: Object.fromEntries(
          splits.map((s) => [s, { exercises: [], totalSets: 0 }]),
        ),
      };
      return writeDraft(blank, split, draft, splits);
    });

  const days = [...edited, ...added].filter((day) =>
    (day.exercises ?? []).some((e) =>
      Object.values(e.setsBySplit ?? {}).some((s) => Number(s) > 0),
    ),
  );

  return { ...workoutData, days, totalDays: days.length, split: splits };
}
