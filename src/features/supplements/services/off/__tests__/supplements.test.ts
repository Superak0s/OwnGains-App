jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import type { supplementsApi as Api } from "../supplements";

let supplementsApi: typeof Api;

beforeEach(() => {
  // Resetting the registry also gives each test a fresh in-memory store, and
  // clears the module-level per-supplement RecordStore cache.
  jest.resetModules();
  supplementsApi = require("../supplements").supplementsApi;
});

afterEach(() => jest.useRealTimers());

const create = (name = "Creatine", extra = {}) =>
  supplementsApi.create({ name, ...extra } as any);

// Offline ids are offset out of the server's id space by LOCAL_ID_BASE.
const ID = (n: number) => 1_000_000_000 + n;

describe("create / list", () => {
  it("fills in defaults for everything but the name", async () => {
    const { supplement } = await create();
    expect(supplement).toMatchObject({
      id: ID(1),
      name: "Creatine",
      unit: "g",
      defaultAmount: 1,
      reminderEnabled: false,
      reminderTime: null,
      color: null,
      icon: null,
      takenToday: false,
      dosesPerDay: 1,
      doseIntervalMinutes: null,
      dosesToday: 0,
      lastTakenAt: null,
      streak: 0,
    });
  });

  it("keeps the values that were supplied", async () => {
    const { supplement } = await create("Vitamin D", {
      unit: "IU",
      defaultAmount: 2000,
      reminderEnabled: true,
      reminderTime: "08:00",
      color: "#fff",
      icon: "sun",
    });
    expect(supplement).toMatchObject({
      unit: "IU",
      defaultAmount: 2000,
      reminderEnabled: true,
      reminderTime: "08:00",
      color: "#fff",
      icon: "sun",
    });
  });

  it("hands out increasing ids and lists everything created", async () => {
    await create("A");
    await create("B");
    const { supplements } = await supplementsApi.list();
    expect(supplements.map((s) => [s.id, s.name])).toEqual([
      [ID(1), "A"],
      [ID(2), "B"],
    ]);
  });

  it("is empty before anything is created", async () => {
    expect(await supplementsApi.list()).toEqual({
      success: true,
      supplements: [],
    });
  });
});

describe("update", () => {
  it("applies only the fields that were passed", async () => {
    await create();
    const { supplement } = await supplementsApi.update(ID(1), {
      name: "Creatine Mono",
      defaultAmount: 5,
      reminderEnabled: true,
      reminderTime: "07:30",
      color: "#0f0",
      icon: "pill",
      unit: "mg",
    });
    expect(supplement).toMatchObject({
      name: "Creatine Mono",
      defaultAmount: 5,
      unit: "mg",
      reminderEnabled: true,
      reminderTime: "07:30",
      color: "#0f0",
      icon: "pill",
    });

    const untouched = await supplementsApi.update(ID(1), {});
    expect(untouched.supplement).toMatchObject({
      name: "Creatine Mono",
      defaultAmount: 5,
    });
  });

  it("can clear the reminder time back to null", async () => {
    await create("Vitamin D", { reminderTime: "08:00" });
    const { supplement } = await supplementsApi.update(ID(1), {
      reminderTime: null,
    });
    expect(supplement.reminderTime).toBeNull();
  });

  it("throws for an unknown supplement", async () => {
    await expect(supplementsApi.update(9, { name: "x" })).rejects.toThrow(
      "Supplement 9 not found",
    );
  });
});

describe("delete", () => {
  it("drops the supplement and its log", async () => {
    await create();
    await supplementsApi.log(ID(1), { takenAt: "2024-01-01T10:00:00.000Z" });
    await supplementsApi.delete(ID(1));

    expect((await supplementsApi.list()).supplements).toEqual([]);
    await expect(supplementsApi.getLog(ID(1))).rejects.toThrow(
      `Supplement ${ID(1)} not found`,
    );
  });
});

describe("log", () => {
  it("falls back to the supplement's default amount and now", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-05T08:00:00.000Z"));
    await create("Creatine", { defaultAmount: 5 });
    const result = await supplementsApi.log(ID(1));

    expect(result).toMatchObject({ success: true, id: ID(1), streak: 1 });
    const { entries } = await supplementsApi.getLog(ID(1));
    expect(entries[0]).toMatchObject({
      supplementId: ID(1),
      amount: 5,
      takenAt: "2024-05-05T08:00:00.000Z",
      note: null,
    });
  });

  it("honours an explicit amount, timestamp and note", async () => {
    await create();
    await supplementsApi.log(ID(1), {
      amount: 3,
      takenAt: "2024-01-01T10:00:00.000Z",
      note: "post workout",
    });
    const { entries } = await supplementsApi.getLog(ID(1));
    expect(entries[0]).toMatchObject({ amount: 3, note: "post workout" });
  });

  it("numbers entries across supplements from one counter", async () => {
    await create("A");
    await create("B");
    expect((await supplementsApi.log(ID(1))).id).toBe(ID(1));
    expect((await supplementsApi.log(ID(2))).id).toBe(ID(2));
  });

  it("counts consecutive days as a streak", async () => {
    const daysAgo = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      return d.toISOString();
    };
    await create();
    await supplementsApi.log(ID(1), { takenAt: daysAgo(1) });
    expect((await supplementsApi.log(ID(1), { takenAt: daysAgo(0) })).streak).toBe(2);
  });

  it("throws for an unknown supplement", async () => {
    await expect(supplementsApi.log(9)).rejects.toThrow(
      "Supplement 9 not found",
    );
  });
});

describe("getLog", () => {
  it("returns entries newest first and honours the limit", async () => {
    await create();
    await supplementsApi.log(ID(1), { takenAt: "2024-01-01T10:00:00.000Z" });
    await supplementsApi.log(ID(1), { takenAt: "2024-01-03T10:00:00.000Z" });
    await supplementsApi.log(ID(1), { takenAt: "2024-01-02T10:00:00.000Z" });

    const { entries } = await supplementsApi.getLog(ID(1), 2);
    expect(entries.map((e) => e.takenAt)).toEqual([
      "2024-01-03T10:00:00.000Z",
      "2024-01-02T10:00:00.000Z",
    ]);
  });

  it("reports today's entry when there is one", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-05T08:00:00.000Z"));
    await create();
    await supplementsApi.log(ID(1), { takenAt: "2024-01-01T10:00:00.000Z" });

    const before = await supplementsApi.getLog(ID(1));
    expect(before).toMatchObject({ takenToday: false, todayEntry: null });

    await supplementsApi.log(ID(1));
    const after = await supplementsApi.getLog(ID(1));
    expect(after.takenToday).toBe(true);
    expect(after.todayEntry).toMatchObject({
      takenAt: "2024-05-05T08:00:00.000Z",
    });
    expect((await supplementsApi.list()).supplements[0].takenToday).toBe(true);
  });
});

describe("multiple doses", () => {
  it("stores the dose schedule and can change it", async () => {
    await create("Creatine", { dosesPerDay: 3, doseIntervalMinutes: 240 });
    const { supplement } = await supplementsApi.update(ID(1), {
      doseIntervalMinutes: null,
    });
    expect(supplement).toMatchObject({ dosesPerDay: 3, doseIntervalMinutes: null });
  });

  it("counts today's doses and remembers the latest", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-05-05T12:00:00.000Z"));
    await create("Creatine", { dosesPerDay: 3 });
    await supplementsApi.log(ID(1), { takenAt: "2024-05-04T20:00:00.000Z" });
    await supplementsApi.log(ID(1), { takenAt: "2024-05-05T11:00:00.000Z" });
    await supplementsApi.log(ID(1), { takenAt: "2024-05-05T08:00:00.000Z" });

    const [s] = (await supplementsApi.list()).supplements;
    expect(s).toMatchObject({
      dosesToday: 2,
      takenToday: true,
      lastTakenAt: "2024-05-05T11:00:00.000Z",
    });
  });
});

describe("deleteLogEntry", () => {
  it("removes just that entry", async () => {
    await create();
    await supplementsApi.log(ID(1), { takenAt: "2024-01-01T10:00:00.000Z" });
    const second = await supplementsApi.log(ID(1), {
      takenAt: "2024-01-02T10:00:00.000Z",
    });

    await supplementsApi.deleteLogEntry(ID(1), second.id);
    const { entries } = await supplementsApi.getLog(ID(1));
    expect(entries.map((e) => e.takenAt)).toEqual(["2024-01-01T10:00:00.000Z"]);
  });
});

// Ids come from a counter starting at 1, the same space the server numbers its
// own rows in, so they are offset instead of colliding.
describe("id space", () => {
  it("keeps offline ids clear of server ids", async () => {
    const { supplement } = await create();
    expect(supplement.id).toBeGreaterThan(1_000_000_000);
  });
});

// The online version returns 404 on both. Reporting success for a deletion that
// did not happen is the opposite behaviour for the same call.
describe("deleting something that is not there", () => {
  it("throws for an unknown supplement", async () => {
    await expect(supplementsApi.delete(ID(9))).rejects.toThrow("not found");
  });

  it("throws for an unknown log entry", async () => {
    await create();
    await expect(supplementsApi.deleteLogEntry(ID(1), 12345)).rejects.toThrow(
      "not found",
    );
  });
});
