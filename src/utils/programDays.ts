import {
  getDayExerciseList,
  type ProgramDayLike,
} from "@shared/components/ProgramDayCardBase";

interface VisibleDay<Day> {
  day: Day;
  dayIdx: number;
  displayNumber: number;
}

/**
 * A split's days are appended to the shared day list, so its first day can sit
 * at dayNumber 8. Within a selected split the days are renumbered from 1 so the
 * program reads as that split's own program, and the untouched `dayNumber` remains
 * the identifier used for sessions and completion state.
 */
export function visibleDaysForSplit<Day extends ProgramDayLike>(
  days: readonly Day[],
  split: string | null,
): VisibleDay<Day>[] {
  return days
    .map((day, dayIdx) => ({ day, dayIdx }))
    .filter(({ day }) => {
      if (!split) return true;
      const exerciseCount = day.exercises?.length ?? 0;
      return exerciseCount === 0 || getDayExerciseList(day, split).length > 0;
    })
    .map(({ day, dayIdx }, position) => ({
      day,
      dayIdx,
      displayNumber: split ? position + 1 : (day.dayNumber ?? position + 1),
    }));
}
