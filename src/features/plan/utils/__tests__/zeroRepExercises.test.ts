import { zeroRepExercises } from "../zeroRepExercises";
import type { WorkoutData } from "@shared/types";

const program = (reps: (string | undefined)[]): WorkoutData => ({
  split: ["Me"],
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      exercises: reps.map((r, i) => ({
        name: `Ex${i}`,
        primaryMuscles: [],
        secondaryMuscles: [],
        setsBySplit: { Me: 3 },
        reps: r,
      })),
      split: { Me: { exercises: [], totalSets: 0 } },
    },
  ],
});

describe("zeroRepExercises", () => {
  it("flags an explicit zero and ignores blank or real rep targets", () => {
    expect(zeroRepExercises(program(["0", "", undefined, "8-12", "10"]))).toEqual(
      [{ day: "Push", name: "Ex0" }],
    );
  });

  it("returns nothing without a program", () => {
    expect(zeroRepExercises(null)).toEqual([]);
  });
});
