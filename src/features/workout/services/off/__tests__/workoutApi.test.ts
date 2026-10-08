jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);
jest.mock("@features/plan/services/index", () => ({
  programApi: { deleteProgram: jest.fn(async () => {}) },
}));
jest.mock("expo-document-picker", () => ({
  __esModule: true,
  getDocumentAsync: jest.fn(),
}));

import * as DocumentPicker from "expo-document-picker";
import { programApi } from "@features/plan/services/index";
import { resetMemorySqlite } from "test-utils/memorySqlite";
import { workoutApi } from "../workout";

const getDocument = DocumentPicker.getDocumentAsync as jest.Mock;

const startAt = (start: string, split = "push", day = 1) =>
  workoutApi.startSession(
    split,
    day,
    "Chest day",
    false,
    start,
  );

const record = (
  sessionId: number | string,
  exercise: string,
  overrides: Partial<{ weight: number; reps: number; warmup: boolean }> = {},
) =>
  workoutApi.recordSet(sessionId, {
    exerciseName: exercise,
    setIndex: 0,
    startTime: "2024-01-01T10:00:00.000Z",
    endTime: "2024-01-01T10:00:30.000Z",
    weight: overrides.weight ?? 100,
    reps: overrides.reps ?? 10,
    note: "",
    isWarmup: overrides.warmup ?? false,
    primaryMuscles: ["Chest"],
  });

beforeEach(() => {
  resetMemorySqlite();
  jest.clearAllMocks();
});

describe("pickWorkoutFile", () => {
  it("returns the picked file's uri", async () => {
    getDocument.mockResolvedValue({
      canceled: false,
      assets: [{ uri: "file:///plan.xlsx" }],
    });
    expect(await workoutApi.pickWorkoutFile()).toBe("file:///plan.xlsx");
  });

  it("is null when cancelled or when the picker returns nothing", async () => {
    getDocument.mockResolvedValue({ canceled: true });
    expect(await workoutApi.pickWorkoutFile()).toBeNull();

    getDocument.mockResolvedValue({ canceled: false, assets: [] });
    expect(await workoutApi.pickWorkoutFile()).toBeNull();
  });

  it("rethrows a picker failure", async () => {
    getDocument.mockRejectedValue(new Error("no picker"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(workoutApi.pickWorkoutFile()).rejects.toThrow("no picker");
    error.mockRestore();
  });
});

describe("startSession", () => {
  it("numbers sessions from one, prefixed, and stamps the given start time", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    // Prefixed so an offline id can never be read as a server session id.
    expect(id).toBe("off_1");
    expect(await startAt("2024-01-02T10:00:00.000Z")).toBe("off_2");

    expect(await workoutApi.getSession(id)).toEqual({
      id,
      dayNumber: 1,
      dayTitle: "Chest day",
      startTime: "2024-01-01T10:00:00.000Z",
      endTime: undefined,
      setTimings: [],
      completedSets: 0,
      totalDuration: undefined,
      primaryMuscles: [],
      secondaryMuscles: [],
    });
  });

  it("defaults the start time to now and the split to local", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-01T08:00:00.000Z"));
    const id = await workoutApi.startSession(null, 2);
    jest.useRealTimers();

    const [session] = await workoutApi.getSessionHistory();
    expect(session.startTime).toBe("2024-05-01T08:00:00.000Z");
    expect((await workoutApi.getSession(id)).dayNumber).toBe(2);
  });
});

describe("recordSet", () => {
  it("appends timings with incrementing ids", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    const first = await record(id, "Bench");
    const second = await record(id, "Fly");

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
    expect(first).toMatchObject({
      exerciseName: "Bench",
      exercisePrimaryMuscles: ["Chest"],
      weight: 100,
      reps: 10,
      isWarmup: false,
    });
    expect((await workoutApi.getSession(id)).setTimings).toHaveLength(2);
  });

  it("refuses an unknown session", async () => {
    await expect(record(99, "Bench")).rejects.toThrow(
      "Failed to record set: session not found",
    );
  });
});

describe("updateSet", () => {
  it("applies only the fields given", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    const timing = await record(id, "Bench");

    const updated = await workoutApi.updateSet(id, timing.id!, {
      weight: 120,
      note: "felt good",
    });
    expect(updated).toMatchObject({
      exerciseName: "Bench",
      weight: 120,
      reps: 10,
      note: "felt good",
    });
  });

  it("can clear the muscle group and flip the warmup flag", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    const timing = await record(id, "Bench");

    const updated = await workoutApi.updateSet(id, String(timing.id), {
      exerciseName: "Incline Bench",
      primaryMuscles: null,
      reps: 8,
      isWarmup: true,
      startTime: "2024-01-01T11:00:00.000Z",
      endTime: "2024-01-01T11:00:40.000Z",
    });
    expect(updated).toMatchObject({
      exerciseName: "Incline Bench",
      exercisePrimaryMuscles: undefined,
      reps: 8,
      isWarmup: true,
      startTime: "2024-01-01T11:00:00.000Z",
      endTime: "2024-01-01T11:00:40.000Z",
    });
  });

  it("refuses an unknown session or set", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    await expect(workoutApi.updateSet(99, 1, {})).rejects.toThrow(
      "Failed to update set: session not found",
    );
    await expect(workoutApi.updateSet(id, 99, {})).rejects.toThrow(
      "Failed to update set: set not found",
    );
  });
});

describe("renameExercise", () => {
  it("renames matching sets in the split only and counts them", async () => {
    const push = await startAt("2024-01-01T10:00:00.000Z", "push");
    const pull = await startAt("2024-01-02T10:00:00.000Z", "pull");
    await record(push, "Bench");
    await record(push, "Bench");
    await record(push, "Fly");
    await record(pull, "Bench");

    expect(
      await workoutApi.renameExercise("push", "Bench", {
        newName: "Barbell Bench",
        primaryMuscles: null,
      }),
    ).toEqual({ updatedCount: 2 });

    const pushSets = (await workoutApi.getSession(push)).setTimings!;
    expect(pushSets.map((t) => t.exerciseName)).toEqual([
      "Barbell Bench",
      "Barbell Bench",
      "Fly",
    ]);
    expect(
      (await workoutApi.getSession(pull)).setTimings![0].exerciseName,
    ).toBe("Bench");
  });

  it("counts nothing when no set matches", async () => {
    await startAt("2024-01-01T10:00:00.000Z");
    expect(
      await workoutApi.renameExercise("push", "Squat", {
        newName: "Front Squat",
      }),
    ).toEqual({ updatedCount: 0 });
  });
});

describe("endSession", () => {
  it("stamps the end time and returns the timings", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    await record(id, "Bench");

    const ended = await workoutApi.endSession(id, "2024-01-01T11:00:00.000Z");
    expect(ended.endTime).toBe("2024-01-01T11:00:00.000Z");
    expect(ended.setTimings).toHaveLength(1);
    expect(ended).not.toHaveProperty("is_demo");
  });

  it("defaults the end time to now", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-01T09:00:00.000Z"));
    const id = await workoutApi.startSession("push", 1);
    const ended = await workoutApi.endSession(id);
    jest.useRealTimers();

    expect(ended.endTime).toBe("2024-05-01T09:00:00.000Z");
  });

  it("refuses an unknown session", async () => {
    await expect(workoutApi.endSession(99)).rejects.toThrow(
      "Failed to end session: session not found",
    );
  });
});

describe("getSessionHistory", () => {
  it("returns sessions newest first with a set count instead of timings", async () => {
    const first = await startAt("2024-01-01T10:00:00.000Z");
    await startAt("2024-01-03T10:00:00.000Z");
    await startAt("2024-01-02T10:00:00.000Z");
    await record(first, "Bench");

    const history = await workoutApi.getSessionHistory();
    expect(history.map((s) => s.startTime)).toEqual([
      "2024-01-03T10:00:00.000Z",
      "2024-01-02T10:00:00.000Z",
      "2024-01-01T10:00:00.000Z",
    ]);
    expect(history[2].setCount).toBe(1);
    expect(history[2].setTimings).toBeUndefined();
  });

  it("filters by split and day, and can include the timings", async () => {
    const push = await startAt("2024-01-01T10:00:00.000Z", "push", 1);
    await startAt("2024-01-02T10:00:00.000Z", "pull", 1);
    await startAt("2024-01-03T10:00:00.000Z", "push", 2);
    await record(push, "Bench");

    const history = await workoutApi.getSessionHistory("push", 1, 10, true);
    expect(history).toHaveLength(1);
    expect(history[0].setTimings).toHaveLength(1);
  });

  it("honours the limit", async () => {
    await startAt("2024-01-01T10:00:00.000Z");
    await startAt("2024-01-02T10:00:00.000Z");
    expect(await workoutApi.getSessionHistory(null, null, 1)).toHaveLength(1);
  });

  it("applies the limit after the split filter, not before", async () => {
    await startAt("2024-01-01T10:00:00.000Z", "push");
    await startAt("2024-01-02T10:00:00.000Z", "pull");
    await startAt("2024-01-03T10:00:00.000Z", "pull");

    const history = await workoutApi.getSessionHistory("push", null, 1);
    expect(history.map((s) => s.startTime)).toEqual(["2024-01-01T10:00:00.000Z"]);
  });
});

describe("getSessionHistoryPage", () => {
  it("pages newest first until the cursor runs out", async () => {
    await startAt("2024-01-01T10:00:00.000Z");
    await startAt("2024-01-03T10:00:00.000Z");
    await startAt("2024-01-02T10:00:00.000Z");
    await startAt("2024-01-04T10:00:00.000Z", "pull");

    const first = await workoutApi.getSessionHistoryPage("push", null, 2);
    expect(first.sessions.map((s) => s.startTime)).toEqual([
      "2024-01-03T10:00:00.000Z",
      "2024-01-02T10:00:00.000Z",
    ]);
    expect(first.nextCursor).not.toBeNull();

    const second = await workoutApi.getSessionHistoryPage("push", first.nextCursor, 2);
    expect(second.sessions.map((s) => s.startTime)).toEqual([
      "2024-01-01T10:00:00.000Z",
    ]);
    expect(second.nextCursor).toBeNull();
  });
});

describe("getSession", () => {
  it("refuses an unknown session", async () => {
    await expect(workoutApi.getSession(99)).rejects.toThrow(
      "Failed to get session: session not found",
    );
  });
});

describe("getAnalytics", () => {
  const daysAgo = (n: number) =>
    new Date(Date.now() - n * 86400_000).toISOString();

  it("summarises only the sessions in the requested split and day", async () => {
    const push = await startAt(daysAgo(2), "push", 1);
    const pull = await startAt(daysAgo(1), "pull", 1);
    await record(push, "Bench");
    await record(pull, "Row");

    expect((await workoutApi.getAnalytics("push", 1)).totalSessions).toBe(1);
    expect((await workoutApi.getAnalytics()).totalSessions).toBe(2);
  });

  it("ignores sessions older than the requested window", async () => {
    await startAt(daysAgo(400), "push", 1);

    expect((await workoutApi.getAnalytics()).totalSessions).toBe(0);
    expect((await workoutApi.getAnalytics(null, null, 500)).totalSessions).toBe(
      1,
    );
  });
});

describe("deletion", () => {
  it("clears demo sessions only", async () => {
    await workoutApi.startSession("push", 1, "Day", true);
    await startAt("2024-01-02T10:00:00.000Z");
    expect(await workoutApi.clearDemoSessions()).toEqual({
      success: true,
      deletedCount: 1,
    });
    expect(await workoutApi.getSessionHistory()).toHaveLength(1);
  });

  it("clears every session in one split", async () => {
    await startAt("2024-01-01T10:00:00.000Z", "push");
    await startAt("2024-01-02T10:00:00.000Z", "push");
    await startAt("2024-01-03T10:00:00.000Z", "pull");

    expect(await workoutApi.deleteAllSessionsForSplit("push")).toEqual({
      success: true,
      deletedCount: 2,
    });
    expect(await workoutApi.getSessionHistory()).toHaveLength(1);
  });

  it("wipes the sessions and the imported program together", async () => {
    await startAt("2024-01-01T10:00:00.000Z");

    expect(await workoutApi.deleteAllUserData()).toEqual({ success: true });
    expect(await workoutApi.getSessionHistory()).toEqual([]);
    expect(programApi.deleteProgram).toHaveBeenCalled();
  });
});

describe("parity with the server routes", () => {
  it("deletes every duplicate of a re-logged set so the row doesn't reappear", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    await record(id, "Bench Press");
    await record(id, "Bench Press");
    await record(id, "Squat");

    expect(await workoutApi.deleteSet(id, "Bench Press", 0)).toEqual({ deletedCount: 2 });
    expect(await workoutApi.deleteSet(id, "Bench Press", 0)).toEqual({ deletedCount: 0 });
    expect((await workoutApi.getSession(id)).setTimings?.map((t) => t.exerciseName)).toEqual(["Squat"]);
  });

  it("refuses to delete a set from an unknown session, like the server's 404", async () => {
    await expect(workoutApi.deleteSet("off_999", "Bench Press", 0)).rejects.toThrow("session not found");
  });

  it("moves a running session to another day and ignores a session that no longer exists", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");

    await workoutApi.updateSessionDay(id, 3, "Legs");
    await expect(workoutApi.updateSessionDay("off_999", 3)).resolves.toBeUndefined();

    expect(await workoutApi.getSession(id)).toMatchObject({ dayNumber: 3, dayTitle: "Legs" });
  });

  it("answers the record-sessions query with an array, never the online null for an old server", async () => {
    const id = await startAt("2024-01-01T10:00:00.000Z");
    await record(id, "Bench Press", { weight: 120 });

    const records = await workoutApi.getRecordSessions();
    expect(Array.isArray(records)).toBe(true);
    expect(records?.[0].setTimings?.[0].weight).toBe(120);
  });
});
