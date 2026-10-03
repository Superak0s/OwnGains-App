import {
  CANONICAL_MUSCLE_GROUPS,
  checkForTypo,
  getAllExerciseNames,
  getAllMuscleGroups,
  getCanonicalName,
  getExercisesByMuscleGroup,
  normalizeExerciseName,
} from "../exerciseMatching";
import type { WorkoutData } from "@shared/types";

const workoutData: WorkoutData = {
  days: [
    {
      split: {
        A: {
          exercises: [
            { name: "Bench Press", primaryMuscles: ["Chest"], sets: 3 },
            { name: "Incline Press", primaryMuscles: ["Chest"], sets: 3 },
            { name: "Lat Pulldown", primaryMuscles: ["Back"], sets: 3 },
          ],
        },
      },
    },
    {
      split: {
        A: {
          exercises: [
            { name: "Cable Fly", primaryMuscles: ["chest"], sets: 3 },
            { name: "Bench Press", primaryMuscles: ["Chest"], sets: 3 },
          ],
        },
      },
    },
  ],
} as unknown as WorkoutData;

describe("getExercisesByMuscleGroup", () => {
  it("returns deduped, case-insensitive matches for the muscle group, excluding the given name", () => {
    const result = getExercisesByMuscleGroup(
      workoutData,
      "A",
      "Chest",
      "Bench Press",
    );
    expect(result.sort()).toEqual(["Cable Fly", "Incline Press"]);
  });

  it("excludes exercises from muscle groups that don't match", () => {
    const result = getExercisesByMuscleGroup(workoutData, "A", "Back");
    expect(result).toEqual(["Lat Pulldown"]);
  });

  it("returns an empty array when workoutData, selectedSplit, or muscleGroup is missing", () => {
    expect(getExercisesByMuscleGroup(null, "A", "Chest")).toEqual([]);
    expect(getExercisesByMuscleGroup(workoutData, null, "Chest")).toEqual([]);
    expect(getExercisesByMuscleGroup(workoutData, "A", "")).toEqual([]);
  });

  it("returns an empty array when no exercise matches the muscle group", () => {
    expect(getExercisesByMuscleGroup(workoutData, "A", "Legs")).toEqual([]);
  });
});

describe("getAllExerciseNames", () => {
  it("collects trimmed, deduped names across every day of the split", () => {
    expect(getAllExerciseNames(workoutData, "A").sort()).toEqual([
      "Bench Press",
      "Cable Fly",
      "Incline Press",
      "Lat Pulldown",
    ]);
  });

  it("skips exercises with no name", () => {
    const data = {
      days: [{ split: { A: { exercises: [{ name: "" }, { name: " Squat " }] } } }],
    } as unknown as WorkoutData;
    expect(getAllExerciseNames(data, "A")).toEqual(["Squat"]);
  });

  it("is empty without workout data, a split, or a matching split", () => {
    expect(getAllExerciseNames(null, "A")).toEqual([]);
    expect(getAllExerciseNames(workoutData, null)).toEqual([]);
    expect(getAllExerciseNames(workoutData, "Z")).toEqual([]);
  });
});

describe("getAllMuscleGroups", () => {
  it("always offers the canonical list", () => {
    expect(getAllMuscleGroups(null, null)).toEqual([...CANONICAL_MUSCLE_GROUPS]);
  });

  it("adds groups used by the plan without duplicating canonical ones", () => {
    const data = {
      days: [
        {
          split: {
            A: {
              exercises: [
                { name: "Bench Press", primaryMuscles: ["Chest"] },
                { name: "Neck Curl", primaryMuscles: [" Neck "] },
                { name: "Nameless", primaryMuscles: ["  "] },
              ],
            },
          },
        },
      ],
    } as unknown as WorkoutData;

    const groups = getAllMuscleGroups(data, "A");
    expect(groups).toContain("Neck");
    expect(groups.filter((g) => g === "Chest")).toHaveLength(1);
    expect(groups).toHaveLength(CANONICAL_MUSCLE_GROUPS.length + 1);
  });
});

describe("normalizeExerciseName", () => {
  it("trims and lowercases", () => {
    expect(normalizeExerciseName("  Bench PRESS ")).toBe("bench press");
  });
});

describe("getCanonicalName / getCanonicalName", () => {
  it("returns the stored casing for a case-insensitive hit", () => {
    expect(getCanonicalName("bench press", ["Bench Press"])).toBe("Bench Press");
    expect(getCanonicalName(" chest ", ["Chest"])).toBe("Chest");
  });

  it("echoes the input back when nothing matches", () => {
    expect(getCanonicalName("Zercher Squat", ["Bench Press"])).toBe(
      "Zercher Squat",
    );
    expect(getCanonicalName("Neck", ["Chest"])).toBe("Neck");
  });
});

describe("checkForTypo", () => {
  const names = ["Bench Press", "Incline Bench Press", "Lat Pulldown"];

  it("reports an exact match rather than a typo", () => {
    expect(checkForTypo("bench press", names)).toEqual({
      isLikelyTypo: false,
      suggestions: [],
      exactMatch: "Bench Press",
    });
  });

  it("flags a near miss and ranks the closest name first", () => {
    const result = checkForTypo("Bench Pres", names);
    expect(result.isLikelyTypo).toBe(true);
    expect(result.exactMatch).toBeNull();
    expect(result.suggestions[0].name).toBe("Bench Press");
  });

  it("treats a prefix as a strong suggestion even when the strings differ a lot", () => {
    const result = checkForTypo("Incline", names);
    expect(result.suggestions.map((s) => s.name)).toEqual([
      "Incline Bench Press",
    ]);
    expect(result.suggestions[0].similarity).toBeCloseTo(0.8);
    expect(result.isLikelyTypo).toBe(true);
  });

  it("caps the suggestion list at three", () => {
    const many = ["Curl A", "Curl B", "Curl C", "Curl D", "Curl E"];
    expect(checkForTypo("Curl", many).suggestions).toHaveLength(3);
  });

  it("reports no typo for an empty name or one under three characters", () => {
    expect(checkForTypo("", names)).toEqual({
      isLikelyTypo: false,
      suggestions: [],
    });
    expect(checkForTypo("   ", names)).toEqual({
      isLikelyTypo: false,
      suggestions: [],
    });
    expect(checkForTypo("Be", names).suggestions).toEqual([]);
  });

  it("offers nothing for a name unlike anything in the plan", () => {
    const result = checkForTypo("Zercher Squat", names);
    expect(result).toEqual({
      isLikelyTypo: false,
      suggestions: [],
      exactMatch: null,
    });
  });
});

describe("checkForTypo", () => {
  it("matches a known group case-insensitively", () => {
    expect(checkForTypo("chest", ["Chest", "Back"])).toEqual({
      isLikelyTypo: false,
      suggestions: [],
      exactMatch: "Chest",
    });
  });

  it("flags a misspelling", () => {
    const result = checkForTypo("Chestt", ["Chest", "Back"]);
    expect(result.isLikelyTypo).toBe(true);
    expect(result.suggestions[0].name).toBe("Chest");
  });

  it("misses a transposition in a short word, which costs two edits", () => {
    expect(checkForTypo("Chset", ["Chest", "Back"])).toEqual({
      isLikelyTypo: false,
      suggestions: [],
      exactMatch: null,
    });
  });

  it("reports no typo for a blank group", () => {
    expect(checkForTypo("  ", ["Chest"])).toEqual({
      isLikelyTypo: false,
      suggestions: [],
    });
  });
});
