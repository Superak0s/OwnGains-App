import { matchProgram } from "../matchProgram";
import { CUSTOM_EXERCISE_ID, type WorkoutData } from "@shared/types";

const program = (exercise: Record<string, unknown>): WorkoutData =>
  ({
    days: [
      {
        dayNumber: 1,
        dayTitle: "Day 1",
        split: {
          Push: {
            exercises: [{ name: "Kostis Special Raise", sets: 3, ...exercise }],
            totalSets: 3,
          },
        },
      },
    ],
  }) as unknown as WorkoutData;

describe("matchProgram custom exercises", () => {
  it("queues an unknown imported exercise for review", () => {
    expect(matchProgram(program({})).unresolved).toHaveLength(1);
  });

  it("never queues one marked with the custom id", () => {
    expect(
      matchProgram(program({ exerciseId: CUSTOM_EXERCISE_ID })).unresolved,
    ).toHaveLength(0);
  });
});
