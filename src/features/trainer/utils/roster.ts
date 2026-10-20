import type { SessionRecord } from "@features/friends/types"
import type { ClientSummary } from "../types"

export const INACTIVE_AFTER_DAYS = 7
export const MAX_WEEKLY_TARGET = 7

const DAY_MS = 86_400_000

export type ClientStatus = "inactive" | "behind" | "on_track"

export function weekStart(now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  return start
}

export function toDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function weeklyTarget(dayCount: number | null): number | null {
  return dayCount ? Math.min(dayCount, MAX_WEEKLY_TARGET) : null
}

const daysElapsedBeforeToday = (now: Date): number => (now.getDay() + 6) % 7

/** Sessions due so far this week. Only full days count, so nobody is behind on Monday morning. */
export function expectedByToday(target: number, now: Date): number {
  return Math.ceil((target * daysElapsedBeforeToday(now)) / 7)
}

const lastWorkoutMs = (c: ClientSummary): number | null =>
  c.lastWorkoutAt ? new Date(c.lastWorkoutAt).getTime() : null

export function clientStatus(c: ClientSummary, now: Date): ClientStatus {
  const last = lastWorkoutMs(c)
  if (last === null || now.getTime() - last > INACTIVE_AFTER_DAYS * DAY_MS) return "inactive"
  const target = weeklyTarget(c.activeProgramDayCount)
  if (target !== null && c.sessionsThisWeek < expectedByToday(target, now)) return "behind"
  return "on_track"
}

export function groupRoster(
  clients: ClientSummary[],
  now: Date,
): { attention: ClientSummary[]; onTrack: ClientSummary[] } {
  const sorted = [...clients].sort((a, b) => (lastWorkoutMs(a) ?? -Infinity) - (lastWorkoutMs(b) ?? -Infinity))
  return {
    attention: sorted.filter((c) => clientStatus(c, now) !== "on_track"),
    onTrack: sorted.filter((c) => clientStatus(c, now) === "on_track"),
  }
}


export function sessionOrigin(s: SessionRecord, trainerId: string): "with_you" | "on_their_own" {
  return s.loggedByTrainerId != null && String(s.loggedByTrainerId) === trainerId ? "with_you" : "on_their_own"
}
