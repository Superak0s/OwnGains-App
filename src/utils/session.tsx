import { ApiError } from "@shared/services/apiError"
import type { SessionStatistics, WorkoutData } from "@shared/types"
import type { CompletedDays } from "./dayCompletion"

export const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000

/**
 * Current time as an ISO-8601 string that preserves the device's local
 * timezone offset (instead of the UTC "Z" that Date.toISOString() emits).
 */
export const getLocalISOString = (): string => {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  const localTime = new Date(now.getTime() - offsetMs)
  const offsetMinutes = Math.abs(now.getTimezoneOffset())
  const sign = now.getTimezoneOffset() <= 0 ? "+" : "-"
  const hh = String(Math.floor(offsetMinutes / 60)).padStart(2, "0")
  const mm = String(offsetMinutes % 60).padStart(2, "0")
  return localTime.toISOString().replace("Z", `${sign}${hh}:${mm}`)
}

export const isSessionInactive = (
  lastActivityTime: string | number | null,
): boolean => {
  if (!lastActivityTime) return false
  const elapsed = Date.now() - new Date(lastActivityTime).getTime()
  return elapsed > INACTIVITY_THRESHOLD_MS
}

export const isLocalSessionId = (
  sessionId: string | null | undefined,
): boolean => {
  return sessionId?.startsWith("local_") ?? false
}

/** Created by the offline service. It is never remapped or sent to a server. */
export const isOfflineSessionId = (
  sessionId: string | null | undefined,
): boolean => sessionId?.startsWith("off_") ?? false

/**
 * A session id belongs to the mode that created it. Restoring an `off_` id in
 * online mode (or a server id in offline mode) points the live session at a
 * store that has never heard of it, and every set recorded against it is lost.
 */
export const isSessionIdForMode = (
  sessionId: string | null | undefined,
  serverless: boolean,
): boolean => {
  if (!sessionId) return false
  return serverless
    ? isOfflineSessionId(sessionId)
    : !isOfflineSessionId(sessionId)
}

const SESSION_GONE_CODES = new Set(["SESSION_ALREADY_ENDED", "SESSION_NOT_FOUND"])

/**
 * True only when the server itself says this session no longer exists or isn't
 * ours, so a queued op for it can be discarded. Anything else (a proxy 403, a
 * 401, "Exercise not found", a network failure) must remain queued and retry.
 */
export const isSessionGone = (error: unknown): boolean => {
  if (!(error instanceof ApiError)) return false
  if (error.code && SESSION_GONE_CODES.has(error.code)) return true
  // Servers that predate SESSION_NOT_FOUND answer a missing or foreign session
  // with this message and no code.
  return (
    (error.status === 403 || error.status === 404) &&
    /^session not found/i.test(error.message)
  )
}

// Clamped at 0: a device clock moved backwards (NTP correction, manual change)
// otherwise renders as a negative elapsed time on the live session ticker.
const secondsSince = (timestamp: string | null): number => {
  if (!timestamp) return 0
  const started = new Date(timestamp).getTime()
  if (Number.isNaN(started)) return 0
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

export const calculateSessionTime = secondsSince

export const calculateRestTime = secondsSince

/**
 * Plausible seconds between two sets of the same exercise. Below the floor the
 * pair was logged back to back. Above the ceiling the user walked away.
 */
export const REST_WINDOW_MIN_SEC = 10
export const REST_WINDOW_MAX_SEC = 1200

export interface ExerciseRest {
  averageSec: number
  /** Preferred over the mean for learning: one phone-scroll set can't skew it. */
  medianSec: number
  samples: number
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

const restGaps = (setTimesMs: number[]): number[] => {
  const gaps: number[] = []
  for (let i = 1; i < setTimesMs.length; i++) {
    const gap = Math.floor((setTimesMs[i] - setTimesMs[i - 1]) / 1000)
    if (gap >= REST_WINDOW_MIN_SEC && gap <= REST_WINDOW_MAX_SEC) gaps.push(gap)
  }
  return gaps
}

/**
 * Rest keyed by exercise index. Gaps are only measured within one exercise,
 * the walk from one station to the next is a transition, not rest, and pooling
 * it in inflates every estimate built on these numbers.
 */
export const calculateRestByExercise = (
  completedDays: CompletedDays,
  dayNumber: number,
  workoutStartTime: string | null,
): Record<number, ExerciseRest> => {
  const day = completedDays[dayNumber]
  if (!workoutStartTime || !day) return {}

  const sessionStart = new Date(workoutStartTime).getTime()
  const byExercise: Record<number, ExerciseRest> = {}

  for (const [exerciseIndex, sets] of Object.entries(day)) {
    const setTimes = Object.values(sets)
      .map((setData) => new Date(setData.completedAt).getTime())
      .filter((time) => time >= sessionStart)
      .sort((a, b) => a - b)

    const gaps = restGaps(setTimes)
    if (gaps.length === 0) continue

    byExercise[Number(exerciseIndex)] = {
      averageSec: Math.round(
        gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length,
      ),
      medianSec: Math.round(median(gaps)),
      samples: gaps.length,
    }
  }

  return byExercise
}

/** The exercise the most recent set belongs to, for "resting from what". */
export const getLastSetExerciseIndex = (
  completedDays: CompletedDays,
  dayNumber: number,
): number | null => {
  const day = completedDays[dayNumber]
  if (!day) return null

  let latestIndex: number | null = null
  let latestTime = -Infinity

  for (const [exerciseIndex, sets] of Object.entries(day)) {
    for (const setData of Object.values(sets)) {
      const time = new Date(setData.completedAt).getTime()
      if (time > latestTime) {
        latestTime = time
        latestIndex = Number(exerciseIndex)
      }
    }
  }

  return latestIndex
}

export const calculateSessionAverageRest = (
  completedDays: CompletedDays,
  dayNumber: number,
  workoutStartTime: string | null,
  fallbackTime: number = 120,
): number => {
  const byExercise = Object.values(
    calculateRestByExercise(completedDays, dayNumber, workoutStartTime),
  )
  if (byExercise.length === 0) return fallbackTime

  // Pooled across exercises, not a mean of means: an exercise with six sets
  // says more about this session's pace than one with two.
  const samples = byExercise.reduce((count, rest) => count + rest.samples, 0)
  const total = byExercise.reduce(
    (sum, rest) => sum + rest.averageSec * rest.samples,
    0,
  )
  return Math.round(total / samples)
}

/** Rest the user actually takes, per exercise name, learned across sessions. */
export type RestHistory = Record<string, number>

const REST_HISTORY_ALPHA = 0.3

/** One representative rest across every exercise the user has been measured on. */
export const pooledRestHistory = (history: RestHistory): number | null => {
  const values = Object.values(history).filter((value) => value > 0)
  return values.length === 0 ? null : Math.round(median(values))
}

export const mergeRestHistory = (
  history: RestHistory,
  sessionRest: Record<number, ExerciseRest>,
  exerciseNameAt: (exerciseIndex: number) => string | undefined,
): RestHistory => {
  const merged = { ...history }
  for (const [exerciseIndex, rest] of Object.entries(sessionRest)) {
    const name = exerciseNameAt(Number(exerciseIndex))
    if (!name) continue
    const prior = merged[name]
    merged[name] = Math.round(
      prior === undefined
        ? rest.medianSec
        : prior * (1 - REST_HISTORY_ALPHA) + rest.medianSec * REST_HISTORY_ALPHA,
    )
  }
  return merged
}

const countCompletedSets = (
  completedDays: CompletedDays,
  dayNumber: number,
): number =>
  Object.values(completedDays[dayNumber] ?? {}).reduce(
    (count, exerciseSets) => count + Object.keys(exerciseSets).length,
    0,
  )

export { type SessionStatistics }

export const getSessionStatistics = (
  workoutStartTime: string | null,
  lastSetEndTime: string | null,
  completedDays: CompletedDays,
  dayNumber: number,
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
  timeBetweenSets: number,
): SessionStatistics | null => {
  if (!workoutStartTime) return null

  const totalTime = calculateSessionTime(workoutStartTime)
  const averageRest = calculateSessionAverageRest(
    completedDays,
    dayNumber,
    workoutStartTime,
    timeBetweenSets,
  )
  const currentRest = calculateRestTime(lastSetEndTime)
  const completedSetsCount = countCompletedSets(completedDays, dayNumber)

  const day = workoutData?.days?.find((d) => d.dayNumber === dayNumber)
  const totalSets = day?.split?.[selectedSplit ?? ""]?.totalSets || 0

  return {
    totalTime,
    averageRest,
    currentRest,
    completedSets: completedSetsCount,
    totalSets,
  }
}
