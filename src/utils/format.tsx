type DateInput = Date | string | number

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
export const toDateString = (input: Date | string): string => {
  const date = parseDate(input)
  // "NaN-NaN-NaN" would never match any day, so a corrupt timestamp would
  // silently zero a streak instead of being visible as bad data.
  if (!date) return "—"
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

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

/** Null when the stamp is missing or unparseable. An undated record has no
 * place on a timeline, and `new Date(undefined)` would silently read as now. */
export const parseDate = (
  value: string | number | Date | null | undefined,
): Date | null => {
  if (value === null || value === undefined || value === "") return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * A `decimal-pad` keyboard emits the device locale's decimal separator, which
 * is "," across most of Europe, and `Number.parseFloat("12,5")` returns 12 without
 * an error, logging a 12 kg set as 12 instead of 12.5.
 */
export const parseDecimal = (value: string): number => {
  const normalized = value.trim().replace(",", ".")
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN
  return Number(normalized)
}
