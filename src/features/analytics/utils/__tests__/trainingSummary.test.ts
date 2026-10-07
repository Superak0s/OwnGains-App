import {
  getPeriodDateRange,
  aggregateTrainingSummary,
  buildTrainingSetEntries,
  getUndertrainedMuscleGroups,
  muscleCredit,
  weeklySetVolume,
  type TrainingSetEntry,
} from "../trainingSummary";
import type { WorkoutData } from "@shared/types";
import type { CompletedDays } from "../../types";

describe("getPeriodDateRange", () => {
  // Wednesday
  const now = new Date("2026-08-12T15:30:00");

  it("quarter spans a rolling 90 days ending today", () => {
    const range = getPeriodDateRange("quarter", null, now);
    expect(range.start.toISOString()).toBe(
      new Date("2026-05-15T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-12T23:59:59.999").toISOString(),
    );
  });

  it("week spans Monday through end of today", () => {
    const range = getPeriodDateRange("week", null, now);
    expect(range.start.toISOString()).toBe(
      new Date("2026-08-10T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-12T23:59:59.999").toISOString(),
    );
  });

  it("month spans a rolling 30 days ending today", () => {
    const range = getPeriodDateRange("month", null, now);
    expect(range.start.toISOString()).toBe(
      new Date("2026-07-14T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-12T23:59:59.999").toISOString(),
    );
  });

  it("custom uses the given range, normalized to full days", () => {
    const range = getPeriodDateRange(
      "custom",
      {
        start: new Date("2026-08-01T09:00:00"),
        end: new Date("2026-08-05T18:00:00"),
      },
      now,
    );
    expect(range.start.toISOString()).toBe(
      new Date("2026-08-01T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-05T23:59:59.999").toISOString(),
    );
  });

  it("custom with a reversed range swaps start and end", () => {
    const range = getPeriodDateRange(
      "custom",
      {
        start: new Date("2026-08-05T00:00:00"),
        end: new Date("2026-08-01T00:00:00"),
      },
      now,
    );
    expect(range.start.toISOString()).toBe(
      new Date("2026-08-01T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-05T23:59:59.999").toISOString(),
    );
  });

  it("custom with no range falls back to today", () => {
    const range = getPeriodDateRange("custom", null, now);
    expect(range.start.toISOString()).toBe(
      new Date("2026-08-12T00:00:00").toISOString(),
    );
    expect(range.end.toISOString()).toBe(
      new Date("2026-08-12T23:59:59.999").toISOString(),
    );
  });
});

describe("aggregateTrainingSummary", () => {
  const range = {
    start: new Date("2026-08-10T00:00:00"),
    end: new Date("2026-08-12T23:59:59.999"),
  };

  const entries: TrainingSetEntry[] = [
    {
      date: new Date("2026-08-11T10:00:00"),
      exerciseName: "Bench Press",
      primaryMuscles: ["Chest"],
      secondaryMuscles: ["Triceps"],
      weight: 60,
      reps: 8,
      dayNumber: 1,
    },
    {
      date: new Date("2026-08-11T10:05:00"),
      exerciseName: "Bench Press",
      primaryMuscles: ["Chest"],
      secondaryMuscles: ["Triceps"],
      weight: 62.5,
      reps: 6,
      dayNumber: 1,
    },
    {
      date: new Date("2026-08-12T09:00:00"),
      exerciseName: "Squat",
      primaryMuscles: ["Legs"],
      secondaryMuscles: [],
      weight: 100,
      reps: 5,
      dayNumber: 1,
    },
    // compound lift: should credit both primary muscles, but not the secondary
    {
      date: new Date("2026-08-11T12:00:00"),
      exerciseName: "Clean and Press",
      primaryMuscles: ["Shoulders", "Legs"],
      secondaryMuscles: ["Back"],
      weight: 40,
      reps: 5,
      dayNumber: 1,
    },
    // outside range
    {
      date: new Date("2026-08-09T09:00:00"),
      exerciseName: "Deadlift",
      primaryMuscles: ["Back"],
      secondaryMuscles: ["Legs"],
      weight: 120,
      reps: 5,
      dayNumber: 1,
    },
    // no primary muscle recorded
    {
      date: new Date("2026-08-11T11:00:00"),
      exerciseName: "Overhead Press",
      primaryMuscles: [],
      secondaryMuscles: [],
      weight: 30,
      reps: 10,
      dayNumber: 1,
    },
  ];

  it("filters entries outside the date range", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const total = summary.exercises.reduce((sum, e) => sum + e.sets, 0);
    // Deadlift excluded
    expect(total).toBe(5);
  });

  it("counts sets per muscle group", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const chest = summary.primaryMuscles.find((m) => m.primaryMuscle === "Chest");
    expect(chest?.sets).toBe(2);
  });

  it("credits a compound lift toward every primary muscle, but not secondary", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const legs = summary.primaryMuscles.find((m) => m.primaryMuscle === "Legs");
    const shoulders = summary.primaryMuscles.find(
      (m) => m.primaryMuscle === "Shoulders",
    );
    // Squat (Legs) + Clean and Press (Legs) = 2
    expect(legs?.sets).toBe(2);
    expect(shoulders?.sets).toBe(1);
    // "Back" only shows up as a secondary muscle within range (and as a
    // primary muscle on the out-of-range Deadlift), so it shouldn't appear
    const back = summary.primaryMuscles.find((m) => m.primaryMuscle === "Back");
    expect(back).toBeUndefined();
  });

  it("buckets entries with no primary muscle under Unknown", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const unknown = summary.primaryMuscles.find(
      (m) => m.primaryMuscle === "Unknown",
    );
    expect(unknown?.sets).toBe(1);
  });

  it("counts sets per exercise and carries its muscle groups", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const bench = summary.exercises.find(
      (e) => e.exerciseName === "Bench Press",
    );
    expect(bench?.sets).toBe(2);
    expect(bench?.primaryMuscles).toEqual(["Chest"]);
    expect(bench?.secondaryMuscles).toEqual(["Triceps"]);
  });

  it("sorts both breakdowns by sets descending", () => {
    const summary = aggregateTrainingSummary(entries, range);
    const setsDesc = summary.primaryMuscles.every(
      (row, i, arr) => i === 0 || arr[i - 1].sets >= row.sets,
    );
    expect(setsDesc).toBe(true);
  });

  it("returns empty arrays for no matching entries", () => {
    const summary = aggregateTrainingSummary([], range);
    expect(summary.primaryMuscles).toEqual([]);
    expect(summary.exercises).toEqual([]);
  });
});

describe("buildTrainingSetEntries", () => {
  it("carries dayNumber and muscle groups through from completedDays", () => {
    const workoutData: WorkoutData = {
      days: [
        {
          dayNumber: 1,
          split: {
            solo: {
              totalSets: 3,
              exercises: [
                {
                  name: "Bench Press",
                  primaryMuscles: ["Chest"],
                  secondaryMuscles: ["Triceps"],
                  sets: 3,
                },
              ],
            },
          },
        },
      ],
    };
    const completedDays = {
      1: {
        0: {
          0: {
            weight: 60,
            reps: 8,
            completedAt: "2026-08-11T10:00:00",
            note: "",
            isWarmup: false,
          },
        },
      },
    };
    const entries = buildTrainingSetEntries(
      [],
      workoutData,
      "solo",
      completedDays,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].dayNumber).toBe(1);
    expect(entries[0].primaryMuscles).toEqual(["Chest"]);
    expect(entries[0].secondaryMuscles).toEqual(["Triceps"]);
  });

  it("drops sets with a missing or unparseable timestamp", () => {
    const workoutData: WorkoutData = {
      days: [
        {
          dayNumber: 1,
          split: {
            solo: {
              totalSets: 2,
              exercises: [
                {
                  name: "Bench Press",
                  primaryMuscles: ["Chest"],
                  secondaryMuscles: [],
                  sets: 2,
                },
              ],
            },
          },
        },
      ],
    };
    const completedDays = {
      1: {
        0: {
          0: { weight: 60, reps: 8, note: "", isWarmup: false },
          1: {
            weight: 60,
            reps: 8,
            completedAt: "not a date",
            note: "",
            isWarmup: false,
          },
        },
      },
    } as unknown as CompletedDays;
    const sessions = [
      { dayNumber: 1, setTimings: [{ setIndex: 0, weight: 60, reps: 8 }] },
    ] as unknown as Parameters<typeof buildTrainingSetEntries>[0];

    expect(
      buildTrainingSetEntries(sessions, workoutData, "solo", completedDays),
    ).toEqual([]);
  });

  it("pulls primary/secondary muscles from server session timings", () => {
    const sessions = [
      {
        dayNumber: 1,
        startTime: "2026-08-11T10:00:00",
        setTimings: [
          {
            setIndex: 0,
            exerciseIndex: 0,
            exerciseName: "Bench Press",
            exercisePrimaryMuscles: ["Chest"],
            exerciseSecondaryMuscles: ["Triceps"],
            weight: 60,
            reps: 8,
            isWarmup: false,
          },
        ],
      },
    ] as unknown as Parameters<typeof buildTrainingSetEntries>[0];

    const entries = buildTrainingSetEntries(sessions, null, null, {});
    expect(entries).toHaveLength(1);
    expect(entries[0].primaryMuscles).toEqual(["Chest"]);
    expect(entries[0].secondaryMuscles).toEqual(["Triceps"]);
  });
});

describe("getUndertrainedMuscleGroups", () => {
  // Wednesday, week = Mon Aug 10 to now
  const now = new Date("2026-08-12T15:30:00");

  const workoutData: WorkoutData = {
    days: [
      {
        dayNumber: 1,
        split: {
          solo: {
            totalSets: 6,
            exercises: [
              {
                name: "Bench Press",
                primaryMuscles: ["Chest"],
                secondaryMuscles: ["Triceps"],
                sets: 3,
              },
              {
                name: "Lat Pulldown",
                primaryMuscles: ["Back"],
                secondaryMuscles: ["Biceps"],
                sets: 3,
              },
            ],
          },
        },
      },
      {
        dayNumber: 2,
        split: {
          solo: {
            totalSets: 3,
            exercises: [
              {
                name: "Squat",
                primaryMuscles: ["Legs"],
                secondaryMuscles: [],
                sets: 3,
              },
            ],
          },
        },
      },
    ],
  };

  const makeEntry = (
    overrides: Partial<TrainingSetEntry>,
  ): TrainingSetEntry => ({
    date: new Date("2026-08-11T10:00:00"),
    exerciseName: "Bench Press",
    primaryMuscles: ["Chest"],
    secondaryMuscles: ["Triceps"],
    weight: 60,
    reps: 8,
    dayNumber: 1,
    ...overrides,
  });

  it("days_done mode: only counts target from days that were actually logged this week", () => {
    // Day 1 fully logged (3 Chest sets of 3 planned, 0 of 3 planned Back sets
    // -> Chest 100%, Back 0%). Day 2 (Legs) never logged this week, so its
    // target/actual are excluded entirely under days_done.
    const entries: TrainingSetEntry[] = [
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
    ];
    const result = getUndertrainedMuscleGroups(
      entries,
      workoutData,
      "solo",
      now,
      "days_done",
    );
    const groups = result.map((r) => r.primaryMuscle);
    // day 2 not logged this week -> excluded
    expect(groups).not.toContain("Legs");
    const back = result.find((r) => r.primaryMuscle === "Back");
    // day 1's planned Back target still counted
    expect(back?.targetSets).toBe(3);
    expect(back?.actualSets).toBe(0);
    expect(back?.completionPct).toBe(0);
    // avg of Chest(100%) and Back(0%) = 50; 50-0=50
    expect(back?.deltaFromAvg).toBeGreaterThan(25);
    const chest = result.find((r) => r.primaryMuscle === "Chest");
    // Chest's delta (-50) doesn't exceed the threshold -> excluded
    expect(chest).toBeUndefined();
  });

  it("last_30_days mode: counts sets from the last 30 days against 30 days of the split", () => {
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 86_400_000);
    const entries: TrainingSetEntry[] = [
      ...Array.from({ length: 45 }, (_, i) =>
        makeEntry({ date: daysAgo(i % 29), primaryMuscles: ["Chest"] }),
      ),
      makeEntry({ date: daysAgo(40), primaryMuscles: ["Legs"] }),
    ];
    const result = getUndertrainedMuscleGroups(
      entries,
      workoutData,
      "solo",
      now,
      "last_30_days",
    );
    const legs = result.find((r) => r.primaryMuscle === "Legs");
    expect(legs?.targetSets).toBe(45);
    expect(legs?.actualSets).toBe(0);
    expect(result.find((r) => r.primaryMuscle === "Chest")).toBeUndefined();
  });

  it("full_split mode: includes every day's target regardless of what was logged", () => {
    const entries: TrainingSetEntry[] = [
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        dayNumber: 1,
      }),
    ];
    const result = getUndertrainedMuscleGroups(
      entries,
      workoutData,
      "solo",
      now,
      "full_split",
    );
    const groups = result.map((r) => r.primaryMuscle);
    // day 2's target counted even though unlogged
    expect(groups).toContain("Legs");
    const legs = result.find((r) => r.primaryMuscle === "Legs");
    expect(legs?.targetSets).toBe(3);
    expect(legs?.actualSets).toBe(0);
  });

  it("sorts most-undertrained first and excludes groups under the 25-point delta", () => {
    // Three groups, each planned for 10 sets: Chest fully logged (100%),
    // Back logged once but with lowercase casing vs the plan's "Back" (10%,
    // exercising the case-insensitive match), Legs never logged (0%).
    // avg completion = (100 + 10 + 0) / 3 = 36.67
    //   Chest: delta -63.33 -> excluded (below avg)
    //   Back:  delta  26.67 -> included
    //   Legs:  delta  36.67 -> included, sorts before Back
    const spreadWorkoutData: WorkoutData = {
      days: [
        {
          dayNumber: 1,
          split: {
            solo: {
              totalSets: 30,
              exercises: [
                {
                  name: "Bench Press",
                  primaryMuscles: ["Chest"],
                  secondaryMuscles: [],
                  sets: 10,
                },
                {
                  name: "Lat Pulldown",
                  primaryMuscles: ["Back"],
                  secondaryMuscles: [],
                  sets: 10,
                },
                {
                  name: "Squat",
                  primaryMuscles: ["Legs"],
                  secondaryMuscles: [],
                  sets: 10,
                },
              ],
            },
          },
        },
      ],
    };
    const entries: TrainingSetEntry[] = [
      ...Array.from({ length: 10 }, () =>
        makeEntry({
          exerciseName: "Bench Press",
          primaryMuscles: ["Chest"],
          dayNumber: 1,
        }),
      ),
      makeEntry({
        exerciseName: "Lat Pulldown",
        primaryMuscles: ["back"],
        dayNumber: 1,
      }),
    ];
    const result = getUndertrainedMuscleGroups(
      entries,
      spreadWorkoutData,
      "solo",
      now,
      "full_split",
    );
    expect(result.map((r) => r.primaryMuscle)).toEqual(["Legs", "Back"]);
    expect(result[0].deltaFromAvg).toBeGreaterThan(result[1].deltaFromAvg);
    const back = result.find((r) => r.primaryMuscle === "Back");
    // matched despite "back" vs plan's "Back" casing
    expect(back?.actualSets).toBe(1);
    expect(result.every((r) => r.deltaFromAvg > 25)).toBe(true);
  });

  it("does not credit secondary muscles toward a planned target", () => {
    // Bench Press's secondary muscle (Triceps) isn't a planned target for
    // any day, so logging it should never surface a "Triceps" row.
    const entries: TrainingSetEntry[] = [
      makeEntry({
        exerciseName: "Bench Press",
        primaryMuscles: ["Chest"],
        secondaryMuscles: ["Triceps"],
        dayNumber: 1,
      }),
    ];
    const result = getUndertrainedMuscleGroups(
      entries,
      workoutData,
      "solo",
      now,
      "full_split",
    );
    expect(result.map((r) => r.primaryMuscle)).not.toContain("Triceps");
  });

  it("returns an empty array when no days have been logged this week (days_done mode)", () => {
    const result = getUndertrainedMuscleGroups(
      [],
      workoutData,
      "solo",
      now,
      "days_done",
    );
    expect(result).toEqual([]);
  });
});

describe("weeklySetVolume", () => {
  // Wednesday, so the week started on Monday the 10th.
  const now = new Date("2026-08-12T15:30:00");
  const set = (
    date: string,
    primaryMuscles: string[],
    secondaryMuscles: string[] = [],
  ): TrainingSetEntry => ({
    date: new Date(date),
    exerciseName: "Bench Press",
    primaryMuscles,
    secondaryMuscles,
    weight: 100,
    reps: 8,
    dayNumber: 1,
  });

  it("counts secondary muscles as half a set", () => {
    const entries = [
      set("2026-08-11T10:00:00", ["Chest"]),
      set("2026-08-11T10:05:00", ["Chest"]),
      set("2026-08-11T10:10:00", ["Triceps"], ["Chest"]),
      set("2026-08-11T10:15:00", ["Back"]),
    ];
    expect(weeklySetVolume(entries, muscleCredit("Chest"), now).thisWeek).toBe(
      2.5,
    );
  });

  it("averages only over the weeks that have history, up to four", () => {
    const entries = [
      set("2026-07-28T10:00:00", ["Chest"]),
      set("2026-07-28T10:05:00", ["Chest"]),
      set("2026-08-04T10:00:00", ["Chest"]),
      set("2026-08-04T10:05:00", ["Chest"]),
      set("2026-08-04T10:10:00", ["Chest"]),
      set("2026-08-04T10:15:00", ["Chest"]),
    ];
    expect(weeklySetVolume(entries, muscleCredit("Chest"), now)).toEqual({
      thisWeek: 0,
      average: 3,
    });
  });

  it("has no average before a full week of history", () => {
    const entries = [set("2026-08-11T10:00:00", ["Chest"])];
    expect(
      weeklySetVolume(entries, muscleCredit("Chest"), now).average,
    ).toBeNull();
  });
});
