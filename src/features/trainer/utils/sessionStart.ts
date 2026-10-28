import type { WorkoutData } from "@shared/types"
import type { CustomWorkout } from "@shared/services/trainerEvents"

export type { CustomWorkout }

export interface DayChoice {
  label: string
  start: CustomWorkout
}

/** The trainer's own days of `split` that have exercises, numbered within the split. */
export const trainerDayChoices = (data: WorkoutData | null, split: string | null): DayChoice[] => {
  if (!split) return []
  return (data?.days ?? [])
    .filter((day) => (day.split[split]?.exercises?.length ?? 0) > 0)
    .map((day, i) => ({
      label: day.dayTitle ? `Day ${i + 1} · ${day.dayTitle}` : `Day ${i + 1}`,
      start: { dayTitle: day.dayTitle ?? `Day ${i + 1}`, exercises: day.split[split].exercises },
    }))
}
