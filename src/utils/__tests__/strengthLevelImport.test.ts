import { importStrengthLevelCSV } from "../strengthLevelImport";
import { workoutApi } from "@features/workout/services/index";

jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    startSession: jest.fn(),
    recordSet: jest.fn(),
    endSession: jest.fn(),
  },
}));

const startSession = workoutApi.startSession as jest.Mock;
const recordSet = workoutApi.recordSet as jest.Mock;
const endSession = workoutApi.endSession as jest.Mock;

const HEADER =
  "Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),Bodyweight (lb),Percentile (%),Warmup";

const csv = (...rows: string[]) => [HEADER, ...rows].join("\n");

beforeEach(() => {
  jest.clearAllMocks();
  let nextId = 1;
  startSession.mockImplementation(async () => nextId++);
  recordSet.mockResolvedValue(undefined);
  endSession.mockResolvedValue(undefined);
});

describe("importStrengthLevelCSV", () => {
  it("creates one backdated session per date and one set per row", async () => {
    const result = await importStrengthLevelCSV(
      csv(
        "2026-01-14,Squat,140,308,5,80,176,60,0",
        "2026-01-13,Bench Press,100,220,5,80,176,55,0",
        "2026-01-13,Bench Press,100,220,3,80,176,55,0",
      ),
      "Push",
    );

    expect(result).toEqual({
      sessionsCreated: 2,
      setsImported: 3,
      skipped: 0,
      errors: [],
    });

    // Dates are replayed oldest-first.
    expect(startSession.mock.calls[0][4]).toBe("2026-01-13T12:00:00.000Z");
    expect(startSession.mock.calls[1][4]).toBe("2026-01-14T12:00:00.000Z");
    expect(startSession).toHaveBeenCalledWith(
      "Push",
      1,
      "Imported (Strength Level)",
      false,
      expect.any(String),
    );
  });

  it("imports a name that differs from the exercise database only by a plural s with the database spelling", async () => {
    await importStrengthLevelCSV(
      csv("2026-01-13,Machine Tricep Extension,40,88,10,80,176,50,0"),
      "Push",
    );

    expect(recordSet.mock.calls[0][1].exerciseName).toBe(
      "Machine Triceps Extension",
    );
  });

  it("numbers sets per exercise within a session and spaces them a minute apart", async () => {
    await importStrengthLevelCSV(
      csv(
        "2026-01-13,Bench Press,100,220,5,80,176,55,0",
        "2026-01-13,Squat,140,308,5,80,176,60,0",
        "2026-01-13,Bench Press,105,231,3,80,176,55,0",
      ),
      "Push",
    );

    const setIndices = recordSet.mock.calls.map((c) => [
      c[1].exerciseName,
      c[1].setIndex,
    ]);
    expect(setIndices).toEqual([
      ["Bench Press", 1],
      ["Squat", 1],
      ["Bench Press", 2],
    ]);
    expect(recordSet.mock.calls[0][1].startTime).toBe("2026-01-13T12:00:00.000Z");
    expect(recordSet.mock.calls[0][1].endTime).toBe("2026-01-13T12:01:00.000Z");
    expect(recordSet.mock.calls[1][1].startTime).toBe("2026-01-13T12:01:00.000Z");
    expect(endSession).toHaveBeenCalledWith(1, "2026-01-13T12:03:00.000Z");
  });

  it("reads the warmup flag as 1 or true", async () => {
    await importStrengthLevelCSV(
      csv(
        "2026-01-13,Bench Press,60,132,10,80,176,20,1",
        "2026-01-13,Bench Press,70,154,8,80,176,25,TRUE",
        "2026-01-13,Bench Press,100,220,5,80,176,55,0",
      ),
      "Push",
    );
    expect(recordSet.mock.calls.map((c) => c[1].isWarmup)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("handles quoted fields with embedded commas and escaped quotes", async () => {
    await importStrengthLevelCSV(
      csv('2026-01-13,"Row, Barbell ""Pendlay""",100,220,5,80,176,55,0'),
      "Pull",
    );
    expect(recordSet.mock.calls[0][1].exerciseName).toBe('Row, Barbell "Pendlay"');
  });

  it("skips rows missing a date, exercise, or numeric reps", async () => {
    const result = await importStrengthLevelCSV(
      csv(
        ",Squat,140,308,5,80,176,60,0",
        "2026-01-13,,140,308,5,80,176,60,0",
        "2026-01-13,Squat,140,308,x,80,176,60,0",
        "2026-01-13,Squat,140,308,5,80,176,60,0",
      ),
      "Legs",
    );
    expect(result.setsImported).toBe(1);
  });

  it("defaults an unparseable weight to zero", async () => {
    await importStrengthLevelCSV(
      csv("2026-01-13,Pull Up,,,8,80,176,20,0"),
      "Pull",
    );
    expect(recordSet.mock.calls[0][1].weight).toBe(0);
  });

  it("reports an error when the file has no usable rows", async () => {
    const result = await importStrengthLevelCSV(HEADER, "Push");
    expect(result.errors).toEqual(["No valid rows found in the file."]);
    expect(startSession).not.toHaveBeenCalled();
  });

  it("rejects a CSV whose required columns are missing", async () => {
    await expect(
      importStrengthLevelCSV("Foo,Bar\n1,2", "Push"),
    ).rejects.toThrow("Unrecognized CSV format");
  });

  it("counts the whole day as skipped when the session cannot be created", async () => {
    startSession.mockRejectedValueOnce(new Error("offline"));
    const result = await importStrengthLevelCSV(
      csv(
        "2026-01-13,Squat,140,308,5,80,176,60,0",
        "2026-01-13,Squat,140,308,5,80,176,60,0",
      ),
      "Legs",
    );
    expect(result).toMatchObject({ sessionsCreated: 0, setsImported: 0, skipped: 2 });
    expect(result.errors[0]).toContain("Failed to create session for 2026-01-13");
  });

  it("records a per-set failure without aborting the rest of the session", async () => {
    recordSet.mockRejectedValueOnce(new Error("boom"));
    const result = await importStrengthLevelCSV(
      csv(
        "2026-01-13,Squat,140,308,5,80,176,60,0",
        "2026-01-13,Squat,140,308,5,80,176,60,0",
      ),
      "Legs",
    );
    expect(result).toMatchObject({ sessionsCreated: 1, setsImported: 1, skipped: 1 });
    expect(result.errors[0]).toContain("Failed to import set (Squat on 2026-01-13)");
  });

  it("reports a failure to close the session", async () => {
    endSession.mockRejectedValueOnce(new Error("nope"));
    const result = await importStrengthLevelCSV(
      csv("2026-01-13,Squat,140,308,5,80,176,60,0"),
      "Legs",
    );
    expect(result.sessionsCreated).toBe(0);
    expect(result.errors[0]).toContain("Failed to close imported session");
  });

  it("flags an unparseable date instead of creating a session for it", async () => {
    const result = await importStrengthLevelCSV(
      csv("not-a-date,Squat,140,308,5,80,176,60,0"),
      "Legs",
    );
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toBe('Skipped invalid date: "not-a-date"');
    expect(startSession).not.toHaveBeenCalled();
  });
});
