import type {
  WorkoutData,
  WorkoutDay,
  SplitWorkout,
  ExerciseWithSets,
} from "@shared/types"
import { generateId } from "@utils/format"
import defaultSplitsJson from "./defaultSplits.json"

interface SplitDayTemplateExercise {
  name: string
  exerciseId?: string
  primaryMuscles?: string[]
  secondaryMuscles?: string[]
  sets?: number
  reps?: string
}

export interface SplitDayTemplate {
  dayTitle: string
  primaryMuscles: string[]
  secondaryMuscles?: string[]
  exercises?: SplitDayTemplateExercise[]
}

export interface SplitTemplate {
  id: string
  name: string
  description: string
  days: SplitDayTemplate[]
}

export const DEFAULT_SPLITS: SplitTemplate[] =
  defaultSplitsJson

const daySignature = (title: string, exerciseNames: string[]) =>
  `${title}|${exerciseNames.join(",")}`

// Derived from the program instead of stored, so editing, replacing or switching
// the split drops the match without extra bookkeeping.
export function findActiveTemplateId(
  workoutData: WorkoutData | null | undefined,
  splitName: string | null | undefined,
): string | null {
  if (!workoutData?.days?.length || !splitName) return null
  const programKey = `\n${workoutData.days
    .map((d) =>
      daySignature(
        d.dayTitle ?? "",
        (d.split?.[splitName]?.exercises ?? []).map((e) => e.name),
      ),
    )
    .join("\n")}\n`
  const match = DEFAULT_SPLITS.find((t) =>
    programKey.includes(
      `\n${t.days
        .map((d) =>
          daySignature(d.dayTitle, (d.exercises ?? []).map((e) => e.name)),
        )
        .join("\n")}\n`,
    ),
  )
  return match?.id ?? null
}

export function createCustomSplitTemplate(
  name: string,
  days: SplitDayTemplate[],
): SplitTemplate {
  return {
    id: generateId("custom"),
    name: name.trim() || "Custom Split",
    description: "Custom split",
    days: days.map((d) => ({
      dayTitle: d.dayTitle.trim(),
      primaryMuscles: d.primaryMuscles
        .map((m) => m.trim())
        .filter((m) => m.length > 0),
      secondaryMuscles: d.secondaryMuscles
        ?.map((m) => m.trim())
        .filter((m) => m.length > 0),
      exercises: d.exercises,
    })),
  }
}

const DEFAULT_SETS = 3

// A program can reach here with no splits at all (hand-built, or half
// migrated). Every day built against an empty split list has no sets in it.
export const DEFAULT_SPLIT_NAME = "Me"

function buildDay(
  dayNumber: number,
  day: SplitDayTemplate,
  split: string[],
  targetSplits: string[] = split,
): WorkoutDay {
  const templateExercises = day.exercises ?? []
  const exercises: ExerciseWithSets[] = templateExercises.map((e) => ({
    name: e.name,
    exerciseId: e.exerciseId,
    primaryMuscles: e.primaryMuscles ?? [],
    secondaryMuscles: e.secondaryMuscles ?? [],
    setsBySplit: Object.fromEntries(
      split.map((p) => [p, targetSplits.includes(p) ? e.sets ?? DEFAULT_SETS : 0]),
    ),
    reps: e.reps?.trim() || undefined,
  }))

  const daySplit: Record<string, SplitWorkout> = Object.fromEntries(
    split.map((p) => {
      const splitExercises = targetSplits.includes(p) ? exercises : []
      return [
        p,
        {
          exercises: splitExercises.map((e) => ({
            name: e.name,
            exerciseId: e.exerciseId,
            primaryMuscles: e.primaryMuscles,
            secondaryMuscles: e.secondaryMuscles,
            sets: e.setsBySplit[p],
            reps: e.reps,
          })),
          totalSets: splitExercises.reduce(
            (sum, e) => sum + e.setsBySplit[p],
            0,
          ),
        },
      ]
    }),
  )

  return {
    dayNumber,
    dayTitle: day.dayTitle,
    primaryMuscles: day.primaryMuscles,
    secondaryMuscles: day.secondaryMuscles ?? [],
    exercises,
    split: daySplit,
  }
}

export function buildProgramFromTemplate(
  template: SplitTemplate,
  split: string[],
): WorkoutData {
  const splits = split.length > 0 ? split : [DEFAULT_SPLIT_NAME]
  const days: WorkoutDay[] = template.days.map((day, idx) =>
    buildDay(idx + 1, day, splits),
  )

  return {
    totalDays: days.length,
    split: splits,
    days,
    success: true,
  } as WorkoutData & { success: true }
}

export function insertTemplateIntoProgram(
  workoutData: WorkoutData,
  template: SplitTemplate,
  targetSplits?: string[],
): WorkoutData {
  const existingDays = workoutData?.days ?? []
  const existingSplits = workoutData?.split ?? []
  let split = existingSplits
  if (split.length === 0)
    split = targetSplits?.length ? targetSplits : [DEFAULT_SPLIT_NAME]

  const maxDayNumber = existingDays.reduce(
    (max, d) => Math.max(max, d.dayNumber ?? 0),
    0,
  )

  const newDays: WorkoutDay[] = template.days.map((day, idx) =>
    buildDay(maxDayNumber + idx + 1, day, split, targetSplits ?? split),
  )

  const mergedDays = [...existingDays, ...newDays]

  return {
    ...workoutData,
    split,
    totalDays: mergedDays.length,
    days: mergedDays,
    success: true,
  } as WorkoutData & { success: true }
}
