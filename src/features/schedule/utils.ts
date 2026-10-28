import type { ScheduledWorkout } from "./types";
import { toTimeString } from "@utils/format";

/** Entries that have not finished yet, soonest first. */
export const upcomingEntries = (
  entries: ScheduledWorkout[],
  now: number,
): ScheduledWorkout[] =>
  entries
    .filter((e) => new Date(e.startAt).getTime() + e.durationMin * 60_000 > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));

export const entriesOnDay = (
  entries: ScheduledWorkout[],
  day: Date,
): ScheduledWorkout[] =>
  entries.filter(
    (e) => new Date(e.startAt).toDateString() === day.toDateString(),
  );

/** A pending entry outranks the rest, and a day is cancelled only when nothing on it still stands. */
export const dayStatus = (
  entries: ScheduledWorkout[],
  day: Date,
): "pending" | "cancelled" | null => {
  const onDay = entriesOnDay(entries, day);
  if (onDay.some((e) => e.status === "pending")) return "pending";
  if (onDay.length > 0 && onDay.every((e) => e.status === "cancelled")) return "cancelled";
  return null;
};

const SLOT_MS = 5 * 60_000;

/** Moves a time that is not after `now` to the next 5-minute slot, and leaves later times as they are. */
export const notInPast = (date: Date, now: number): Date =>
  date.getTime() > now
    ? date
    : new Date(Math.ceil((now + 1) / SLOT_MS) * SLOT_MS);

export const formatDay = (date: Date): string =>
  date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const formatWhen = (iso: string): string =>
  `${formatDay(new Date(iso))}, ${toTimeString(new Date(iso))}`;

export const MAX_REMINDER_MINUTES = 7 * 1440;

export const REMINDER_UNITS = [
  { label: "min", minutes: 1 },
  { label: "hours", minutes: 60 },
  { label: "days", minutes: 1440 },
];

/** Splits a reminder into the largest unit that divides it evenly, for editing as an amount and a unit. */
export const splitReminder = (
  minutes: number,
): { amount: number; unit: number } => {
  const unit = [1440, 60].find((u) => minutes > 0 && minutes % u === 0) ?? 1;
  return { amount: minutes / unit, unit };
};
