import {
  buildProgressChartData,
  computeExerciseInsights,
  sessionOneRepMaxes,
  workingSets,
} from "../exerciseStats"
import { estimateOneRepMax } from "@utils/oneRepMax"
import type { ExerciseHistoryEntry } from "../../types"

function entry(
  overrides: Partial<ExerciseHistoryEntry> & { date: Date },
): ExerciseHistoryEntry {
  const weight = overrides.weight ?? 100
  const reps = overrides.reps ?? 5
  return {
    exerciseName: "Bench Press",
    weight,
    reps,
    load: weight,
    dayNumber: 1,
    setNumber: 1,
    source: "local",
    isAssisted: false,
    isWarmup: false,
    ...overrides,
  }
}

const daysAgo = (days: number, hour = 12): Date => {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return date
}

describe("estimateOneRepMax", () => {
  it("returns the load itself for one rep", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100)
  })

  it("applies the Epley formula above one rep", () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.667, 2)
  })

  it("returns 0 for non-positive or non-finite input", () => {
    expect(estimateOneRepMax(0, 5)).toBe(0)
    expect(estimateOneRepMax(100, 0)).toBe(0)
    expect(estimateOneRepMax(Number.NaN, 5)).toBe(0)
  })
})

describe("workingSets", () => {
  it("drops warm-up sets", () => {
    const entries = [
      entry({ date: daysAgo(1), weight: 40, isWarmup: true }),
      entry({ date: daysAgo(1), weight: 100 }),
    ]
    expect(workingSets(entries)).toHaveLength(1)
    expect(workingSets(entries)[0].weight).toBe(100)
  })
})

describe("sessionOneRepMaxes", () => {
  it("takes the best set per calendar day, in chronological order", () => {
    const points = sessionOneRepMaxes([
      entry({ date: daysAgo(7), weight: 100, reps: 5 }),
      entry({ date: daysAgo(7, 13), weight: 90, reps: 10 }),
      entry({ date: daysAgo(1), weight: 110, reps: 5 }),
    ])
    expect(points).toHaveLength(2)
    // The lighter 90x10 set ranks above the heavier 100x5 one on the same day.
    expect(points[0].value).toBeCloseTo(estimateOneRepMax(90, 10), 5)
    expect(points[1].value).toBeCloseTo(estimateOneRepMax(110, 5), 5)
  })
})

describe("computeExerciseInsights", () => {
  it("returns zeroed insights when there are no working sets", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(1), isWarmup: true }),
    ])
    expect(insights.workingSetCount).toBe(0)
    expect(insights.bestOneRepMax).toBe(0)
    expect(insights.records.heaviestSet).toBeNull()
    expect(insights.daysSinceLast).toBeNull()
  })

  it("counts older record sets towards records but not trends", () => {
    const window = [
      entry({ date: daysAgo(14), weight: 100, reps: 5 }),
      entry({ date: daysAgo(7), weight: 100, reps: 5 }),
    ]
    const oldRecord = entry({ date: daysAgo(400), weight: 140, reps: 5 })
    const insights = computeExerciseInsights(window, [oldRecord])

    expect(insights.records.heaviestSet?.value).toBe(140)
    expect(insights.bestOneRepMax).toBeCloseTo(estimateOneRepMax(140, 5), 1)
    expect(insights.repMaxTable.find((row) => row.reps === 5)?.load).toBe(140)
    expect(insights.weeksSinceRecord).toBeGreaterThan(50)
    expect(insights.currentOneRepMax).toBeCloseTo(estimateOneRepMax(100, 5), 1)
    expect(insights.workingSetCount).toBe(2)
  })

  it("keeps the older date when a recent set only ties the record", () => {
    const oldDate = daysAgo(400)
    const insights = computeExerciseInsights(
      [entry({ date: daysAgo(1), weight: 140, reps: 5 })],
      [entry({ date: oldDate, weight: 140, reps: 5 })],
    )
    expect(insights.records.heaviestSet?.date).toEqual(oldDate)
  })

  it("ignores warm-ups when picking records", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(2), weight: 200, reps: 20, isWarmup: true }),
      entry({ date: daysAgo(2), weight: 100, reps: 5 }),
    ])
    expect(insights.records.heaviestSet?.value).toBe(100)
    expect(insights.records.mostReps?.value).toBe(5)
    expect(insights.workingSetCount).toBe(1)
  })

  it("tracks a rising 1RM as positive weekly progress", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(21), weight: 100, reps: 5 }),
      entry({ date: daysAgo(14), weight: 105, reps: 5 }),
      entry({ date: daysAgo(7), weight: 110, reps: 5 }),
      entry({ date: daysAgo(0), weight: 115, reps: 5 }),
    ])
    expect(insights.progressPerWeek).toBeGreaterThan(0)
    expect(insights.oneRepMaxChange30d).toBeGreaterThan(0)
    expect(insights.currentOneRepMax).toBeCloseTo(
      estimateOneRepMax(115, 5),
      1,
    )
    expect(insights.isStalled).toBe(false)
    expect(insights.daysSinceLast).toBe(0)
  })

  it("flags a stall when the best 1RM is over four weeks old", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(60), weight: 120, reps: 5 }),
      entry({ date: daysAgo(3), weight: 100, reps: 5 }),
    ])
    expect(insights.isStalled).toBe(true)
    expect(insights.weeksSinceRecord).toBeGreaterThan(4)
  })

  it("builds a rep max table from the best load at each rep count", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(9), weight: 100, reps: 5 }),
      entry({ date: daysAgo(2), weight: 110, reps: 5 }),
      entry({ date: daysAgo(2), weight: 80, reps: 10 }),
      entry({ date: daysAgo(2), weight: 60, reps: 20 }),
    ])
    expect(insights.repMaxTable).toEqual([
      { reps: 5, load: 110, date: expect.any(Date) },
      { reps: 10, load: 80, date: expect.any(Date) },
    ])
  })

  it("splits working sets across rep ranges", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(3), reps: 3 }),
      entry({ date: daysAgo(3), reps: 8 }),
      entry({ date: daysAgo(3), reps: 8 }),
      entry({ date: daysAgo(3), reps: 15 }),
    ])
    expect(insights.repRanges).toEqual({
      strength: 25,
      hypertrophy: 50,
      endurance: 25,
    })
  })

  it("measures rest between sets net of set duration", () => {
    const base = daysAgo(1).getTime()
    const insights = computeExerciseInsights([
      entry({ date: new Date(base) }),
      entry({ date: new Date(base + 150_000), durationSec: 30 }),
      entry({ date: new Date(base + 300_000), durationSec: 30 }),
    ])
    expect(insights.avgRestSec).toBe(120)
  })

  it("compares rep drop-off on long-rest sessions against short-rest ones", () => {
    // Four sessions of three sets: two rested 60s, two rested 240s. The short
    // ones bleed two reps by the last set, the long ones hold.
    const session = (day: number, restSec: number, lastReps: number) => {
      const base = daysAgo(day).getTime()
      return [
        entry({ date: new Date(base), reps: 10 }),
        entry({ date: new Date(base + restSec * 1000), reps: 10 }),
        entry({ date: new Date(base + restSec * 2000), reps: lastReps }),
      ]
    }
    const insights = computeExerciseInsights([
      ...session(8, 60, 8),
      ...session(6, 60, 8),
      ...session(4, 240, 10),
      ...session(2, 240, 10),
    ])
    expect(insights.restPerformance).toEqual({
      longRestSec: 240,
      longRestDropOffPct: 0,
      shortRestSec: 60,
      shortRestDropOffPct: 20,
    })
  })

  it("withholds the rest comparison until there are enough sessions", () => {
    const base = daysAgo(1).getTime()
    const insights = computeExerciseInsights([
      entry({ date: new Date(base), reps: 10 }),
      entry({ date: new Date(base + 120_000), reps: 8 }),
    ])
    expect(insights.restPerformance).toBeNull()
  })

  it("reports rep drop-off from the first to the last set of a session", () => {
    const base = daysAgo(1).getTime()
    const insights = computeExerciseInsights([
      entry({ date: new Date(base), reps: 10 }),
      entry({ date: new Date(base + 200_000), reps: 8 }),
    ])
    expect(insights.dropOffPct).toBe(20)
  })

  it("ranks assisted sets by effective load, not by the assist weight", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(5), weight: 40, reps: 5, load: 40, isAssisted: true }),
      entry({ date: daysAgo(1), weight: 20, reps: 5, load: 60, isAssisted: true }),
    ])
    expect(insights.records.heaviestSet?.value).toBe(60)
  })

  it("counts sessions per week over the logged span", () => {
    const insights = computeExerciseInsights([
      entry({ date: daysAgo(14) }),
      entry({ date: daysAgo(7) }),
      entry({ date: daysAgo(0) }),
    ])
    expect(insights.sessionsPerWeek).toBe(1.5)
    expect(insights.medianDaysBetween).toBe(7)
  })
})

describe("buildProgressChartData", () => {
  it("caps a long history at 60 points, keeping the peak and the latest", () => {
    const entries = Array.from({ length: 300 }, (_, i) =>
      entry({ date: daysAgo(300 - i), weight: i === 137 ? 999 : 50 + (i % 10) }),
    )
    const data = buildProgressChartData(entries, "weight").datasets[0].data

    expect(data.length).toBeLessThanOrEqual(60)
    expect(data).toContain(999)
    expect(data.at(-1)).toBe(50 + (299 % 10))
  })

  it("keeps every point of a short history, one per training day", () => {
    const entries = [
      entry({ date: daysAgo(2, 9), weight: 80 }),
      entry({ date: daysAgo(2, 18), weight: 100 }),
      entry({ date: daysAgo(1), weight: 110 }),
    ]
    expect(buildProgressChartData(entries, "weight").datasets[0].data).toEqual([90, 110])
  })
})
