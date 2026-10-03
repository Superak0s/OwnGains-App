import { muscleFrequency } from "../muscleFrequency";
import type { WorkoutData } from "@shared/types";

const day = (
  n: number,
  exercises: { name: string; exerciseId?: string; primaryMuscles?: string[]; sets?: number }[],
) => ({
  dayNumber: n,
  split: {
    Me: {
      exercises: exercises.map((e) => ({ sets: 3, ...e })),
      totalSets: exercises.reduce((t, e) => t + (e.sets ?? 3), 0),
    },
  },
});

const scoreOf = (program: WorkoutData, muscle: string) =>
  muscleFrequency(program, "Me").find((r) => r.muscle === muscle)?.setsPerWeek ?? 0;

describe("muscleFrequency", () => {
  it("counts each set once for a primary muscle and as a half for a secondary", () => {
    // Barbell Bench Press: chest primary, shoulders/triceps secondary.
    const program: WorkoutData = {
      days: [
        day(1, [{ name: "Bench", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", sets: 4 }]),
      ],
    };
    expect(scoreOf(program, "chest")).toBe(4);
    expect(scoreOf(program, "triceps")).toBe(2);
  });

  it("adds up every exercise hitting the same muscle within one day", () => {
    const program: WorkoutData = {
      days: [
        day(1, [
          { name: "Bench", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3 },
          { name: "Incline", exerciseId: "Barbell_Incline_Bench_Press_-_Medium_Grip", sets: 2 },
        ]),
      ],
    };
    expect(scoreOf(program, "chest")).toBe(5);
  });

  it("adds primary and secondary work on the same muscle together", () => {
    const program: WorkoutData = {
      days: [
        day(1, [
          { name: "Bench", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", sets: 4 },
          { name: "Pushdown", exerciseId: "Triceps_Pushdown", sets: 3 },
        ]),
      ],
    };
    expect(scoreOf(program, "triceps")).toBe(5);
  });

  it("falls back to the program's own muscle label for custom exercises", () => {
    const program: WorkoutData = {
      days: [day(1, [{ name: "Sled Thing", primaryMuscles: ["Quads"], sets: 5 }])],
    };
    expect(scoreOf(program, "quadriceps")).toBe(5);
  });

  it("spreads a multi-week program back over the weeks it spans", () => {
    const days = Array.from({ length: 14 }, (_, i) =>
      day(i + 1, [{ name: "Bench", exerciseId: "Barbell_Bench_Press_-_Medium_Grip", sets: 3 }]),
    );
    expect(scoreOf({ days }, "chest")).toBe(21);
  });

  it("returns nothing for an empty program", () => {
    expect(muscleFrequency(null)).toEqual([]);
  });
});
