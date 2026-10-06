import {
  createRecordStore,
  readJSON,
  writeJSON,
  nextLocalId,
} from "@shared/services/offlineHelpers";
import { getCyclePhaseInfo } from "@features/tracking/utils";
import type {
  ApiResponse,
  MenstrualEntry,
  CycleStats,
  CyclePhase,
} from "../types";
import type { MenstrualSettings } from "../../types";

const HISTORY_KEY = "@off_menstrual_history";
const SETTINGS_KEY = "@off_menstrual_settings";
const DEFAULT_SETTINGS: MenstrualSettings = {
  periodDays: 5,
  cycleLengthDays: 28,
};

const store = createRecordStore<MenstrualEntry>(
  "menstrual_entries",
  HISTORY_KEY,
  (e) => e.id,
  (e) => e.cycleStart,
);

const readSettings = () =>
  readJSON<MenstrualSettings>(SETTINGS_KEY, DEFAULT_SETTINGS);

const PHASE_MAP = {
  Menstrual: "menstruation",
  Follicular: "follicular",
  Ovulation: "ovulation",
  Luteal: "luteal",
} as const;

function computePhase(
  lastEntry: MenstrualEntry | null,
  settings: MenstrualSettings,
): CyclePhase | null {
  if (!lastEntry) return null;
  const start = new Date(lastEntry.cycleStart).getTime();
  const now = Date.now();
  const daysSinceStart = Math.floor((now - start) / (24 * 60 * 60 * 1000));

  const { periodDays, cycleLengthDays } = settings;
  const info = getCyclePhaseInfo(daysSinceStart, periodDays, cycleLengthDays);
  const cycleStart = start - (info.dayOfCycle - 1) * 24 * 60 * 60 * 1000;
  const phaseEndDay = {
    Menstrual: info.periodEnd,
    Follicular: info.ovulationStart,
    Ovulation: info.ovulationEnd,
    Luteal: info.cycleLength,
  }[info.phase];

  return {
    phase: PHASE_MAP[info.phase],
    daysInPhase: phaseEndDay - info.dayOfCycle + 1,
    estimatedEnd: new Date(
      cycleStart + phaseEndDay * 24 * 60 * 60 * 1000,
    ).toISOString(),
  };
}

export const menstrualApi = {
  logMenstrualCycle: async (
    cycleStart: Date | string,
    symptoms?: string[],
  ): Promise<ApiResponse<MenstrualEntry>> => {
    const startStr =
      cycleStart instanceof Date ? cycleStart.toISOString() : cycleStart;
    const entry: MenstrualEntry = {
      id: nextLocalId(),
      cycleStart: startStr,
      cycleEnd: null,
      symptoms: symptoms || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.put(entry);
    return { success: true, data: entry };
  },

  updateMenstrualCycle: async (
    id: number,
    updates: { cycleEnd?: string | null; symptoms?: string[] },
  ): Promise<ApiResponse<MenstrualEntry>> => {
    const entry = await store.getOne(id);
    if (!entry) throw new Error("Menstrual entry not found");
    const updated: MenstrualEntry = {
      ...entry,
      ...(updates.cycleEnd !== undefined && { cycleEnd: updates.cycleEnd }),
      ...(updates.symptoms !== undefined && { symptoms: updates.symptoms }),
      updatedAt: new Date().toISOString(),
    };
    await store.put(updated);
    return { success: true, data: updated };
  },

  getMenstrualHistory: async (
    limit: number = 12,
  ): Promise<ApiResponse<MenstrualEntry[]>> => {
    const data = await store.getRecent(limit);
    return { success: true, data };
  },

  getCycleStats: async (
    settingsOverride?: MenstrualSettings,
  ): Promise<ApiResponse<CycleStats>> => {
    const history = await store.getAll();
    const settings = settingsOverride ?? (await readSettings());

    const sorted = [...history].sort(
      (a, b) =>
        new Date(b.cycleStart).getTime() - new Date(a.cycleStart).getTime(),
    );
    const lastEntry = sorted[0] || null;

    let avgCycleLength = settings.cycleLengthDays;
    if (sorted.length >= 2) {
      const diffs: number[] = [];
      for (let i = 0; i < sorted.length - 1; i++) {
        const curr = new Date(sorted[i].cycleStart).getTime();
        const next = new Date(sorted[i + 1].cycleStart).getTime();
        const diff = Math.round((curr - next) / (24 * 60 * 60 * 1000));
        if (diff > 0) diffs.push(diff);
      }
      if (diffs.length > 0) {
        avgCycleLength = Math.round(
          diffs.reduce((a, b) => a + b, 0) / diffs.length,
        );
      }
    }

    const currentPhase = computePhase(lastEntry, settings);
    const nextEstimate = lastEntry
      ? new Date(
          new Date(lastEntry.cycleStart).getTime() +
            avgCycleLength * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

    return {
      success: true,
      data: {
        currentPhase,
        averageCycleLength: avgCycleLength,
        nextPeriodEstimate: nextEstimate,
        lastCycleEntry: lastEntry,
      },
    };
  },

  deleteMenstrualEntry: async (id: number): Promise<ApiResponse<null>> => {
    await store.remove(id);
    return { success: true, data: null };
  },

  getSettings: async (): Promise<
    ApiResponse<{ periodDays: number; cycleLengthDays: number }>
  > => {
    const settings = await readSettings();
    return {
      success: true,
      data: {
        periodDays: settings.periodDays,
        cycleLengthDays: settings.cycleLengthDays,
      },
    };
  },

  setSettings: async (
    periodDays?: number,
    cycleLengthDays?: number,
  ): Promise<ApiResponse<null>> => {
    const current = await readSettings();
    const updated: MenstrualSettings = {
      periodDays: periodDays ?? current.periodDays,
      cycleLengthDays: cycleLengthDays ?? current.cycleLengthDays,
    };
    await writeJSON(SETTINGS_KEY, updated);
    return { success: true, data: null };
  },
};
