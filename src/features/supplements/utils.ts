import type { SupplementSummary } from "./types";

/** Half / default / double dose, deduped so a small default (1g → 1,1,2)
 * doesn't render duplicate buttons, and rounded to 2dp so sub-gram doses
 * don't collapse to 0. */
export const quickAmountsFor = (defaultAmount: number): number[] => [
  ...new Set(
    [defaultAmount * 0.5, defaultAmount, defaultAmount * 2]
      .map((n) => Math.round(n * 100) / 100)
      .filter((n) => n > 0),
  ),
];

export const parseTimeOfDay = (time: string | null | undefined): Date => {
  const d = new Date();
  d.setSeconds(0, 0);
  const [h, m] = (time ?? "").split(":").map(Number);
  if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
  return d;
};

export const MAX_DOSES_PER_DAY = 10;

type DoseState = Pick<
  SupplementSummary,
  "dosesPerDay" | "doseIntervalMinutes" | "dosesToday" | "lastTakenAt"
>;

export const allDosesTaken = (s: DoseState): boolean =>
  s.dosesToday >= s.dosesPerDay;

/** When the next dose opens up, or null if it already has (or none is left today). */
export const nextDoseAt = (s: DoseState, now: Date = new Date()): Date | null => {
  if (allDosesTaken(s) || !s.doseIntervalMinutes || !s.lastTakenAt) return null;
  const due = new Date(
    new Date(s.lastTakenAt).getTime() + s.doseIntervalMinutes * 60_000,
  );
  return due.getTime() > now.getTime() ? due : null;
};

export const formatCountdown = (ms: number): string => {
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
};

export const formatInterval = (minutes: number): string =>
  formatCountdown(minutes * 60_000);
