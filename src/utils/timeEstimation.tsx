import type { WorkoutData } from "@shared/types"
import type { CompletedDays } from "./dayCompletion"
import { getExerciseCompletedSets } from "./dayCompletion"
import type { ExerciseRest, RestHistory } from "./session"

/**
 * Walking to the next station. Rest is now measured within one exercise only,
 * so this is time the per-exercise averages no longer account for.
 */
export const EXERCISE_TRANSITION_SEC = 45

export interface EstimatedTimeRemainingParams {
  workoutData: WorkoutData | null | undefined
  selectedSplit: string | null
  dayNumber: number
  completedDays: CompletedDays
  timeBetweenSets: number
  sessionRestByExercise: Record<number, ExerciseRest>
  restHistory: RestHistory
}

/**
 * Estimated seconds left in the current day's workout. Each remaining exercise
 * is priced with its own rest, falling back through this session's other
 * exercises to the user's global setting.
 */
export const getEstimatedTimeRemaining = ({
  workoutData,
  selectedSplit,
  dayNumber,
  completedDays,
  timeBetweenSets,
  sessionRestByExercise,
  restHistory,
}: EstimatedTimeRemainingParams): number => {
  if (!workoutData?.days || !selectedSplit) return 0

  const exercises =
    workoutData.days.find((d) => d.dayNumber === dayNumber)?.split?.[
      selectedSplit
    ]?.exercises ?? []

  const sessionRests = Object.values(sessionRestByExercise)
  const sessionSamples = sessionRests.reduce(
    (count, rest) => count + rest.samples,
    0,
  )

  let fallbackRest = timeBetweenSets
  if (sessionSamples > 0) {
    fallbackRest = Math.round(
      sessionRests.reduce(
        (sum, rest) => sum + rest.averageSec * rest.samples,
        0,
      ) / sessionSamples,
    )
  }

  let seconds = 0
  let exercisesLeft = 0

  exercises.forEach((exercise, exerciseIndex) => {
    const remainingSets = Math.max(
      0,
      exercise.sets -
        getExerciseCompletedSets(completedDays, dayNumber, exerciseIndex),
    )
    if (remainingSets === 0) return

    exercisesLeft += 1
    seconds +=
      remainingSets *
      (sessionRestByExercise[exerciseIndex]?.averageSec ??
        restHistory[exercise.name] ??
        fallbackRest)
  })

  return seconds + Math.max(0, exercisesLeft - 1) * EXERCISE_TRANSITION_SEC
}

export const getEstimatedEndTime = (
  estimatedSecondsRemaining: number,
): Date => new Date(Date.now() + estimatedSecondsRemaining * 1000)

/** "1h 5m" / "45s". `fallback` is returned for a falsy `seconds` when given. */
export const formatTime = (seconds: number, fallback?: string): string => {
  if (fallback !== undefined && !seconds) return fallback

  // Averages arrive as floats (and `totalDuration` can be missing entirely),
  // which would otherwise render as "20m 34.56799999s" / "NaNh".
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0

  if (total < 60) {
    return `${total}s`
  }

  const minutes = Math.floor(total / 60)
  const remainingSeconds = total % 60

  if (minutes < 60) {
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`
  }

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
}
