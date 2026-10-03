jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { resetMemorySqlite } from "test-utils/memorySqlite";
import { sorenessApi } from "../soreness";

const log = (muscleGroup: string, intensity = 5, loggedAt?: string) =>
  sorenessApi.logSoreness({ muscleGroup, intensity, loggedAt } as never);

beforeEach(() => resetMemorySqlite());

describe("logSoreness", () => {
  it("stores an active entry with an empty follow-up log", async () => {
    const { data } = await log("Chest", 7, "2024-01-01T10:00:00.000Z");
    expect(data).toMatchObject({
      muscleGroup: "Chest",
      intensity: 7,
      status: "active",
      followUps: [],
      loggedAt: "2024-01-01T10:00:00.000Z",
    });
    expect(data!.note).toBeNull();
  });

  it("allows a second episode for a muscle that is still sore", async () => {
    await log("Chest");
    await expect(log("Chest")).resolves.toMatchObject({ success: true });
  });
});

describe("getActiveSoreness", () => {
  it("excludes recovered entries and sorts by most recently updated", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    const chest = await log("Chest", 5, "2024-01-01T10:00:00.000Z");
    const back = await log("Back", 6, "2024-01-02T10:00:00.000Z");
    const legs = await log("Legs", 4, "2024-01-03T10:00:00.000Z");

    jest.setSystemTime(new Date("2024-01-04T00:00:00.000Z"));
    await sorenessApi.updateSoreness({
      sorenessId: legs.data!.id,
      intensity: 0,
      status: "recovered",
    });
    jest.setSystemTime(new Date("2024-01-05T00:00:00.000Z"));
    await sorenessApi.updateSoreness({
      sorenessId: back.data!.id,
      intensity: 5,
      status: "still_sore",
    });
    jest.setSystemTime(new Date("2024-01-06T00:00:00.000Z"));
    await sorenessApi.updateSoreness({
      sorenessId: chest.data!.id,
      intensity: 3,
      status: "better",
    });

    const { data } = await sorenessApi.getActiveSoreness();
    expect(data!.map((e) => e.muscleGroup)).toEqual(["Chest", "Back"]);
    jest.useRealTimers();
  });
});

describe("updateSoreness", () => {
  it("maps the reported status onto the stored status", async () => {
    const { data } = await log("Chest");
    const stillSore = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 6,
      status: "still_sore",
    });
    expect(stillSore.data).toMatchObject({ status: "active", intensity: 6 });

    const better = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 3,
      status: "better",
    });
    expect(better.data!.status).toBe("recovering");

    const recovered = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 0,
      status: "recovered",
    });
    expect(recovered.data!.status).toBe("recovered");
    expect(recovered.data!.recoveredAt).toBeTruthy();
    expect(recovered.data!.followUps).toHaveLength(3);
  });

  it("keeps the first recovery timestamp if recovery is reported twice", async () => {
    const { data } = await log("Chest");
    const first = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 0,
      status: "recovered",
    });
    const second = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 0,
      status: "recovered",
    });
    expect(second.data!.recoveredAt).toBe(first.data!.recoveredAt);
  });

  it("only overwrites the note when one is supplied", async () => {
    const { data } = await log("Chest");
    await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 4,
      status: "better",
      note: "easing off",
    });
    const kept = await sorenessApi.updateSoreness({
      sorenessId: data!.id,
      intensity: 3,
      status: "better",
    });
    expect(kept.data!.note).toBe("easing off");
  });

  it("throws for an unknown soreness id", async () => {
    await expect(
      sorenessApi.updateSoreness({ sorenessId: 1, intensity: 1, status: "better" }),
    ).rejects.toThrow("Soreness entry not found");
  });
});

describe("batchFollowUp", () => {
  it("applies every update and returns them in order", async () => {
    const chest = await log("Chest");
    const back = await log("Back");

    const { data } = await sorenessApi.batchFollowUp([
      { sorenessId: chest.data!.id, intensity: 2, status: "better" },
      { sorenessId: back.data!.id, intensity: 0, status: "recovered" },
    ]);

    expect(data!.map((e) => e.status)).toEqual(["recovering", "recovered"]);
  });
});

describe("getHistoryByMuscle", () => {
  it("returns only that muscle, newest logged first", async () => {
    const first = await log("Chest", 5, "2024-01-01T10:00:00.000Z");
    await sorenessApi.updateSoreness({
      sorenessId: first.data!.id,
      intensity: 0,
      status: "recovered",
    });
    await log("Chest", 6, "2024-02-01T10:00:00.000Z");
    await log("Back", 4, "2024-03-01T10:00:00.000Z");

    const { data } = await sorenessApi.getHistoryByMuscle("Chest");
    expect(data!.map((e) => e.loggedAt)).toEqual([
      "2024-02-01T10:00:00.000Z",
      "2024-01-01T10:00:00.000Z",
    ]);
  });
});

describe("getStats", () => {
  it("is all zeroes with no data", async () => {
    const { data } = await sorenessApi.getStats();
    expect(data).toMatchObject({
      totalActiveSoreness: 0,
      totalRecoveryEpisodes: 0,
      averageRecoveryDays: 0,
      mostSoreMuscle: null,
      severityTrend: [],
      heatmapData: {},
    });
  });

  it("counts active entries, recovery episodes and the sorest muscle", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-03T10:00:00.000Z"));
    const chest = await log("Chest", 8, "2024-01-01T10:00:00.000Z");
    await log("Back", 4, "2024-01-01T10:00:00.000Z");
    await log("Legs", 9, "2024-01-02T10:00:00.000Z");
    await sorenessApi.updateSoreness({
      sorenessId: chest.data!.id,
      intensity: 0,
      status: "recovered",
    });

    const { data } = await sorenessApi.getStats();
    expect(data).toMatchObject({
      totalActiveSoreness: 2,
      totalRecoveryEpisodes: 1,
      averageRecoveryDays: 2,
      mostSoreMuscle: "Legs",
    });
    jest.useRealTimers();
  });

  it("builds a per-day severity trend and a per-muscle heatmap inside the window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-10T10:00:00.000Z"));
    await log("Chest", 6, "2024-01-08T10:00:00.000Z");
    await log("Back", 8, "2024-01-08T12:00:00.000Z");
    await log("Legs", 4, "2024-01-09T10:00:00.000Z");

    const { data } = await sorenessApi.getStats(30);
    expect(data!.severityTrend).toEqual([
      { date: "2024-01-08", averageIntensity: 7 },
      { date: "2024-01-09", averageIntensity: 4 },
    ]);
    expect(data!.heatmapData).toEqual({ Chest: 1, Back: 1, Legs: 1 });
    jest.useRealTimers();
  });

  it("drops entries older than the requested window", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-03-01T10:00:00.000Z"));
    await log("Chest", 6, "2024-01-01T10:00:00.000Z");

    const { data } = await sorenessApi.getStats(7);
    expect(data!.severityTrend).toEqual([]);
    expect(data!.heatmapData).toEqual({});
    expect(data!.totalActiveSoreness).toBe(1);
    jest.useRealTimers();
  });
});
