import {
  PROGRESSION_STEP_KG,
  suggestNextSetLoad,
  targetRepCeiling,
} from "../utils";

describe("targetRepCeiling", () => {
  it("reads one target and the top of a range", () => {
    expect(targetRepCeiling("10")).toBe(10);
    expect(targetRepCeiling("8-12")).toBe(12);
  });

  it("rejects targets with no usable number", () => {
    expect(targetRepCeiling(undefined)).toBeNull();
    expect(targetRepCeiling("AMRAP")).toBeNull();
    expect(targetRepCeiling("0")).toBeNull();
  });
});

describe("suggestNextSetLoad", () => {
  it("adds a step when the top of the rep range is hit", () => {
    expect(suggestNextSetLoad({ weight: 60, reps: 12 }, "8-12")).toEqual({
      weightKg: 60 + PROGRESSION_STEP_KG,
      reps: 12,
      direction: "up",
      reason: "Hit 12 reps last set",
    });
  });

  it("holds when the rep target was not reached", () => {
    expect(suggestNextSetLoad({ weight: 60, reps: 9 }, "8-12")).toBeNull();
  });

  it("holds when the target was hit but the set was near failure", () => {
    expect(
      suggestNextSetLoad({ weight: 60, reps: 12, rir: 1 }, "8-12"),
    ).toBeNull();
  });

  it("backs off after a 0 RIR set", () => {
    expect(suggestNextSetLoad({ weight: 60, reps: 12, rir: 0 }, "8-12"))
      .toMatchObject({ weightKg: 60 - PROGRESSION_STEP_KG, direction: "down" });
  });

  it("never suggests a non-positive load when backing off", () => {
    expect(suggestNextSetLoad({ weight: 2.5, reps: 5, rir: 0 }, "5")).toBeNull();
  });

  it("progresses on plenty of reps in reserve alone when the exercise has no rep target", () => {
    expect(suggestNextSetLoad({ weight: 60, reps: 6, rir: 4 }, undefined))
      .toMatchObject({ weightKg: 60 + PROGRESSION_STEP_KG, direction: "up" });
    expect(suggestNextSetLoad({ weight: 60, reps: 6, rir: 2 }, undefined))
      .toBeNull();
  });

  it("ignores bodyweight sets", () => {
    expect(suggestNextSetLoad({ weight: 0, reps: 12, rir: 4 }, "8-12")).toBeNull();
  });
});
