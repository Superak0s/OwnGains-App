import type { CycleEntry } from "./services/types";
import { toDateString, formatDate } from "@utils/format";

export function isoToLocalDateStr(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "";
  return toDateString(d);
}

export function parseSafeDate(isoStr: string | null | undefined): Date | null {
  if (!isoStr) return null;
  const date = new Date(isoStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateLabel(isoStr: string | null | undefined): string {
  const date = parseSafeDate(isoStr);
  return date ? formatDate(date) : "Unknown date";
}

export function buildLocalISOForDate(date: Date, timeStr = "09:00"): string {
  const dateStr = toDateString(date);
  return `${dateStr}T${timeStr}:00`;
}

const MONTHS_TO_PREDICT = 12;

export function getCycleStartIso(entry: CycleEntry): string | null {
  return entry.cycleStart ?? null;
}

// cycleEnd is the last day of the period, so the duration counts both ends.
export function getCycleDuration(entry: CycleEntry, fallback: number = 5): number {
  const start = parseSafeDate(entry.cycleStart)?.getTime();
  const end = parseSafeDate(entry.cycleEnd)?.getTime();
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
  const start = parseSafeDate(startIso);
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
  const start = parseSafeDate(lastCycleStartIso);
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
