import { matchProgram, applyResolution } from "../matchProgram";
import { CUSTOM_EXERCISE_ID, type WorkoutData } from "@shared/types";

const program = {
  days: [
    {
      dayNumber: 1,
      split: {
        A: {
          exercises: [
            { name: "Barbell Bench Press", primaryMuscles: ["Chest"], sets: 3 },
            { name: "Incline Press", primaryMuscles: ["Chest"], sets: 3 },
            { name: "Kostas Special Thing", primaryMuscles: ["Arms"], sets: 2 },
          ],
        },
      },
    },
  ],
} as unknown as WorkoutData;

describe("matchProgram", () => {
  it("applies confident matches without asking", () => {
    const { program: matched } = matchProgram(program);
    expect(matched.days[0].split.A.exercises[0].exerciseId).toBeTruthy();
  });

  it("leaves uncertain exercises unmatched and reports them", () => {
    const { program: matched, unresolved } = matchProgram(program);
    expect(matched.days[0].split.A.exercises[1].exerciseId).toBeUndefined();
    expect(unresolved.map((u) => u.name)).toContain("Incline Press");
  });

  it("reports a nonsense name with no candidates rather than guessing", () => {
    const { unresolved } = matchProgram(program);
    const custom = unresolved.find((u) => u.name === "Kostas Special Thing");
    expect(custom?.candidates).toEqual([]);
  });

  it("does not mutate the input program", () => {
    matchProgram(program);
    expect(program.days[0].split.A.exercises[0]).not.toHaveProperty(
      "exerciseId",
    );
  });

  it("leaves already-matched exercises alone so it is safe to rerun", () => {
    const { program: once } = matchProgram(program);
    const { unresolved } = matchProgram(once);
    expect(unresolved.map((u) => u.name)).not.toContain("Barbell Bench Press");
  });

  it("reports no change when rerun on its own output", () => {
    const first = matchProgram(program);
    expect(first.changed).toBe(true);
    const second = matchProgram(first.program);
    expect(second.changed).toBe(false);
  });

  it("takes a name copied straight from the database, tie or not", () => {
    const exact = {
      days: [
        {
          dayNumber: 1,
          split: {
            A: {
              exercises: [
                { name: "Barbell Bench Press - Medium Grip", primaryMuscles: ["Chest"], sets: 3 },
              ],
            },
          },
        },
      ],
    } as unknown as WorkoutData;
    const { program: matched, unresolved } = matchProgram(exact);
    expect(unresolved).toEqual([]);
    expect(matched.days[0].split.A.exercises[0].exerciseId).toBe(
      "Barbell_Bench_Press_-_Medium_Grip",
    );
  });

  it("splits a one-cell muscle list and fills secondaries from the database", () => {
    const combined = {
      days: [
        {
          dayNumber: 1,
          split: {
            A: {
              exercises: [
                {
                  name: "Barbell Bench Press - Medium Grip",
                  primaryMuscles: ["Chest / Triceps"],
                  sets: 3,
                },
              ],
            },
          },
        },
      ],
    } as unknown as WorkoutData;
    const exercise = matchProgram(combined).program.days[0].split.A
      .exercises[0];
    expect(exercise.primaryMuscles).toEqual(["Chest", "Triceps"]);
    expect(exercise.secondaryMuscles?.length).toBeGreaterThan(0);
  });

  it("asks once for an exercise repeated across days and splits", () => {
    const repeated = {
      days: [1, 2].map((dayNumber) => ({
        dayNumber,
        split: {
          A: { exercises: [{ name: "Incline Press", primaryMuscles: ["Chest"], sets: 3 }] },
          B: { exercises: [{ name: "Incline Press", primaryMuscles: ["Chest"], sets: 3 }] },
        },
        exercises: [
          { name: "Incline Press", primaryMuscles: ["Chest"], setsBySplit: { A: 3, B: 3 } },
        ],
      })),
    } as unknown as WorkoutData;
    expect(matchProgram(repeated).unresolved).toHaveLength(1);
  });
});

describe("muscle-group disambiguation", () => {
  const build = (name: string, muscle: string) =>
    ({
      days: [
        {
          dayNumber: 1,
          split: {
            A: { exercises: [{ name, primaryMuscles: [muscle], sets: 3 }] },
          },
        },
      ],
    }) as unknown as WorkoutData;

  it("auto-matches when exactly one candidate targets the stated muscle", () => {
    const { program: matched, unresolved } = matchProgram(
      build("Chest Dip", "Chest"),
    );
    expect(matched.days[0].split.A.exercises[0].exerciseId).toBeTruthy();
    expect(unresolved).toEqual([]);
  });

  it("still asks when several candidates target the stated muscle", () => {
    const { unresolved } = matchProgram(build("Chest Dip", "Triceps"));
    expect(unresolved.map((u) => u.name)).toContain("Chest Dip");
  });

  it("still asks when no candidate targets the stated muscle", () => {
    const { unresolved } = matchProgram(build("Chest Dip", "Calves"));
    expect(unresolved.map((u) => u.name)).toContain("Chest Dip");
  });
});

describe("applyResolution", () => {
  const repeated = () =>
    ({
      days: [1, 2].map((dayNumber) => ({
        dayNumber,
        split: {
          A: { exercises: [{ name: "Incline Press", primaryMuscles: ["Chest"], sets: 3 }] },
        },
        exercises: [
          { name: "Incline Press", primaryMuscles: ["Chest"], setsBySplit: { A: 3 } },
        ],
      })),
    }) as unknown as WorkoutData;

  it("sets the chosen id on every copy of the exercise", () => {
    const data = repeated();
    const { unresolved } = matchProgram(data);
    const result = applyResolution(data, unresolved[0], "Some_Id");
    expect(
      result.days.flatMap((d) => [
        d.split.A.exercises[0].exerciseId,
        d.exercises![0].exerciseId,
      ]),
    ).toEqual(["Some_Id", "Some_Id", "Some_Id", "Some_Id"]);
  });

  it("marks the exercise custom so review stops asking about it", () => {
    const data = repeated();
    const { unresolved } = matchProgram(data);
    const kept = applyResolution(data, unresolved[0], null);
    expect(kept.days[0].split.A.exercises[0].exerciseId).toBe(
      CUSTOM_EXERCISE_ID,
    );
    expect(matchProgram(kept).unresolved).toEqual([]);
  });
});

describe("muscle group ranking", () => {
  const hipThrust = {
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [
              { name: "Machine Hip Thrust", primaryMuscles: ["Glutes"], sets: 3 },
            ],
          },
        },
      },
    ],
  } as unknown as WorkoutData;

  it("offers the candidate on the stated muscle first", () => {
    const { unresolved, program: matched } = matchProgram(hipThrust);
    const assigned =
      matched.days?.[0].split.A.exercises[0].exerciseId ??
      unresolved[0]?.candidates[0]?.exercise.id;
    expect(assigned).toBe("Barbell_Hip_Thrust");
  });
});

describe("database enrichment on import", () => {
  const importedAs = (exercise: Record<string, unknown>) => {
    const { program: matched } = matchProgram({
      days: [{ dayNumber: 1, split: { A: { exercises: [exercise] } } }],
    } as unknown as WorkoutData);
    return matched.days[0].split.A.exercises[0];
  };

  it("fills in secondary muscles the import did not state", () => {
    const ex = importedAs({
      name: "Barbell Bench Press",
      primaryMuscles: ["Chest"],
      sets: 3,
    });
    expect(ex.secondaryMuscles?.length).toBeGreaterThan(0);
  });

  it("never overwrites secondary muscles the import did state", () => {
    const ex = importedAs({
      name: "Barbell Bench Press",
      primaryMuscles: ["Chest"],
      secondaryMuscles: ["Ego"],
      sets: 3,
    });
    expect(ex.secondaryMuscles).toEqual(["Ego"]);
  });

  it("never overwrites the stated primary muscles", () => {
    const ex = importedAs({
      name: "Barbell Bench Press",
      primaryMuscles: ["Chest"],
      sets: 3,
    });
    expect(ex.primaryMuscles).toEqual(["Chest"]);
  });

  it("fills primary muscles when the import stated none", () => {
    const ex = importedAs({ name: "Barbell Bench Press", sets: 3 });
    expect(ex.primaryMuscles).toEqual(["chest"]);
  });

  it("does not enrich when the stated primary muscle contradicts the match", () => {
    const ex = importedAs({
      name: "Barbell Bench Press",
      primaryMuscles: ["Calves"],
      sets: 3,
    });
    expect(ex.secondaryMuscles).toBeUndefined();
  });
});
