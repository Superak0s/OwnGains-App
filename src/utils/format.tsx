type DateInput = Date | string | number

export const DAY_MS = 86_400_000

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
}

const DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTIONS,
  hour: "numeric",
  minute: "2-digit",
}

const CLOCK_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  hour: "numeric",
  minute: "2-digit",
}

// An undefined locale is the device's, so month order and 12/24h follow the user.
export const formatDate = (
  input: DateInput,
  options: Intl.DateTimeFormatOptions = DATE_OPTIONS,
): string => parseDate(input)?.toLocaleDateString(undefined, options) ?? "—"

export const formatDateTime = (
  input: DateInput,
  options: Intl.DateTimeFormatOptions = DATE_TIME_OPTIONS,
): string => parseDate(input)?.toLocaleString(undefined, options) ?? "—"

export const formatClockTime = (
  input: DateInput,
  options: Intl.DateTimeFormatOptions = CLOCK_TIME_OPTIONS,
): string => parseDate(input)?.toLocaleTimeString(undefined, options) ?? "—"

// Not cryptographically strong. For client-side entities that are later
// reconciled with the server.
export const generateId = (prefix = "local"): string => {
  const core = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return `${prefix}_${core}`
}

/**
 * Local calendar day as YYYY-MM-DD. Built from date components rather than a
 * locale format: day-level comparisons and streaks across the app depend
 * on this exact format, and a Hermes build without full ICU would change it.
 */
export const toDateString = (input: DateInput): string => {
  const date = parseDate(input)
  // "NaN-NaN-NaN" would never match any day, so a corrupt timestamp would
  // silently zero a streak instead of being visible as bad data.
  if (!date) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of a `YYYY-MM-DD` day. `new Date("YYYY-MM-DD")` would be UTC midnight. */
export const fromDateString = (day: string): Date => {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}

export function startOfToday(): Date {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

export function daysSinceLocal(start: Date, today: Date = new Date()): number {
  const from = new Date(start)
  from.setHours(0, 0, 0, 0)
  const to = new Date(today)
  to.setHours(0, 0, 0, 0)
  // rounded, not floored: DST shifts make a calendar day 23 or 25 hours long
  return Math.round((to.getTime() - from.getTime()) / DAY_MS)
}

export const toTimeString = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`

/**
 * A back-dated entry's timestamp as UTC ISO, so it sorts and compares against
 * `new Date().toISOString()` stamps written for "now". A naive local string
 * like "2026-01-01T09:00:00" mixed into the same field is offset from those by
 * the device's UTC offset, which breaks day bucketing and history ordering.
 */
export const backdatedToIso = (date: string, time?: string | null): string => {
  const parsed = parseDate(`${date}T${time?.slice(0, 5) ?? "12:00"}:00`)
  return (parsed ?? new Date()).toISOString()
}

// The server returns MySQL DATETIMEs as zone-less UTC ("2026-09-08 22:45:33"),
// which `new Date` would read as local time.
const SERVER_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/

/**
 * A copy of server JSON with every zone-less server datetime rewritten as UTC ISO,
 * so readers that call `new Date` directly get the right instant.
 *
 * @remarks Only a string that is wholly a datetime is rewritten, so free text that
 * merely contains one is kept as typed.
 */
export const normalizeServerDates = (value: unknown): unknown => {
  if (typeof value === "string")
    return SERVER_DATETIME.test(value) ? `${value.replace(" ", "T")}Z` : value
  if (Array.isArray(value)) return value.map(normalizeServerDates)
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, normalizeServerDates(v)]),
    )
  return value
}

/** Null when the stamp is missing or unparseable. An undated record has no
 * place on a timeline, and `new Date(undefined)` would silently read as now. */
export const parseDate = (
  value: string | number | Date | null | undefined,
): Date | null => {
  if (value === null || value === undefined || value === "") return null
  const date = new Date(
    typeof value === "string" && SERVER_DATETIME.test(value)
      ? `${value.replace(" ", "T")}Z`
      : value,
  )
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A timestamp sort key as UTC ISO, so keys written with different offsets order
 * by instant. A value that is not a dated stamp is returned unchanged.
 *
 * @remarks The date prefix guard matters because V8 parses strings like "5" as dates.
 */
export const sortableStamp = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value
  return parseDate(value)?.toISOString() ?? value
}

/**
 * Parses decimal-pad input, or returns null when it is not a plain non-negative number.
 *
 * @remarks The keyboard emits the device locale's decimal separator, which is "," across
 * most of Europe, and `Number.parseFloat("12,5")` returns 12 without an error, logging a
 * 12.5 kg set as 12.
 */
export const parseDecimal = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".")
  if (!/^(\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}
