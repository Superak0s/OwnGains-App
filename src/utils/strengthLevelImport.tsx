// Utility for importing workout history exported from Strength Level
// (https://strengthlevel.com) CSV files.
//
// Expected header:
// Date Lifted,Exercise,Weight (kg),Weight (lb),Reps,Bodyweight (kg),Bodyweight (lb),Percentile (%),Warmup

import { workoutApi } from "@features/workout/services/index"
import { userFacingError } from "@shared/services/apiError"

interface StrengthLevelRow {
  /** ISO calendar day, e.g. "2026-01-13". */
  date: string
  exercise: string
  weightKg: number
  reps: number
  isWarmup: boolean
}

export interface ImportResult {
  sessionsCreated: number
  setsImported: number
  skipped: number
  errors: string[]
}

/** Splits a CSV line into fields, respecting basic double-quote escaping. */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === "," && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }

  result.push(current)
  return result
}

/** Rows with missing required fields are silently skipped. */
function parseStrengthLevelCSV(csvText: string): StrengthLevelRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length < 2) return []

  const header = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase())

  const dateIdx = header.findIndex((h) => h.startsWith("date"))
  const exerciseIdx = header.indexOf("exercise")
  const weightKgIdx = header.findIndex((h) => h.includes("weight (kg)"))
  const repsIdx = header.indexOf("reps")
  const warmupIdx = header.indexOf("warmup")

  if (dateIdx === -1 || exerciseIdx === -1 || repsIdx === -1) {
    throw new Error(
      "Unrecognized CSV format. Expected columns 'Date Lifted', 'Exercise' and 'Reps'.",
    )
  }

  const rows: StrengthLevelRow[] = []

  // Trailing empty fields are sometimes dropped by the exporter, so only the
  // columns actually read below have to be present.
  const lastRequiredIdx = Math.max(dateIdx, exerciseIdx, repsIdx)

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i])
    if (cols.length <= lastRequiredIdx) continue

    const date = cols[dateIdx]?.trim()
    const exercise = cols[exerciseIdx]?.trim()
    const weightKgRaw = weightKgIdx === -1 ? "0" : cols[weightKgIdx]
    const weightKg = Number.parseFloat(weightKgRaw ?? "0")
    const reps = Number.parseInt(cols[repsIdx], 10)
    const warmupRaw = warmupIdx === -1 ? "0" : cols[warmupIdx]?.trim()
    const isWarmup = warmupRaw === "1" || warmupRaw?.toLowerCase() === "true"

    if (!date || !exercise || Number.isNaN(reps)) continue

    rows.push({
      date,
      exercise,
      weightKg: Number.isNaN(weightKg) ? 0 : weightKg,
      reps,
      isWarmup,
    })
  }

  return rows
}

function groupRowsByDate(
  rows: StrengthLevelRow[],
): [string, StrengthLevelRow[]][] {
  const byDate = new Map<string, StrengthLevelRow[]>()
  for (const row of rows) {
    const list = byDate.get(row.date)
    if (list) list.push(row)
    else byDate.set(row.date, [row])
  }
  return Array.from(byDate).sort(([a], [b]) => a.localeCompare(b))
}

/**
 * Replays one date's rows as one backdated session. Every failure is
 * recorded on `result` rather than thrown: one bad date must not abandon the
 * rest of the file.
 */
async function importDateGroup(
  split: string,
  date: string,
  dateRows: StrengthLevelRow[],
  result: ImportResult,
): Promise<void> {
  const baseTime = new Date(`${date}T12:00:00.000Z`).getTime()

  if (Number.isNaN(baseTime)) {
    result.errors.push(`Skipped invalid date: "${date}"`)
    result.skipped += dateRows.length
    return
  }

  let sessionId: number | string
  try {
    sessionId = await workoutApi.startSession(
      split,
      1,
      "Imported (Strength Level)",
      false,
      new Date(baseTime).toISOString(),
    )
  } catch (err) {
    result.errors.push(
      `Failed to create session for ${date}: ${userFacingError(err, "unknown error")}`,
    )
    result.skipped += dateRows.length
    return
  }

  // Track per-exercise set numbering within this session, and space out
  // timestamps by a minute per set since the source file has no times.
  const exerciseSetCounts = new Map<string, number>()
  let offsetSeconds = 0
  let lastEndTime = new Date(baseTime).toISOString()

  for (const row of dateRows) {
    const setIndex = (exerciseSetCounts.get(row.exercise) ?? 0) + 1
    exerciseSetCounts.set(row.exercise, setIndex)

    const startTime = new Date(baseTime + offsetSeconds * 1000).toISOString()
    offsetSeconds += 60
    const endTime = new Date(baseTime + offsetSeconds * 1000).toISOString()
    lastEndTime = endTime

    try {
      await workoutApi.recordSet(sessionId, {
        exerciseName: row.exercise,
        setIndex,
        startTime,
        endTime,
        weight: row.weightKg,
        reps: row.reps,
        note: "Imported from Strength Level",
        isWarmup: row.isWarmup,
      })
      result.setsImported += 1
    } catch (err) {
      result.errors.push(
        `Failed to import set (${row.exercise} on ${date}): ${userFacingError(err, "unknown error")}`,
      )
      result.skipped += 1
    }
  }

  try {
    await workoutApi.endSession(sessionId, lastEndTime)
    result.sessionsCreated += 1
  } catch (err) {
    result.errors.push(
      `Failed to close imported session for ${date}: ${userFacingError(err, "unknown error")}`,
    )
  }
}

/**
 * Imports Strength Level CSV history for a given split by replaying it
 * through the existing session APIs. One backdated session is created per
 * distinct date in the file, with one recorded set per row.
 */
export async function importStrengthLevelCSV(
  csvText: string,
  split: string,
): Promise<ImportResult> {
  const rows = parseStrengthLevelCSV(csvText)

  const result: ImportResult = {
    sessionsCreated: 0,
    setsImported: 0,
    skipped: 0,
    errors: [],
  }

  if (rows.length === 0) {
    result.errors.push("No valid rows found in the file.")
    return result
  }

  for (const [date, dateRows] of groupRowsByDate(rows)) {
    await importDateGroup(split, date, dateRows, result)
  }

  return result
}
