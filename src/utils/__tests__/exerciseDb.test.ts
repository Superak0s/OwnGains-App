import {
  matchExercise,
  filterExercises,
  getExerciseById,
  toSuggestions,
  muscleGroups,
  getExercises,
} from "../exerciseDb";
import { EXERCISE_ALIASES } from "../exerciseAliases";


describe("lazy dataset indexes", () => {
  // Sweeps the whole dataset through the lazily-built indexes. "Hack Squat"
  // loses to the explicit alias that claims that name, and "Squats - With
  // Bands" to its base-name twin. Anything else appearing here is a regression.
  it("resolves every dataset name back to its own id", () => {
    const misses = getExercises().filter(
      (exercise) =>
        matchExercise(exercise.name).candidates[0]?.exercise.id !== exercise.id,
    ).map((exercise) => exercise.name);
    expect(misses.sort()).toEqual(["Hack Squat", "Squats - With Bands"]);
  });

  it("builds the muscle group list once", () => {
    expect(muscleGroups()).toBe(muscleGroups());
    expect(muscleGroups()).toEqual([...muscleGroups()].sort((a, b) => a.localeCompare(b)));
  });
});

describe("matchExercise", () => {
  it("auto-accepts an exact name", () => {
    const result = matchExercise("Dumbbell Bench Press");
    expect(result.status).toBe("confident");
    expect(result.candidates[0].exercise.name).toBe("Dumbbell Bench Press");
    expect(result.candidates[0].score).toBe(1);
  });

  it("resolves an abbreviation that edit distance alone would miss", () => {
    const result = matchExercise("BB Bench Press");
    expect(result.candidates[0].exercise.name).toBe(
      "Barbell Bench Press - Medium Grip",
    );
  });

  it.each([
    ["DB Incline Press", "Incline Dumbbell Press"],
    ["RDL", "Romanian Deadlift"],
    ["Tricep Pushdown", "Triceps Pushdown"],
  ])("normalizes %s past abbreviation and plural", (query, expected) => {
    const result = matchExercise(query);
    expect(result.status).toBe("confident");
    expect(result.candidates[0].exercise.name).toBe(expected);
  });

  it("ignores qualifier suffixes so the plain lift ranks above a variant", () => {
    const result = matchExercise("Barbell Incline Bench Press");
    expect(result.candidates[0].exercise.name).toBe(
      "Barbell Incline Bench Press - Medium Grip",
    );
  });

  it("never auto-accepts a qualified variant for an unqualified query", () => {
    const result = matchExercise("Back Flyes");
    expect(result.status).toBe("uncertain");
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it("asks rather than guessing when variants tie for the top score", () => {
    const result = matchExercise("Isometric Neck Exercise");
    expect(result.status).toBe("uncertain");
    expect(result.candidates.length).toBeGreaterThan(1);
  });

  it("takes an exact database name over its qualified variants", () => {
    const result = matchExercise("Hang Clean");
    expect(result.status).toBe("confident");
    expect(result.candidates[0].exercise.name).toBe("Hang Clean");
  });

  it("returns uncertain with candidates for a partial name", () => {
    const result = matchExercise("Incline Press");
    expect(result.status).toBe("uncertain");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("never auto-accepts a nonsense name", () => {
    expect(matchExercise("zzzqqq widget flail").status).toBe("uncertain");
  });

  it("returns uncertain with no candidates for an empty name", () => {
    expect(matchExercise("  ")).toEqual({ status: "uncertain", candidates: [] });
  });
});

describe("aliases", () => {
  it("maps every alias to an id that exists in the dataset", () => {
    const missing = Object.entries(EXERCISE_ALIASES)
      .filter(([, id]) => !getExerciseById(id))
      .map(([alias, id]) => `${alias} -> ${id}`);
    expect(missing).toEqual([]);
  });

  it("confidently resolves common lifts the dataset has no plain entry for", () => {
    expect(matchExercise("Squat").candidates[0].exercise.name).toBe("Barbell Squat");
    expect(matchExercise("Bench Press").candidates[0].exercise.name).toBe(
      "Barbell Bench Press - Medium Grip",
    );
    expect(matchExercise("Squat").status).toBe("confident");
    expect(matchExercise("Bench Press").status).toBe("confident");
  });

  it("matches aliases case-insensitively and through plural forms", () => {
    expect(matchExercise("PULL UPS").status).toBe("confident");
    expect(matchExercise("Lateral Raises").status).toBe("confident");
  });
});

describe("toSuggestions", () => {
  it("finds exercises by substring, respecting the limit", () => {
    const results = toSuggestions("bench", 5);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.every((s) => s.label.toLowerCase().includes("bench"))).toBe(
      true,
    );
  });

  it("returns nothing for a blank query", () => {
    expect(toSuggestions("   ")).toEqual([]);
  });

  it("labels with the name and describes muscle and equipment in meta", () => {
    const [first] = toSuggestions("barbell bench press", 1);
    expect(first.label).toBe("Barbell Bench Press - Medium Grip");
    expect(first.meta).toContain("chest");
    expect(first.meta).toContain("barbell");
  });

  it("omits the separator from meta when the exercise has no equipment", () => {
    const noEquipment = toSuggestions("push", 20).find(
      (suggestion) => !suggestion.meta.includes("·"),
    );
    expect(noEquipment).toBeDefined();
  });
});

describe("getExerciseById", () => {
  it("returns undefined for an unknown id", () => {
    expect(getExerciseById("not_a_real_id")).toBeUndefined();
  });
});

describe("machine and assisted gym names", () => {
  it.each([
    ["Machine Chest Press", "Leverage_Chest_Press"],
    ["Seated Chest Press", "Leverage_Chest_Press"],
    ["Incline Chest Press", "Leverage_Incline_Chest_Press"],
    ["Hip Abduction", "Thigh_Abductor"],
    ["Hip Adduction", "Thigh_Adductor"],
    ["Assisted Dip", "Dip_Machine"],
    ["Assisted Pullup", "Band_Assisted_Pull-Up"],
    ["Reverse Curls", "Reverse_Barbell_Curl"],
    ["Rear Kick Machine", "Glute_Kickback"],
    ["Dumbbell Curl", "Dumbbell_Bicep_Curl"],
  ])("matches %s confidently", (name, expectedId) => {
    const result = matchExercise(name);
    expect(result.status).toBe("confident");
    expect(result.candidates[0].exercise.id).toBe(expectedId);
  });
});

describe("filterExercises", () => {
  it("keeps only exercises whose primary muscles are included", () => {
    const results = filterExercises({ include: ["biceps"], limit: 200 });
    expect(results.length).toBeGreaterThan(0);
    expect(
      results.every((e) => e.primaryMuscles.includes("biceps")),
    ).toBe(true);
  });

  it("drops exercises that work an excluded muscle, primary or secondary", () => {
    const results = filterExercises({ query: "curl", exclude: ["biceps"] });
    expect(results.some((e) => e.primaryMuscles.includes("biceps"))).toBe(false);
    expect(results.some((e) => e.secondaryMuscles.includes("biceps"))).toBe(
      false,
    );
  });

  it("matches the query case-insensitively and honours the limit", () => {
    const results = filterExercises({ query: "BENCH press", limit: 3 });
    expect(results).toHaveLength(3);
    expect(
      results.every((e) => e.name.toLowerCase().includes("bench press")),
    ).toBe(true);
  });
});
