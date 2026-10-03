import XLSX from "xlsx";
import * as FileSystem from "expo-file-system/legacy";
import {
  parseWorkoutFileClient,
  extractSplitColumnCandidates,
} from "../clientWorkoutParser";

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

const getInfoAsync = FileSystem.getInfoAsync as jest.Mock;
const readAsStringAsync = FileSystem.readAsStringAsync as jest.Mock;

/** Builds a real xlsx workbook from rows and stages it as the file under test. */
function stageSheet(rows: unknown[][], size = 1024) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
  getInfoAsync.mockResolvedValue({ exists: true, size });
  readAsStringAsync.mockResolvedValue(base64);
}

const DAY_1 = [
  ["Day 1 — Chest/Triceps"],
  ["Exercise", "Muscle Group", "GF", "BF", "", "Notes"],
  ["Bench Press", "Chest", 4, 3, "", "ignored"],
  ["Tricep Pushdown", "Triceps", 3, 0, "", ""],
  ["Total Sets:", "", 7, 3, "", ""],
];

beforeEach(() => jest.clearAllMocks());

describe("parseWorkoutFileClient", () => {
  it("parses days, splits, exercises and totals", async () => {
    stageSheet(DAY_1);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");

    expect(data.split).toEqual(["GF", "BF"]);
    expect(data.days).toHaveLength(1);

    const day = data.days[0];
    expect(day.dayNumber).toBe(1);
    expect(day.dayTitle).toBe("Day 1 — Chest/Triceps");
    expect(day.primaryMuscles).toEqual(["Chest", "Triceps"]);
    expect(day.split.GF).toEqual({
      totalSets: 7,
      exercises: [
        { name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: [], sets: 4 },
        { name: "Tricep Pushdown", primaryMuscles: ["Triceps"], secondaryMuscles: [], sets: 3 },
      ],
    });
    // A 0 in a split column records the exercise but schedules nothing.
    expect(day.split.BF.exercises).toEqual([
      { name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: [], sets: 3 },
    ]);
    expect(day.split.BF.totalSets).toBe(3);
  });

  it("does not leak the per-parse splitColumns scratch state", async () => {
    stageSheet(DAY_1);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.days[0]).not.toHaveProperty("splitColumns");
  });

  it("stops the split scan at the first blank header, ignoring later columns", async () => {
    stageSheet(DAY_1);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.split).not.toContain("Notes");
  });

  it("never treats a bare number as a split name", async () => {
    stageSheet([
      ["Day 1"],
      ["Exercise", "Muscle Group", "GF", "10"],
      ["Bench Press", "Chest", 4, 9],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.split).toEqual(["GF"]);
  });

  it("carries splits across multiple days without duplicating them", async () => {
    stageSheet([
      ...DAY_1,
      ["Day 2 — Back"],
      ["Exercise", "Muscle Group", "GF", "BF"],
      ["Deadlift", "Back", 3, 3],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.split).toEqual(["GF", "BF"]);
    expect(data.days.map((d) => d.dayNumber)).toEqual([1, 2]);
    expect(data.days[1].split.GF.exercises).toHaveLength(1);
  });

  it("uses explicitly picked columns as-is, without requiring contiguity", async () => {
    stageSheet([
      ["Day 1"],
      ["Exercise", "Muscle Group", "GF", "", "KP"],
      ["Bench Press", "Chest", 4, "", 5],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx", [2, 4]);
    expect(data.split).toEqual(["GF", "KP"]);
    expect(data.days[0].split.KP.exercises).toEqual([
      { name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: [], sets: 5 },
    ]);
  });

  it("ignores picked indices that are out of range or point at a blank header", async () => {
    stageSheet([
      ["Day 1"],
      ["Exercise", "Muscle Group", "GF", ""],
      ["Bench Press", "Chest", 4, 2],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx", [0, 2, 3, 99]);
    expect(data.split).toEqual(["GF"]);
  });

  it("skips rows before the first day and blank first cells", async () => {
    stageSheet([
      ["My Plan"],
      [""],
      ...DAY_1,
      [""],
      ["", "Chest", 4, 3],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.days[0].split.GF.exercises).toHaveLength(2);
  });

  it("leaves totalSets alone when the total row cell is blank or non-numeric", async () => {
    stageSheet([
      ["Day 1"],
      ["Exercise", "Muscle Group", "GF", "BF"],
      ["Bench Press", "Chest", 4, 3],
      ["Total Sets:", "", "", "n/a"],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.days[0].split.GF.totalSets).toBe(0);
    expect(data.days[0].split.BF.totalSets).toBe(0);
  });

  it("defaults dayNumber to 0 and muscleGroups to empty for an untitled day", async () => {
    stageSheet([
      ["Day - rest"],
      ["Exercise", "Muscle Group", "GF"],
      ["Walk", "Cardio", 1],
    ]);
    const data = await parseWorkoutFileClient("file:///plan.xlsx");
    expect(data.days[0]).toMatchObject({ dayNumber: 0, primaryMuscles: [] });
  });

  it("rejects a missing or oversized file", async () => {
    getInfoAsync.mockResolvedValue({ exists: false });
    await expect(parseWorkoutFileClient("file:///gone.xlsx")).rejects.toThrow(
      "File not found",
    );

    getInfoAsync.mockResolvedValue({ exists: true, size: 6 * 1024 * 1024 });
    await expect(parseWorkoutFileClient("file:///big.xlsx")).rejects.toThrow(
      "File too large (max 5 MB)",
    );
  });
});

const WIDE_ROWS = [
  ["4-Day Program", "", "", "", "", "", ""],
  ["Some description text", "", "", "", "", "", ""],
  [""],
  ["Day", "Exercise", "Primary Muscles", "Secondary Muscles", "GF Sets", "BF Sets", "Reps"],
  ["Day 1 - Full Body A", "Bench Press", "[Chest]", "[Shoulders, Triceps]", 2, 4, "8-10"],
  ["Day 1 - Full Body A", "Seated Row", "[Middle Back]", "[]", 3, 0, "10-12"],
  ["", "Day Total Sets:", "", "", 5, 4, ""],
  [""],
  ["Day 2 - Full Body B", "Leg Press", "[Quadriceps]", "[Calves, Glutes]", 3, 3, "10-12"],
  ["", "Day Total Sets:", "", "", 3, 3, ""],
  [""],
  ["", "WEEKLY TOTAL SETS:", "", "", 8, 7, ""],
];

describe("parseWorkoutFileClient (wide format)", () => {
  it("parses a day-per-row sheet with bracketed muscle columns", async () => {
    stageSheet(WIDE_ROWS);
    const data = await parseWorkoutFileClient("file:///wide.xlsx");

    expect(data.split).toEqual(["GF Sets", "BF Sets"]);
    expect(data.days).toHaveLength(2);

    const day1 = data.days[0];
    expect(day1.dayNumber).toBe(1);
    expect(day1.dayTitle).toBe("Day 1 - Full Body A");
    expect(day1.split["GF Sets"]).toEqual({
      totalSets: 5,
      exercises: [
        { name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: ["Shoulders", "Triceps"], sets: 2, reps: "8-10" },
        { name: "Seated Row", primaryMuscles: ["Middle Back"], secondaryMuscles: [], sets: 3, reps: "10-12" },
      ],
    });
    // A 0 in a split column records nothing for that split, mirroring the block format.
    expect(day1.split["BF Sets"].exercises).toEqual([
      { name: "Bench Press", primaryMuscles: ["Chest"], secondaryMuscles: ["Shoulders", "Triceps"], sets: 4, reps: "8-10" },
    ]);

    expect(data.days[1].dayNumber).toBe(2);
    expect(data.days[1].split["GF Sets"].totalSets).toBe(3);
  });

  it("keeps the reps column as written, blank when the sheet leaves it empty", async () => {
    stageSheet([
      ["Day", "Exercise", "Primary Muscles", "Secondary Muscles", "GF", "Reps"],
      ["Day 1 - A", "Bench Press", "[Chest]", "[]", 3, "8-12"],
      ["Day 1 - A", "Fly", "[Chest]", "[]", 3, 0],
      ["Day 1 - A", "Dip", "[Chest]", "[]", 3, ""],
    ]);
    const exercises = (await parseWorkoutFileClient("file:///wide.xlsx"))
      .days[0].exercises;
    expect(exercises?.map((e) => e.reps)).toEqual(["8-12", "0", undefined]);
  });

  it("skips the day/weekly total rows instead of reading their sheet-provided totals", async () => {
    stageSheet(WIDE_ROWS);
    const data = await parseWorkoutFileClient("file:///wide.xlsx");
    const allExercises = data.days.flatMap((d) => d.exercises ?? []);
    expect(allExercises.map((e) => e.name)).not.toContain("Day Total Sets:");
    expect(allExercises.map((e) => e.name)).not.toContain("WEEKLY TOTAL SETS:");
  });
});

describe("block format reps column", () => {
  it("reads reps from the day's header row", async () => {
    stageSheet([
      ["Day 1 — Chest"],
      ["Exercise", "Muscle Group", "GF", "BF", "Reps"],
      ["Bench Press", "Chest", 4, 3, "8-12"],
      ["Fly", "Chest", 3, 0, 0],
    ]);
    const day = (await parseWorkoutFileClient("file:///plan.xlsx")).days[0];
    expect(day.exercises?.map((e) => e.reps)).toEqual(["8-12", "0"]);
    expect(day.split.GF.exercises[0]).toMatchObject({ reps: "8-12" });
  });
});

describe("extractSplitColumnCandidates", () => {
  it("returns every non-blank header, flagging the ones the auto-scan would pick", async () => {
    stageSheet(DAY_1);
    const candidates = await extractSplitColumnCandidates("file:///plan.xlsx");
    expect(candidates).toEqual([
      { index: 2, name: "GF", autoSelected: true },
      { index: 3, name: "BF", autoSelected: true },
      { index: 5, name: "Notes", autoSelected: false },
    ]);
  });

  it("returns nothing when the sheet has no day row", async () => {
    stageSheet([["Exercise", "Muscle Group", "GF"]]);
    expect(await extractSplitColumnCandidates("file:///plan.xlsx")).toEqual([]);
  });

  it("drops headers longer than the name limit", async () => {
    stageSheet([
      ["Day 1"],
      ["Exercise", "Muscle Group", "x".repeat(51)],
      ["Bench Press", "Chest", 4],
    ]);
    expect(await extractSplitColumnCandidates("file:///plan.xlsx")).toEqual([]);
  });

  it("finds split columns after the muscle columns in the wide format, excluding Reps", async () => {
    stageSheet(WIDE_ROWS);
    const candidates = await extractSplitColumnCandidates("file:///wide.xlsx");
    expect(candidates).toEqual([
      { index: 4, name: "GF Sets", autoSelected: true },
      { index: 5, name: "BF Sets", autoSelected: true },
    ]);
  });
});
