import { applyDayOverride, carryOverDay, dayExercises } from "../dayCarryOver";
import type { SetDetail, WorkoutData } from "@shared/types";

const set = (reps: number): SetDetail => ({
  weight: 50,
  reps,
  completedAt: "2026-09-30T10:00:00",
  note: "",
  isWarmup: false,
});

const plan: WorkoutData = {
  days: [
    {
      dayNumber: 1,
      split: {
        A: {
          totalSets: 10,
          exercises: [
            { name: "Bench Press", sets: 4, reps: "8" },
            { name: "Fly", sets: 3 },
            { name: "Dips", sets: 3 },
          ],
        },
      },
    },
    {
      dayNumber: 2,
      split: {
        A: {
          totalSets: 6,
          exercises: [
            { name: "Squat", sets: 3 },
            { name: "bench press ", sets: 3, reps: "10" },
          ],
        },
      },
    },
  ],
};

describe("carryOverDay", () => {
  const run = (logs: Record<number, Record<number, SetDetail>>) =>
    carryOverDay({
      fromExercises: dayExercises(plan, 1, "A"),
      toExercises: dayExercises(plan, 2, "A"),
      completedDays: { 1: logs },
      fromDay: 1,
      toDay: 2,
      split: "A",
    });

  it("maps a shared exercise onto the new day's template and appends the rest", () => {
    const { completedDays, override } = run({
      0: { 0: set(8), 1: set(8) },
      1: { 0: set(12) },
    });

    expect(completedDays[1]).toBeUndefined();
    expect(completedDays[2]).toEqual({
      1: { 0: set(8), 1: set(8) },
      2: { 0: set(12) },
    });
    expect(override).toEqual({
      dayNumber: 2,
      split: "A",
      carried: [{ name: "Fly", sets: 3 }],
      minSets: {},
    });

    const bench = dayExercises(applyDayOverride(plan, override), 2, "A");
    expect(bench.map((e) => [e.name, e.sets, e.reps])).toEqual([
      ["Squat", 3, undefined],
      ["bench press ", 3, "10"],
      ["Fly", 3, undefined],
    ]);
  });

  it("raises the new day's set count when more sets were logged than it has", () => {
    const { override } = run({ 0: { 0: set(8), 3: set(8) } });

    expect(override?.minSets).toEqual({ 1: 4 });
    const merged = applyDayOverride(plan, override);
    expect(dayExercises(merged, 2, "A")[1].sets).toBe(4);
    expect(merged?.days[1].split.A.totalSets).toBe(7);
  });

  it("needs no override when nothing was logged", () => {
    const { completedDays, override } = run({});
    expect(override).toBeNull();
    expect(completedDays).toEqual({});
  });

  it("leaves the plan itself untouched", () => {
    const before = structuredClone(plan);
    applyDayOverride(plan, run({ 1: { 0: set(12) } }).override);
    expect(plan).toEqual(before);
  });
});
