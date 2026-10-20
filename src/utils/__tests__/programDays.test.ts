import { traineeSplit, visibleDaysForSplit } from "../programDays";
import type { WorkoutData } from "@shared/types";

const ex = (sets: Record<string, number>) => ({
  name: "Bench",
  setsBySplit: sets,
});

const days = [
  { dayNumber: 1, exercises: [ex({ Me: 3 })] },
  { dayNumber: 2, exercises: [ex({ Me: 3 })] },
  { dayNumber: 3, exercises: [ex({ Alex: 4 })] },
  { dayNumber: 4, exercises: [ex({ Alex: 4 })] },
];

describe("visibleDaysForSplit", () => {
  it("renumbers a split's days from 1", () => {
    const visible = visibleDaysForSplit(days, "Alex");
    expect(visible.map((v) => v.displayNumber)).toEqual([1, 2]);
    expect(visible.map((v) => v.dayIdx)).toEqual([2, 3]);
    expect(visible.map((v) => v.day.dayNumber)).toEqual([3, 4]);
  });

  it("keeps the program's own numbering when no split is selected", () => {
    expect(
      visibleDaysForSplit(days, null).map((v) => v.displayNumber),
    ).toEqual([1, 2, 3, 4]);
  });

  it("keeps days that have no exercises at all", () => {
    const withEmpty = [...days, { dayNumber: 5, exercises: [] }];
    expect(visibleDaysForSplit(withEmpty, "Me")).toHaveLength(3);
  });
});

describe("traineeSplit", () => {
  const program = {
    split: ["Me"],
    days: [{ dayNumber: 1, split: { Me: { exercises: [] } } }],
  } as unknown as WorkoutData;

  it("keeps the last session's split when the program has it", () => {
    expect(traineeSplit(program, "Me")).toBe("Me");
  });

  it("falls back to the program's first split for a session logged under another name", () => {
    expect(traineeSplit(program, "Upper/Lower")).toBe("Me");
  });

  it("is null without a program", () => {
    expect(traineeSplit(null, "Me")).toBeNull();
  });
});
