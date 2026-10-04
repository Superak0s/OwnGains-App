import {
  DEFAULT_SPLITS,
  buildProgramFromTemplate,
  createCustomSplitTemplate,
  findActiveTemplateId,
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

describe("findActiveTemplateId", () => {
  const ppl = DEFAULT_SPLITS.find((t) => t.id === "push-pull-legs-3-day")!;

  it("matches a program built from a template", () => {
    const built = buildProgramFromTemplate(ppl, ["Me"]);
    expect(findActiveTemplateId(built, "Me")).toBe(ppl.id);
  });

  it("matches template days inserted into an existing program", () => {
    const inserted = insertTemplateIntoProgram(program, ppl, ["Me"]);
    expect(findActiveTemplateId(inserted, "Me")).toBe(ppl.id);
    expect(findActiveTemplateId(inserted, "Alex")).toBeNull();
  });

  it("stops matching once a day's exercises change", () => {
    const built = buildProgramFromTemplate(ppl, ["Me"]);
    built.days[0].split.Me.exercises.pop();
    expect(findActiveTemplateId(built, "Me")).toBeNull();
  });

  it("does not match a custom split", () => {
    const custom = insertTemplateIntoProgram(program, template, ["Me"]);
    expect(findActiveTemplateId(custom, "Me")).toBeNull();
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
