import { computeWorkoutAnalytics } from "../workoutAnalytics";
import type { SetTiming } from "@shared/types";

function set(overrides: Partial<SetTiming>): SetTiming {
  return {
    setIndex: 0,
    endTime: "2024-01-01T10:00:30.000Z",
    weight: 100,
    reps: 10,
    isWarmup: false,
    ...overrides,
  };
}

describe("computeWorkoutAnalytics", () => {
  it("returns zeroed stats for no sessions", () => {
    expect(computeWorkoutAnalytics([])).toEqual({
      totalSessions: 0,
      totalSetsCompleted: 0,
    });
  });

  it("excludes warmup sets from the set count", () => {
    const result = computeWorkoutAnalytics([
      {
        setTimings: [
          set({ isWarmup: true }),
          set({ endTime: "2024-01-01T10:01:30.000Z" }),
        ],
      },
    ]);
    expect(result.totalSetsCompleted).toBe(1);
  });

  it("counts sets across every session", () => {
    const result = computeWorkoutAnalytics([
      { setTimings: [set({}), set({ endTime: "2024-01-01T10:02:00.000Z" })] },
      { setTimings: [set({ endTime: "2024-01-03T10:00:30.000Z" })] },
    ]);
    expect(result).toEqual({ totalSessions: 2, totalSetsCompleted: 3 });
  });
});
