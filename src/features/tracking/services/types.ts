export type ApiResponse<T> = {
  success: boolean;
  data: T;
  error?: string;
};

export { type SorenessEntry } from "../types/muscleRecovery";

export interface HydrationEntry {
  id: number;
  amountMl: number;
  loggedAt: string;
  note?: string | null;
  createdAt: string;
}

export interface MeasurementEntry {
  id: number;
  waistCm?: number | null;
  armLeftCm?: number | null;
  armRightCm?: number | null;
  chestCm?: number | null;
  measuredAt: string;
  note?: string | null;
  createdAt: string;
}

export interface MenstrualEntry {
  id: number;
  cycleStart: string;
  cycleEnd?: string | null;
  symptoms?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CyclePhase {
  phase: "menstruation" | "follicular" | "ovulation" | "luteal";
  daysInPhase: number;
  estimatedEnd: string;
}

export interface CycleStats {
  currentPhase: CyclePhase | null;
  averageCycleLength: number;
  nextPeriodEstimate: string | null;
  lastCycleEntry: MenstrualEntry | null;
}

export interface MenstrualPrefs {
  cycleLengthDays: number;
  periodLengthDays: number;
}

export interface HydrationSettings {
  goalMl: number;
  measurementErrorPercent: number;
}

/** Shared by on/ and off/ so an unset server row falls back to the same values. */
export const DEFAULT_HYDRATION_SETTINGS: HydrationSettings = {
  goalMl: 2500,
  measurementErrorPercent: 5,
};

export interface HydrationPreset {
  label: string;
  ml: number;
}

export const DEFAULT_HYDRATION_PRESETS: HydrationPreset[] = [
  { label: "Small glass", ml: 250 },
  { label: "Regular glass", ml: 500 },
  { label: "Water bottle", ml: 750 },
  { label: "Large bottle", ml: 1000 },
];
