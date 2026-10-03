import type { SetTiming } from "@shared/types"
import { estimateOneRepMax } from "./oneRepMax"

/** Matches the longest row of the analytics rep-max table. */
export const RECORD_REP_LIMIT = 12

interface SessionWithTimings {
  id: string | number
  setTimings?: SetTiming[]
}

/**
 * Every set that is a record for its exercise and machine: heaviest,
 * lightest (assisted lifts count less assistance as more load), most reps,
 * best estimated 1RM, and heaviest and lightest per rep count up to
 * RECORD_REP_LIMIT. A maximum over the recent sessions plus these is an
 * all-time maximum.
 */
export function pickRecordSessions<T extends SessionWithTimings>(
  sessions: T[],
): T[] {
  const best = new Map<string, { set: SetTiming; value: number }>()
  const consider = (key: string, set: SetTiming, value: number) => {
    const current = best.get(key)
    if (!current || value > current.value) best.set(key, { set, value })
  }

  for (const session of sessions) {
    for (const set of session.setTimings ?? []) {
      const reps = set.reps ?? 0
      const weight = set.weight ?? 0
      if (set.isWarmup || reps < 1 || !Number.isFinite(weight)) continue
      const group = `${set.exerciseName ?? ""}\u0000${set.machineName ?? ""}`
      consider(`${group}|heaviest`, set, weight)
      consider(`${group}|lightest`, set, -weight)
      consider(`${group}|reps`, set, reps)
      consider(`${group}|e1rm`, set, estimateOneRepMax(weight, reps))
      if (reps <= RECORD_REP_LIMIT) {
        consider(`${group}|heaviest@${reps}`, set, weight)
        consider(`${group}|lightest@${reps}`, set, -weight)
      }
    }
  }

  const keep = new Set([...best.values()].map((entry) => entry.set))
  return sessions.flatMap((session) => {
    const setTimings = (session.setTimings ?? []).filter((set) => keep.has(set))
    return setTimings.length ? [{ ...session, setTimings }] : []
  })
}

/** Record sessions the recent window doesn't already hold in full. */
export function recordSessionsOutside<T extends SessionWithTimings>(
  window: SessionWithTimings[],
  records: T[] | null,
): T[] {
  if (!records?.length) return []
  const seen = new Set(window.map((session) => String(session.id)))
  return records.filter((session) => !seen.has(String(session.id)))
}
