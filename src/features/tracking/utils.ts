import type { MenstrualEntry } from "./services/types";
import type { SorenessEntry, SorenessFollowUp } from "./types/muscleRecovery";
import type { BodyFatEntryWithFields } from "./types";
import { toDateString, formatDate, parseDate } from "@utils/format";
import type { ChartPoint } from "@shared/components/chart/chartMath";

export function isoToLocalDateStr(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  return toDateString(d);
}

export function formatDateLabel(isoStr: string | null | undefined): string {
  const date = parseDate(isoStr);
  return date ? formatDate(date) : "Unknown date";
}

export function buildLocalISOForDate(date: Date, timeStr = "09:00"): string {
  const dateStr = toDateString(date);
  return `${dateStr}T${timeStr}:00`;
}

const MONTHS_TO_PREDICT = 12;

// cycleEnd is the last day of the period, so the duration counts both ends.
export function getCycleDuration(entry: MenstrualEntry, fallback: number = 5): number {
  const start = parseDate(entry.cycleStart)?.getTime();
  const end = parseDate(entry.cycleEnd)?.getTime();
  if (start == null || end == null) return fallback;
  const days = Math.round((end - start) / 86400000) + 1;
  return days > 0 ? days : fallback;
}

type CyclePhaseInfo = {
  phase: "Menstrual" | "Follicular" | "Ovulation" | "Luteal";
  dayOfCycle: number;
  cycleLength: number;
  periodEnd: number;
  ovulationStart: number;
  ovulationEnd: number;
};

export function getCyclePhaseInfo(
  daysSinceStart: number,
  periodLengthDays: number,
  cycleLengthDays: number,
): CyclePhaseInfo {
  const cLen = cycleLengthDays > 0 ? cycleLengthDays : 28;
  const pLen = Math.min(periodLengthDays || 5, cLen - 1);
  const dayOfCycle = (daysSinceStart % cLen) + 1;
  const ovulationDay = Math.max(pLen + 1, cLen - 14);
  const ovulationStart = ovulationDay - 1;
  const ovulationEnd = ovulationDay + 1;

  let phase: CyclePhaseInfo["phase"] = "Luteal";
  if (dayOfCycle <= pLen) phase = "Menstrual";
  else if (dayOfCycle < ovulationStart) phase = "Follicular";
  else if (dayOfCycle <= ovulationEnd) phase = "Ovulation";

  return { phase, dayOfCycle, cycleLength: cLen, periodEnd: pLen, ovulationStart, ovulationEnd };
}

export function daysSinceLocal(start: Date, today: Date = new Date()): number {
  const from = new Date(start);
  from.setHours(0, 0, 0, 0);
  const to = new Date(today);
  to.setHours(0, 0, 0, 0);
  // rounded, not floored: DST shifts make a calendar day 23 or 25 hours long
  return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

export function getCyclePhaseLabel(
  startIso: string | null,
  periodLengthDays: number,
  cycleLengthDays: number,
): string | null {
  const start = parseDate(startIso);
  if (!start) return null;

  const diffDays = daysSinceLocal(start);
  if (diffDays < 0) return null;

  return getCyclePhaseInfo(diffDays, periodLengthDays, cycleLengthDays).phase;
}

export function computeUpcomingPredictedDays(
  lastCycleStartIso: string | null,
  cycleLengthDays: number,
  periodLengthDays: number,
): Set<string> {
  const predicted = new Set<string>();
  const start = parseDate(lastCycleStartIso);
  if (!start) return predicted;

  const cLen = cycleLengthDays > 0 ? cycleLengthDays : 28;
  const pLen = periodLengthDays || 5;

  const daysToCover = MONTHS_TO_PREDICT * 30;
  const cyclesAhead = Math.max(1, Math.ceil(daysToCover / cLen));

  for (let i = 1; i <= cyclesAhead; i++) {
    const cycleStart = new Date(start);
    cycleStart.setDate(cycleStart.getDate() + cLen * i);
    for (let d = 0; d < pLen; d++) {
      const day = new Date(cycleStart);
      day.setDate(day.getDate() + d);
      predicted.add(toDateString(day));
    }
  }

  return predicted;
}

export function maskTimeInput(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidTime(text: string): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(text);
  if (!match) return false;
  return Number(match[1]) < 24 && Number(match[2]) < 60;
}

export function toNumberOrUndefined(value: string): number | undefined {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : undefined;
}

export function toFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  return {
    feet: Math.floor(totalInches / 12),
    inches: Math.round(totalInches % 12),
  };
}

export const hasTapeMeasurements = (entry: BodyFatEntryWithFields): boolean =>
  entry.measurements?.waist != null || entry.waistCm != null;

export interface TrendPoint {
  at: string | null | undefined;
  value: number;
}

export function toTrendPoints(points: TrendPoint[]): ChartPoint[] {
  return points
    .map((p) => ({ date: parseDate(p.at), value: p.value }))
    .filter((p): p is ChartPoint => p.date !== null && Number.isFinite(p.value))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** One point per calendar day from the first entry (at least a week back) to today, empty days as 0. */
export function toDailyTotalPoints(
  points: TrendPoint[],
  today: Date = new Date(),
): ChartPoint[] {
  const totals = new Map<string, number>();
  for (const p of points) {
    const day = isoToLocalDateStr(p.at);
    if (day && Number.isFinite(p.value)) totals.set(day, (totals.get(day) ?? 0) + p.value);
  }
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  const first = [...totals.keys()].sort()[0];
  if (first) {
    const [y, m, d] = first.split("-").map(Number);
    const firstDay = new Date(y, m - 1, d);
    if (firstDay < start) start.setTime(firstDay.getTime());
  }
  const result: ChartPoint[] = [];
  for (const d = new Date(start); toDateString(d) <= toDateString(today); d.setDate(d.getDate() + 1)) {
    result.push({ date: new Date(d), value: totals.get(toDateString(d)) ?? 0 });
  }
  return result;
}

/** Days between consecutive cycle starts, oldest cycle first. */
export function cycleLengthPoints(entries: MenstrualEntry[]): TrendPoint[] {
  const starts = entries
    .map((e) => parseDate(e.cycleStart))
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return starts.slice(1).map((start, i) => ({
    at: start.toISOString(),
    value: Math.round((start.getTime() - starts[i].getTime()) / 86_400_000),
  }));
}

export const formatRange = (min: number, max: number): string | undefined => {
  const low = min.toFixed(0);
  const high = max.toFixed(0);
  return low === high ? undefined : `${low}-${high}`;
};

export const followUpStatus = (
  previous: number,
  intensity: number,
): SorenessFollowUp["status"] => {
  if (intensity === 0) return "recovered";
  return intensity < previous ? "better" : "still_sore";
};

/** A sore muscle is due a check-in once per day, starting the day after it was logged or last updated. */
export const needsFollowUp = (
  entry: SorenessEntry,
  today: Date = new Date(),
): boolean =>
  entry.status !== "recovered" &&
  isoToLocalDateStr(entry.updatedAt) < toDateString(today);
