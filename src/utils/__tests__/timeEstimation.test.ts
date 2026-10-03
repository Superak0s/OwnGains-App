import {
  EXERCISE_TRANSITION_SEC,
  formatTime,
  getEstimatedTimeRemaining,
} from "../timeEstimation"
import type { WorkoutData } from "@shared/types"
import type { CompletedDays } from "../dayCompletion"

describe("getEstimatedTimeRemaining", () => {
  const workoutData = {
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [
              { name: "Squat", sets: 3 },
              { name: "Curl", sets: 2 },
            ],
          },
        },
      },
    ],
  } as unknown as WorkoutData

  const params = {
    workoutData,
    selectedSplit: "A",
    dayNumber: 1,
    completedDays: {} as CompletedDays,
    timeBetweenSets: 100,
    sessionRestByExercise: {},
    restHistory: {},
  }

  it("prices each exercise with its own rest and adds one transition", () => {
    expect(
      getEstimatedTimeRemaining({
        ...params,
        sessionRestByExercise: {
          0: { averageSec: 180, medianSec: 180, samples: 2 },
        },
        restHistory: { Curl: 60 },
      }),
    ).toBe(3 * 180 + 2 * 60 + EXERCISE_TRANSITION_SEC)
  })

  it("falls back through history to the manual setting per exercise", () => {
    expect(
      getEstimatedTimeRemaining({ ...params, restHistory: { Squat: 200 } }),
    ).toBe(3 * 200 + 2 * 100 + EXERCISE_TRANSITION_SEC)
  })

  it("charges no transition when only one exercise is left", () => {
    expect(
      getEstimatedTimeRemaining({
        ...params,
        completedDays: {
          1: { 0: { 0: {}, 1: {}, 2: {} } },
        } as unknown as CompletedDays,
      }),
    ).toBe(2 * 100)
  })

  it("is zero once every set is done", () => {
    expect(
      getEstimatedTimeRemaining({
        ...params,
        completedDays: {
          1: { 0: { 0: {}, 1: {}, 2: {} }, 1: { 0: {}, 1: {} } },
        } as unknown as CompletedDays,
      }),
    ).toBe(0)
  })
})

describe("formatTime", () => {
  it("formats whole durations", () => {
    expect(formatTime(45)).toBe("45s")
    expect(formatTime(60)).toBe("1m")
    expect(formatTime(125)).toBe("2m 5s")
    expect(formatTime(3600)).toBe("1h")
    expect(formatTime(3900)).toBe("1h 5m")
  })

  it("rounds fractional seconds instead of printing them raw", () => {
    expect(formatTime(1234.5678)).toBe("20m 35s")
    expect(formatTime(59.4)).toBe("59s")
  })

  it("never renders NaN or negative durations", () => {
    expect(formatTime(Number.NaN)).toBe("0s")
    expect(formatTime(undefined as unknown as number)).toBe("0s")
    expect(formatTime(-30)).toBe("0s")
  })

  it("prefers the fallback for empty durations", () => {
    expect(formatTime(0, "N/A")).toBe("N/A")
    expect(formatTime(Number.NaN, "N/A")).toBe("N/A")
    expect(formatTime(90, "N/A")).toBe("1m 30s")
  })
})
