import React from "react";
import { create, act } from "react-test-renderer";
import { useMenstrualTab } from "../useMenstrualTab";
import { menstrualApi } from "../../services";
import { toDateString } from "@utils/format";
import type { CycleEntry } from "../../services/types";

jest.mock("../../services", () => ({
  menstrualApi: {
    getMenstrualHistory: jest.fn(),
    getSettings: jest.fn(),
    getCycleStats: jest.fn(),
    updateMenstrualCycle: jest.fn(),
    deleteMenstrualEntry: jest.fn(),
  },
}));
jest.mock("@shared/services/storage", () => ({
  saveToStorage: jest.fn().mockResolvedValue(undefined),
  loadFromStorage: jest.fn().mockResolvedValue(null),
  STORAGE_KEYS: { MENSTRUAL_PREFS: "menstrual_prefs" },
}));
jest.mock("@shared/services/crashReporting", () => ({ captureException: jest.fn() }));

const api = menstrualApi as unknown as Record<string, jest.Mock>;

type Control = ReturnType<typeof useMenstrualTab>;

const alert = jest.fn();

function Harness({ controlRef }: { controlRef: React.MutableRefObject<Control | null> }) {
  controlRef.current = useMenstrualTab({ alert, user: { id: "u1" }, setDayModal: jest.fn() });
  return null;
}

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toDateString(d);
};

async function load(cycles: CycleEntry[]) {
  api.getMenstrualHistory.mockResolvedValue({ data: cycles });
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} />);
  });
  await act(async () => {
    await controlRef.current!.loadMenstrualData();
  });
  return controlRef;
}

beforeEach(() => {
  jest.clearAllMocks();
  api.getSettings.mockResolvedValue({ data: { cycleLengthDays: 30, periodDays: 4 } });
  api.getCycleStats.mockResolvedValue({ data: null });
  api.updateMenstrualCycle.mockResolvedValue(undefined);
});

describe("useMenstrualTab", () => {
  it("marks each logged period across its days, using the server's period length for open cycles", async () => {
    const controlRef = await load([
      { id: 1, cycleStart: "2026-08-01", cycleEnd: "2026-08-02" } as CycleEntry,
      { id: 2, cycleStart: "2026-09-01" } as CycleEntry,
    ]);
    const { cycleActualDays, cycleEntries, menstrualPrefs } = controlRef.current!;

    expect(menstrualPrefs).toEqual({ cycleLengthDays: 30, periodLengthDays: 4 });
    expect(cycleEntries.map((c) => c.id)).toEqual([2, 1]);
    expect([...cycleActualDays].sort()).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
    expect(api.getCycleStats).toHaveBeenCalledWith({ periodDays: 4, cycleLengthDays: 30 });
  });

  it("is on a period only while the latest open cycle is within the period length", async () => {
    expect((await load([{ id: 1, cycleStart: daysAgo(2) } as CycleEntry])).current!.isOnPeriod).toBe(true);
    expect((await load([{ id: 1, cycleStart: daysAgo(6) } as CycleEntry])).current!.isOnPeriod).toBe(false);
    expect(
      (await load([{ id: 1, cycleStart: daysAgo(1), cycleEnd: daysAgo(0) } as CycleEntry])).current!
        .isOnPeriod,
    ).toBe(false);
  });

  it("ends the latest cycle today and reloads", async () => {
    const controlRef = await load([{ id: 7, cycleStart: daysAgo(1) } as CycleEntry]);
    await act(async () => {
      await controlRef.current!.markPeriodOver();
    });
    expect(api.updateMenstrualCycle).toHaveBeenCalledWith(7, { cycleEnd: daysAgo(0) });
    expect(api.getMenstrualHistory).toHaveBeenCalledTimes(2);
  });

  it("keeps the history when the settings call fails", async () => {
    api.getSettings.mockRejectedValue(new Error("offline"));
    const controlRef = await load([{ id: 1, cycleStart: "2026-09-01" } as CycleEntry]);
    expect(controlRef.current!.cycleEntries).toHaveLength(1);
    expect(controlRef.current!.menstrualPrefs).toEqual({ cycleLengthDays: 28, periodLengthDays: 5 });
  });
});
