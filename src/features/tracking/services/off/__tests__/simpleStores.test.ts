jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import type { bodyMeasurementsApi as BodyMeasurementsApi } from "../bodyMeasurements";
import type { customMeasurementsApi as CustomMeasurementsApi } from "../customMeasurements";
import type { hydrationApi as HydrationApi } from "../hydration";
import type { injuryApi as InjuryApi } from "../injury";
import type { personalNotesApi as PersonalNotesApi } from "../personalNotes";
import type { sorenessApi as SorenessApi } from "../soreness";

let bodyMeasurementsApi: typeof BodyMeasurementsApi;
let customMeasurementsApi: typeof CustomMeasurementsApi;
let hydrationApi: typeof HydrationApi;
let injuryApi: typeof InjuryApi;
let personalNotesApi: typeof PersonalNotesApi;
let sorenessApi: typeof SorenessApi;

// Each record store caches an in-flight read until the next write, so every
// test gets its own module instances along with a fresh in-memory store.
beforeEach(() => {
  jest.resetModules();
  bodyMeasurementsApi = require("../bodyMeasurements").bodyMeasurementsApi;
  customMeasurementsApi = require("../customMeasurements").customMeasurementsApi;
  hydrationApi = require("../hydration").hydrationApi;
  injuryApi = require("../injury").injuryApi;
  personalNotesApi = require("../personalNotes").personalNotesApi;
  sorenessApi = require("../soreness").sorenessApi;
});

afterEach(() => jest.useRealTimers());

describe("hydration", () => {
  it("logs an entry with a generated id and returns history newest first", async () => {
    const first = await hydrationApi.logHydration(500, "with breakfast", "2024-01-01T08:00:00.000Z");
    await hydrationApi.logHydration(250, undefined, "2024-01-01T12:00:00.000Z");

    const { data } = await hydrationApi.getHydrationHistory();
    expect(data!.map((e) => e.amountMl)).toEqual([250, 500]);
    expect(data![1]).toMatchObject({
      id: first.data!.id,
      note: "with breakfast",
      loggedAt: "2024-01-01T08:00:00.000Z",
    });
    expect(data![0].note).toBeNull();
  });

  it("defaults the log time to now and honours the limit", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    await hydrationApi.logHydration(300);
    jest.useRealTimers();
    await hydrationApi.logHydration(400, undefined, "2024-01-01T08:00:00.000Z");

    const { data } = await hydrationApi.getHydrationHistory(1);
    expect(data).toHaveLength(1);
    expect(data![0].loggedAt).toBe("2024-06-01T10:00:00.000Z");
  });

  it("deletes an entry", async () => {
    const { data } = await hydrationApi.logHydration(500);
    await hydrationApi.deleteHydrationEntry(data!.id);
    expect((await hydrationApi.getHydrationHistory()).data).toEqual([]);
  });

  it("starts at the default settings and updates each field on its own", async () => {
    expect((await hydrationApi.getSettings()).data).toEqual({
      goalMl: 2500,
      measurementErrorPercent: 5,
    });

    await hydrationApi.setSettings(3000);
    expect((await hydrationApi.getSettings()).data).toEqual({
      goalMl: 3000,
      measurementErrorPercent: 5,
    });

    await hydrationApi.setSettings(undefined, 10);
    expect((await hydrationApi.getSettings()).data).toEqual({
      goalMl: 3000,
      measurementErrorPercent: 10,
    });
  });
});

describe("soreness", () => {
  it("logs, lists newest first and deletes", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-01T08:00:00.000Z"));
    const first = await sorenessApi.logSoreness({ muscleGroup: "Chest" as never, intensity: 5, note: "after bench" });
    jest.setSystemTime(new Date("2024-01-02T08:00:00.000Z"));
    await sorenessApi.logSoreness({ muscleGroup: "Back" as never, intensity: 3 });

    const { data } = await sorenessApi.getSorenessHistory();
    expect(data!.map((e) => e.muscleGroup)).toEqual(["Back", "Chest"]);
    expect(data![1].note).toBe("after bench");
    expect(data![0].note).toBeNull();

    await sorenessApi.deleteSorenessEntry(first.data!.id);
    expect(
      (await sorenessApi.getSorenessHistory()).data!.map((e) => e.muscleGroup),
    ).toEqual(["Back"]);
  });
});

describe("personal notes", () => {
  it("numbers notes from one and filters them by muscle", async () => {
    const first = await personalNotesApi.createNote({
      muscleGroup: "Chest" as never,
      content: "Bench felt heavy",
    });
    await personalNotesApi.createNote({
      muscleGroup: "Back" as never,
      content: "Rows felt light",
    });

    expect(first.data!.id).toBe(1);
    expect(first.data!.createdAt).toBe(first.data!.updatedAt);

    const { data } = await personalNotesApi.getNotesByMuscle("Chest" as never);
    expect(data!.map((n) => n.content)).toEqual(["Bench felt heavy"]);
  });
});

describe("injuries", () => {
  const log = (muscleGroup: string, startDate: string, extra = {}) =>
    injuryApi.logInjury({
      muscleGroup,
      injuryType: "strain",
      painLevel: 4,
      startDate,
      ...extra,
    } as never);

  it("logs an injury as active with no notes by default", async () => {
    const { data } = await log("Chest", "2024-01-01T00:00:00.000Z");
    expect(data).toMatchObject({
      muscleGroup: "Chest",
      injuryType: "strain",
      painLevel: 4,
      status: "active",
      note: null,
    });
  });

  it("lists all injuries and filters them by muscle", async () => {
    await log("Chest", "2024-01-01T00:00:00.000Z", { note: "sharp" });
    await log("Back", "2024-01-02T00:00:00.000Z");

    expect((await injuryApi.getAllInjuries()).data).toHaveLength(2);
    expect(
      (await injuryApi.getInjuriesByMuscle("Chest")).data!.map((i) => i.note),
    ).toEqual(["sharp"]);
    expect((await injuryApi.getActiveInjuries()).data).toHaveLength(2);
  });
});

describe("body measurements", () => {
  it("stores every measurement, blanking the ones not given", async () => {
    const { data } = await bodyMeasurementsApi.logMeasurement(
      80,
      35,
      35.5,
      null,
      "2024-01-01T08:00:00.000Z",
      "morning",
    );
    expect(data).toMatchObject({
      waistCm: 80,
      armLeftCm: 35,
      armRightCm: 35.5,
      chestCm: null,
      note: "morning",
    });
  });

  it("defaults the measurement time to now, lists newest first and deletes", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    const recent = await bodyMeasurementsApi.logMeasurement(81);
    jest.useRealTimers();
    await bodyMeasurementsApi.logMeasurement(80, null, null, null, "2024-01-01T08:00:00.000Z");

    const { data } = await bodyMeasurementsApi.getMeasurementHistory();
    expect(data!.map((e) => e.waistCm)).toEqual([81, 80]);
    expect(data![0].measuredAt).toBe("2024-06-01T10:00:00.000Z");

    await bodyMeasurementsApi.deleteMeasurementEntry(recent.data!.id);
    expect(
      (await bodyMeasurementsApi.getMeasurementHistory()).data!.map((e) => e.waistCm),
    ).toEqual([80]);
  });
});

describe("custom measurements", () => {
  it("returns the existing type instead of creating a duplicate key", async () => {
    const created = await customMeasurementsApi.createType("neck", "Neck", "cm");
    const again = await customMeasurementsApi.createType("neck", "Neck size");

    expect(again).toEqual(created);
    expect((await customMeasurementsApi.listTypes()).data).toHaveLength(1);
  });

  it("logs a value against a type with an explicit or defaulted timestamp", async () => {
    const type = await customMeasurementsApi.createType("neck", "Neck");
    expect(type.unit).toBeNull();

    const explicit = await customMeasurementsApi.logValue(
      type.keyName,
      38,
      "2024-01-01T08:00:00.000Z",
      "flexed",
    );
    expect(explicit).toMatchObject({
      keyName: type.keyName,
      value: 38,
      measuredAt: "2024-01-01T08:00:00.000Z",
      note: "flexed",
    });

    jest.useFakeTimers().setSystemTime(new Date("2024-06-01T10:00:00.000Z"));
    const defaulted = await customMeasurementsApi.logValue(type.keyName, 39);
    expect(defaulted).toMatchObject({
      measuredAt: "2024-06-01T10:00:00.000Z",
      note: null,
    });
  });
});
