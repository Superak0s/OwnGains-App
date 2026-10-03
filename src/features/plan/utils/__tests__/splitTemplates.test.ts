import {
  DEFAULT_SPLITS,
  createCustomSplitTemplate,
  insertTemplateIntoProgram,
} from "../splitTemplates";
import type { WorkoutData } from "@shared/types";

const program: WorkoutData = {
  totalDays: 1,
  split: ["Me", "Alex"],
  days: [
    {
      dayNumber: 1,
      dayTitle: "Existing",
      exercises: [],
      split: {
        Me: { exercises: [], totalSets: 0 },
        Alex: { exercises: [], totalSets: 0 },
      },
    },
  ],
};

const template = createCustomSplitTemplate("Push Pull", [
  {
    dayTitle: "Push",
    primaryMuscles: ["chest"],
    exercises: [{ name: "Bench Press", exerciseId: "x", sets: 4 }],
  },
]);

describe("insertTemplateIntoProgram", () => {
  it("appends days without adding a new split column", () => {
    const result = insertTemplateIntoProgram(program, template, ["Me"]);
    expect(result.split).toEqual(["Me", "Alex"]);
    expect(result.days).toHaveLength(2);
    expect(result.days[1].dayNumber).toBe(2);
  });

  it("only fills the targeted split with the template's exercises", () => {
    const inserted = insertTemplateIntoProgram(program, template, ["Me"])
      .days[1];
    expect(inserted.split.Me.exercises).toHaveLength(1);
    expect(inserted.split.Me.totalSets).toBe(4);
    expect(inserted.split.Alex.exercises).toHaveLength(0);
    expect(inserted.split.Alex.totalSets).toBe(0);
  });

  it("fills every split when no target is given", () => {
    const inserted = insertTemplateIntoProgram(program, template).days[1];
    expect(inserted.split.Alex.exercises[0].sets).toBe(4);
  });
});

describe("DEFAULT_SPLITS", () => {
  const ids = new Set(
    (require("../../../../data/exercises.json") as { id: string }[]).map(
      (e) => e.id,
    ),
  );

  it("only references exercises that exist in the bundled database", () => {
    const missing = DEFAULT_SPLITS.flatMap((s) =>
      s.days.flatMap((d) =>
        (d.exercises ?? [])
          .filter((e) => e.exerciseId && !ids.has(e.exerciseId))
          .map((e) => `${s.id}: ${e.exerciseId}`),
      ),
    );
    expect(missing).toEqual([]);
  });
});
