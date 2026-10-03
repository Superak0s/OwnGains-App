export const OFFLINE_UNAVAILABLE_MESSAGE =
  "This needs a server. Switch to online mode in Settings to use it."

export class ApiError extends Error {
  status: number
  details?: unknown
  /**
   * The server's machine-readable discriminator (METRIC_UNKNOWN,
   * VALUE_OUT_OF_RANGE, ...). Present on 4xx only. Branch on this rather than
   * pattern-matching `message`, which is prose and may be reworded.
   */
  code?: string
  /** From `Retry-After`, when the server sent one (429, 503). */
  retryAfterMs?: number
  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string,
    retryAfterMs?: number,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
    this.code = code
    this.retryAfterMs = retryAfterMs
  }
}

const waitPhrase = (retryAfterMs: number | undefined, fallback: string): string => {
  if (retryAfterMs == null) return fallback
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return seconds >= 120
    ? `in ${Math.ceil(seconds / 60)} minutes`
    : `in ${seconds} second${seconds === 1 ? "" : "s"}`
}

/** Copy for server codes whose prose alone doesn't tell the user what to do. */
export function messageForCode(
  code: string | undefined,
  retryAfterMs: number | undefined,
): string | null {
  switch (code) {
    case "AUTH_THROTTLED":
      return `Too many incorrect passwords. Try again ${waitPhrase(retryAfterMs, "later")}.`
    case "AUTH_BUSY":
    case "SERVICE_UNAVAILABLE":
    case "UPLOAD_BUSY":
      return `The server is busy. Try again ${waitPhrase(retryAfterMs, "in a moment")}.`
    case "ACCOUNT_DISABLED":
      return "This account has been suspended. Contact the server's administrator."
    case "ACCOUNT_UNAVAILABLE":
      return "That username or email is unavailable."
    case "CURRENT_PASSWORD_REQUIRED":
      return "Enter your current password to change your email."
    case "PHOTO_STORAGE_FULL":
      return "The server has run out of space for photos. Contact the server's administrator."
    case "IMAGE_TOO_LARGE":
      return "That photo is too large. Try a smaller image."
    case "PAYLOAD_TOO_LARGE":
      return "That is too large to send to the server."
    case "TOO_MANY_GRANTS":
      return "You're sharing with too many friends. Stop sharing with someone first."
    case "TOO_MANY_PENDING_REQUESTS":
      return "You have too many pending friend requests. Wait for some to be answered, or cancel a few."
    default:
      return null
  }
}

/**
 * Alert copy for a failed request. Server 4xx prose is shown as-is. Transport
 * and 5xx errors get plain wording, and anything else falls back.
 */
export function userFacingError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const coded = messageForCode(error.code, error.retryAfterMs)
    if (coded) return coded
    if (error.status >= 500) return "The server had a problem. Try again in a moment."
    if (error.status >= 400 && error.message) return error.message
    return fallback
  }
  const message = error instanceof Error ? error.message : ""
  if (/network|fetch|timeout|abort|offline/i.test(message))
    return "Couldn't reach the server. Check your connection and try again."
  return fallback
}
