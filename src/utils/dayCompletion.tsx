import type {
  CompletedDays,
  LockedDays,
  SetDetail,
  WorkoutData,
} from "@shared/types";
import { toDateString } from "@utils/format";

export type { CompletedDays, LockedDays, SetDetail };

export const isSetComplete = (
  completedDays: CompletedDays,
  dayNumber: number,
  exerciseIndex: number,
  setIndex: number,
): boolean => {
  return !!completedDays[dayNumber]?.[exerciseIndex]?.[setIndex];
};

export const getSetDetails = (
  completedDays: CompletedDays,
  dayNumber: number,
  exerciseIndex: number,
  setIndex: number,
): SetDetail | null => {
  return completedDays[dayNumber]?.[exerciseIndex]?.[setIndex] || null;
};

export const getExerciseCompletedSets = (
  completedDays: CompletedDays,
  dayNumber: number,
  exerciseIndex: number,
): number => {
  return Object.keys(completedDays[dayNumber]?.[exerciseIndex] || {}).length;
};

const areAllExercisesComplete = (
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
  dayNumber: number,
  completedDays: CompletedDays,
): boolean => {
  if (!workoutData?.days || !selectedSplit) return false;

  const exercises =
    workoutData.days.find((d) => d.dayNumber === dayNumber)?.split?.[
      selectedSplit
    ]?.exercises ?? [];
  if (exercises.length === 0) return false;

  return exercises.every(
    (exercise, index) =>
      getExerciseCompletedSets(completedDays, dayNumber, index) >=
      exercise.sets,
  );
};

export const isDayComplete = (
  lockedDays: LockedDays,
  dayNumber: number,
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
  completedDays: CompletedDays,
): boolean => {
  if (lockedDays[dayNumber]) {
    return true;
  }

  return areAllExercisesComplete(
    workoutData,
    selectedSplit,
    dayNumber,
    completedDays,
  );
};

export const isDayLocked = (
  lockedDays: LockedDays,
  dayNumber: number,
): boolean => {
  return !!lockedDays[dayNumber];
};

/** Local midnight of the Monday that starts `date`'s week, when weekly progress resets. */
export const weekStart = (date: Date = new Date()): Date => {
  const monday = new Date(date);
  monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
};

export const shouldResetForMonday = (
  lastResetDate: string | null,
): string | null => {
  const thisMondayString = toDateString(weekStart());

  // Any day of the week can trigger the reset: checking "is it Monday" means
  // missing that one day leaves everything locked for the rest of the week.
  if (!lastResetDate || lastResetDate < thisMondayString) {
    return thisMondayString;
  }

  return null;
};
