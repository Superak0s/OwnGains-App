import {
  applySplitDraft,
  draftsFromProgram,
  normalizeReps,
  sanitizeRepsInput,
} from "../splitDraft";
import type { WorkoutData } from "@shared/types";

const ex = (name: string, sets: Record<string, number>, reps?: string) => ({
  name,
  reps,
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  setsBySplit: sets,
  exerciseId: name.toLowerCase(),
});

const program = (): WorkoutData => ({
  split: ["Me", "Alex"],
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      exercises: [ex("Bench", { Me: 3, Alex: 0 })],
      split: {
        Me: { exercises: [{ name: "Bench", sets: 3 }], totalSets: 3 },
        Alex: { exercises: [], totalSets: 0 },
      },
    },
    {
      dayNumber: 2,
      dayTitle: "Pull",
      exercises: [ex("Row", { Me: 0, Alex: 4 }, "8-12")],
      split: {
        Me: { exercises: [], totalSets: 0 },
        Alex: { exercises: [{ name: "Row", sets: 4 }], totalSets: 4 },
      },
    },
  ],
});

describe("split draft round-trip", () => {
  it("drafts only the split's own days", () => {
    const drafts = draftsFromProgram(program().days, "Alex");
    expect(drafts).toEqual([
      {
        id: "day-1",
        dayIdx: 1,
        dayTitle: "Pull",
        exercises: [
          {
            name: "Row",
            exerciseId: "row",
            primaryMuscles: ["chest"],
            secondaryMuscles: [],
            sets: "4",
            reps: "8-12",
          },
        ],
      },
    ]);
  });

  it("saves edited sets without touching the other split", () => {
    const drafts = draftsFromProgram(program().days, "Alex");
    drafts[0].exercises[0].sets = "6";
    const updated = applySplitDraft(program(), "Alex", drafts);
    expect(updated.days[1].exercises?.[0].setsBySplit).toEqual({
      Me: 0,
      Alex: 6,
    });
    expect(updated.days[0].exercises?.[0].setsBySplit).toEqual({
      Me: 3,
      Alex: 0,
    });
  });

  it("appends a new day and numbers it after the program's last", () => {
    const updated = applySplitDraft(program(), "Alex", [
      ...draftsFromProgram(program().days, "Alex"),
      {
        id: "new-legs",
        dayTitle: "Legs",
        exercises: [
          {
            name: "Squat",
            exerciseId: "squat",
            primaryMuscles: ["quads"],
            secondaryMuscles: [],
            sets: "5",
            reps: "8-12",
          },
        ],
      },
    ]);
    expect(updated.days).toHaveLength(3);
    expect(updated.days[2]).toMatchObject({ dayNumber: 3, dayTitle: "Legs" });
    expect(updated.days[2].exercises?.[0].setsBySplit).toEqual({
      Me: 0,
      Alex: 5,
    });
  });

  it("honours a zeroed set count and only defaults a blank one", () => {
    const drafts = draftsFromProgram(program().days, "Alex");
    const withSets = (sets: string) => [
      { ...drafts[0], exercises: [{ ...drafts[0].exercises[0], sets }] },
    ];

    const zeroed = applySplitDraft(program(), "Alex", withSets("0"));
    expect(zeroed.days.map((d) => d.dayTitle)).toEqual(["Push"]);

    const blank = applySplitDraft(program(), "Alex", withSets(""));
    expect(blank.days[1].exercises?.[0].setsBySplit).toEqual({ Me: 0, Alex: 3 });
  });

  it("drops a removed day only when no split still uses it", () => {
    const updated = applySplitDraft(program(), "Alex", []);
    expect(updated.days.map((d) => d.dayTitle)).toEqual(["Push"]);
    expect(updated.totalDays).toBe(1);
  });

  it("round-trips a rep range and clears a blanked one", () => {
    const drafts = draftsFromProgram(program().days, "Alex");
    drafts[0].exercises[0].reps = "6-8";
    expect(
      applySplitDraft(program(), "Alex", drafts).days[1].exercises?.[0].reps,
    ).toBe("6-8");

    drafts[0].exercises[0].reps = "  ";
    expect(
      applySplitDraft(program(), "Alex", drafts).days[1].exercises?.[0].reps,
    ).toBeUndefined();
  });
});

describe("sanitizeRepsInput / normalizeReps", () => {
  it("keeps one range separator", () => {
    expect(sanitizeRepsInput("8-12")).toBe("8-12");
    expect(sanitizeRepsInput("8-1-2")).toBe("8-12");
    expect(sanitizeRepsInput("8a-b12")).toBe("8-12");
  });

  it("drops a leading separator", () => {
    expect(sanitizeRepsInput("-8")).toBe("8");
  });

  it("allows a trailing separator while typing but not once committed", () => {
    expect(sanitizeRepsInput("8-")).toBe("8-");
    expect(normalizeReps("8-")).toBe("8");
  });
});

describe("day muscle labels", () => {
  it("recomputes from the day's exercises instead of accumulating", () => {
    const data = program();
    data.days[1].primaryMuscles = ["chest", "legs"];
    const applied = applySplitDraft(
      data,
      "Alex",
      draftsFromProgram(data.days, "Alex"),
    );
    const pull = applied.days.find((d) => d.dayTitle === "Pull");
    expect(pull?.primaryMuscles).toEqual(["chest"]);
  });
});
