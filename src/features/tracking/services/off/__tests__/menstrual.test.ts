jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { resetMemorySqlite } from "test-utils/memorySqlite";
import { menstrualApi } from "../menstrual";

const DAY = 24 * 60 * 60 * 1000;
const START = "2024-01-01T00:00:00.000Z";

const nowAtCycleDay = (daysSinceStart: number) =>
  jest
    .useFakeTimers()
    .setSystemTime(new Date(Date.parse(START) + daysSinceStart * DAY));

beforeEach(() => resetMemorySqlite());
afterEach(() => jest.useRealTimers());

describe("logMenstrualCycle", () => {
  it("accepts a Date and defaults the flow and symptoms", async () => {
    const { data } = await menstrualApi.logMenstrualCycle(new Date(START));
    expect(data).toMatchObject({
      cycleStart: START,
      symptoms: [],
    });
  });

  it("keeps an explicit flow, symptom list and string start", async () => {
    const { data } = await menstrualApi.logMenstrualCycle(START, ["cramps"]);
    expect(data).toMatchObject({
      symptoms: ["cramps"],
    });
  });
});

describe("getMenstrualHistory", () => {
  it("returns cycles newest first and honours the limit", async () => {
    await menstrualApi.logMenstrualCycle("2024-01-01T00:00:00.000Z");
    await menstrualApi.logMenstrualCycle("2024-03-01T00:00:00.000Z");
    await menstrualApi.logMenstrualCycle("2024-02-01T00:00:00.000Z");

    const { data } = await menstrualApi.getMenstrualHistory(2);
    expect(data!.map((e) => e.cycleStart)).toEqual([
      "2024-03-01T00:00:00.000Z",
      "2024-02-01T00:00:00.000Z",
    ]);
  });
});

describe("deleteMenstrualEntry", () => {
  it("removes just that cycle", async () => {
    const { data } = await menstrualApi.logMenstrualCycle(START);
    await menstrualApi.logMenstrualCycle("2024-02-01T00:00:00.000Z");
    await menstrualApi.deleteMenstrualEntry(data!.id);

    const history = await menstrualApi.getMenstrualHistory();
    expect(history.data!.map((e) => e.cycleStart)).toEqual([
      "2024-02-01T00:00:00.000Z",
    ]);
  });
});

describe("settings", () => {
  it("starts at the 5/28 default", async () => {
    expect((await menstrualApi.getSettings()).data).toEqual({
      periodDays: 5,
      cycleLengthDays: 28,
    });
  });

  it("updates each field independently", async () => {
    await menstrualApi.setSettings(7);
    expect((await menstrualApi.getSettings()).data).toEqual({
      periodDays: 7,
      cycleLengthDays: 28,
    });

    await menstrualApi.setSettings(undefined, 30);
    expect((await menstrualApi.getSettings()).data).toEqual({
      periodDays: 7,
      cycleLengthDays: 30,
    });
  });
});

describe("getCycleStats", () => {
  it("reports nothing at all with no history", async () => {
    const { data } = await menstrualApi.getCycleStats();
    expect(data).toEqual({
      currentPhase: null,
      averageCycleLength: 28,
      nextPeriodEstimate: null,
      lastCycleEntry: null,
    });
  });

  it("falls back to the configured cycle length with one entry", async () => {
    nowAtCycleDay(2);
    await menstrualApi.logMenstrualCycle(START);

    const { data } = await menstrualApi.getCycleStats();
    expect(data!.averageCycleLength).toBe(28);
    expect(data!.nextPeriodEstimate).toBe("2024-01-29T00:00:00.000Z");
    expect(data!.lastCycleEntry!.cycleStart).toBe(START);
  });

  it("averages the gaps between logged cycles", async () => {
    nowAtCycleDay(0);
    await menstrualApi.logMenstrualCycle("2024-01-01T00:00:00.000Z");
    await menstrualApi.logMenstrualCycle("2024-01-29T00:00:00.000Z");
    await menstrualApi.logMenstrualCycle("2024-02-28T00:00:00.000Z");

    const { data } = await menstrualApi.getCycleStats();
    expect(data!.averageCycleLength).toBe(29);
    expect(data!.lastCycleEntry!.cycleStart).toBe("2024-02-28T00:00:00.000Z");
  });

  it("ignores duplicate starts when averaging", async () => {
    nowAtCycleDay(0);
    await menstrualApi.logMenstrualCycle("2024-01-01T00:00:00.000Z");
    await menstrualApi.logMenstrualCycle("2024-01-01T00:00:00.000Z");

    const { data } = await menstrualApi.getCycleStats();
    expect(data!.averageCycleLength).toBe(28);
  });

  it.each([
    [2, "menstruation", 3, "2024-01-04T00:00:00.000Z"],
    [8, "follicular", 5, "2024-01-06T00:00:00.000Z"],
    [13, "ovulation", 2, "2024-01-03T00:00:00.000Z"],
    [20, "luteal", 8, "2024-01-09T00:00:00.000Z"],
  ])(
    "places day %i of the cycle in the %s phase",
    async (daysIn, phase, daysInPhase, estimatedEnd) => {
      nowAtCycleDay(daysIn);
      await menstrualApi.logMenstrualCycle(START);

      const { data } = await menstrualApi.getCycleStats();
      expect(data!.currentPhase).toEqual({ phase, daysInPhase, estimatedEnd });
    },
  );

  it("honours a settings override without reading the stored settings", async () => {
    nowAtCycleDay(8);
    await menstrualApi.setSettings(5, 28);
    await menstrualApi.logMenstrualCycle(START);

    const { data } = await menstrualApi.getCycleStats({
      periodDays: 10,
      cycleLengthDays: 30,
    });
    expect(data!.currentPhase!.phase).toBe("menstruation");
    expect(data!.averageCycleLength).toBe(30);
  });
});
