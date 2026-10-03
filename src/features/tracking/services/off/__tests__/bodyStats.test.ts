jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { resetMemorySqlite } from "test-utils/memorySqlite";
import {
  bodyTrackingApi,
  bodyFatApi,
  getCurrentBodyWeight,
} from "../bodyStats";
import type { BodyFatMeasurements } from "../../../types";

const measurements = {
  height: 180,
  neck: 38,
  waist: 82,
} as unknown as BodyFatMeasurements;

beforeEach(() => resetMemorySqlite());

describe("weight logging", () => {
  it("stores kg as given and converts lbs to kg", async () => {
    await bodyTrackingApi.logWeight(80, "kg", null, "2024-01-01T10:00:00Z");
    await bodyTrackingApi.logWeight(200, "lbs", "bulk", "2024-01-02T10:00:00Z");

    const { entries } = await bodyTrackingApi.getWeightHistory();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ note: "bulk" });
    expect(entries[0].weightKg).toBeCloseTo(90.7184, 3);
    expect(entries[1].weightKg).toBe(80);
  });

  it("defaults the timestamp to now", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-05T08:00:00.000Z"));
    await bodyTrackingApi.logWeight(80, "kg");
    const { entries } = await bodyTrackingApi.getWeightHistory();
    expect(entries[0].recordedAt).toBe("2024-05-05T08:00:00.000Z");
    jest.useRealTimers();
  });

  it("returns history newest first and honours the limit", async () => {
    await bodyTrackingApi.logWeight(80, "kg", null, "2024-01-01T10:00:00Z");
    await bodyTrackingApi.logWeight(81, "kg", null, "2024-01-02T10:00:00Z");
    await bodyTrackingApi.logWeight(82, "kg", null, "2024-01-03T10:00:00Z");

    const { entries } = await bodyTrackingApi.getWeightHistory(2);
    expect(entries.map((e) => e.weightKg)).toEqual([82, 81]);
  });

  it("deletes one entry by id", async () => {
    await bodyTrackingApi.logWeight(80, "kg", null, "2024-01-01T10:00:00Z");
    const { entries } = await bodyTrackingApi.getWeightHistory();
    await bodyTrackingApi.deleteWeightEntry(entries[0].id);
    expect((await bodyTrackingApi.getWeightHistory()).entries).toEqual([]);
  });
});

describe("getCurrentWeight / getCurrentBodyWeight", () => {
  it("returns the most recent entry, or nothing at all", async () => {
    expect(await bodyTrackingApi.getCurrentWeight()).toEqual({});
    expect(await getCurrentBodyWeight()).toBeNull();

    await bodyTrackingApi.logWeight(80, "kg", null, "2024-01-01T10:00:00Z");
    await bodyTrackingApi.logWeight(85, "kg", null, "2024-02-01T10:00:00Z");

    expect(await bodyTrackingApi.getCurrentWeight()).toEqual({
      entry: { weightKg: 85 },
    });
    expect(await getCurrentBodyWeight("u1")).toBe(85);
  });
});

describe("body fat logging", () => {
  it("anchors a date-only value to local midday so it sorts within the day", async () => {
    await bodyFatApi.logBodyFat(18.5, measurements, "male", "2024-01-01");
    const { entries } = await bodyFatApi.getBodyFatHistory();
    expect(entries[0]).toMatchObject({
      percentage: 18.5,
      gender: "male",
      method: "us_navy",
      // UTC ISO, so it compares against the "now" stamps written elsewhere.
      calculatedAt: new Date("2024-01-01T12:00:00").toISOString(),
    });
  });

  it("keeps a full timestamp as-is and defaults to now", async () => {
    await bodyFatApi.logBodyFat(18, measurements, "male", "2024-01-02T07:30:00Z");
    jest.useFakeTimers().setSystemTime(new Date("2024-05-05T08:00:00.000Z"));
    await bodyFatApi.logBodyFat(17, measurements, "female");
    jest.useRealTimers();

    const { entries } = await bodyFatApi.getBodyFatHistory();
    expect(entries.map((e) => e.calculatedAt)).toEqual([
      "2024-05-05T08:00:00.000Z",
      "2024-01-02T07:30:00Z",
    ]);
  });

  it("honours the history limit and deletes by id", async () => {
    await bodyFatApi.logBodyFat(18, measurements, "male", "2024-01-01");
    await bodyFatApi.logBodyFat(17, measurements, "male", "2024-01-02");

    expect((await bodyFatApi.getBodyFatHistory(1)).entries).toHaveLength(1);

    const { entries } = await bodyFatApi.getBodyFatHistory();
    await bodyFatApi.deleteBodyFatEntry(entries[0].id);
    expect((await bodyFatApi.getBodyFatHistory()).entries).toHaveLength(1);
  });
});
