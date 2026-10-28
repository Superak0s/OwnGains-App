import { ApiError, ServerUnreachableError } from "./apiErrorClasses"
import { captureUnreported } from "./crashReporting"

export { ApiError, ServerUnreachableError }

export const OFFLINE_UNAVAILABLE_MESSAGE =
  "This needs a server. Switch to online mode in Settings to use it."

const waitPhrase = (retryAfterMs: number | undefined, fallback: string): string => {
  if (retryAfterMs == null) return fallback
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  if (seconds >= 120) return `in ${Math.ceil(seconds / 60)} minutes`
  return seconds === 1 ? "in 1 second" : `in ${seconds} seconds`
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
    // Only reaches an alert once the trainer has said no to removing the days.
    case "TRAINER_CONFIRM_REQUIRED":
      return "Nothing was saved. Your client's plan is unchanged."
    default:
      return null
  }
}

/**
 * Alert copy for a failed request. Server 4xx prose is shown as-is. Transport
 * and 5xx errors get plain wording, and anything else falls back.
 */
function apiErrorMessage(error: ApiError, fallback: string): string {
  const coded = messageForCode(error.code, error.retryAfterMs)
  if (coded) return coded
  if (error.status >= 500) return "The server had a problem. Try again in a moment."
  // A ValidationError's message is a generic "Validation failed". The reasons are in details.
  const reasons = error.status === 400 && Array.isArray(error.details) ? error.details : []
  if (reasons.length && reasons.every((d) => typeof d === "string")) return reasons.join("\n")
  if (error.status >= 400 && error.message) return error.message
  return fallback
}

export function userFacingError(error: unknown, fallback: string): string {
  // Every caller is a catch block that only shows this text, so this is
  // where those errors get reported.
  captureUnreported(error)
  if (error instanceof ServerUnreachableError) return error.message
  if (error instanceof ApiError) return apiErrorMessage(error, fallback)
  const message = error instanceof Error ? error.message : ""
  if (/network|fetch|timeout|abort|offline/i.test(message))
    return "Couldn't reach the server. Check your connection and try again."
  return fallback
}
