import {
  authenticatedFetch,
  type AuthenticatedFetchOptions,
  type HttpFetch,
} from "./authenticatedFetch"
import { ApiError, messageForCode } from "./apiError"

export { ApiError }

/**
 * True only when the server answered and refused: a 4xx other than timeout or
 * rate limiting. A 5xx, 429 or proxy error page says the server is unwell, not
 * that the credential is bad, so it must not end the session.
 */
export const isCredentialRejection = (error: unknown): boolean =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  error.status !== 408 &&
  error.status !== 429

export async function parseApiResponse<T = unknown>(res: Response): Promise<T> {
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new ApiError(`Invalid JSON response (status ${res.status})`, res.status)
  }

  const body = (data && typeof data === "object" ? data : {}) as {
    success?: boolean
    error?: string
    message?: string
    details?: unknown
    code?: string
  }

  if (!res.ok || body.success === false) {
    const retryMs = parseRetryAfterMs(res)
    const message =
      messageForCode(body.code, retryMs) ||
      body.error ||
      body.message ||
      `Request failed (status ${res.status})`
    throw new ApiError(message, res.status, body.details, body.code, retryMs)
  }

  return data as T
}

export async function apiCall<T = unknown>(
  url: string,
  options?: AuthenticatedFetchOptions,
): Promise<T> {
  const res = await authenticatedFetch(url, options)
  return parseApiResponse<T>(res)
}

/** `Retry-After` in ms, from either delta-seconds or an HTTP date. */
export const parseRetryAfterMs = (response: Response): number | undefined => {
  const header = response.headers?.get?.("Retry-After")
  if (!header) return undefined
  const seconds = Number(header)
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - Date.now()
  return Number.isFinite(ms) && ms >= 0 ? ms : undefined
}

const MAX_AUTOMATIC_WAIT_MS = 30_000

const automaticWaitMs = (response: Response, fallbackMs: number): number =>
  Math.min(parseRetryAfterMs(response) ?? fallbackMs, MAX_AUTOMATIC_WAIT_MS)

export const IDEMPOTENCY_KEY_IN_FLIGHT = "IDEMPOTENCY_KEY_IN_FLIGHT"
const IN_FLIGHT_FALLBACK_MS = 2000
const MAX_IN_FLIGHT_RETRIES = 5

/** The body's `code`, read from a clone so the response can still be parsed. */
export const responseCode = async (response: Response): Promise<string | undefined> => {
  try {
    const source = typeof response.clone === "function" ? response.clone() : response
    const body = (await source.json()) as { code?: unknown } | null
    return typeof body?.code === "string" ? body.code : undefined
  } catch {
    return undefined
  }
}

/**
 * Sends a write with an `Idempotency-Key`. A 409 IDEMPOTENCY_KEY_IN_FLIGHT means
 * the server is still running an earlier attempt with this key, so the same key
 * is re-sent after `Retry-After` rather than treated as a failure.
 */
export async function fetchIdempotent(
  http: HttpFetch,
  url: string,
  init: AuthenticatedFetchOptions,
  idempotencyKey: string,
): Promise<Response> {
  const headers = {
    ...(init.headers as Record<string, string> | undefined),
    "Idempotency-Key": idempotencyKey,
  }
  for (let attempt = 0; ; attempt++) {
    const response = await http(url, { ...init, headers })
    if (response.status !== 409 || attempt >= MAX_IN_FLIGHT_RETRIES) return response
    if ((await responseCode(response)) !== IDEMPOTENCY_KEY_IN_FLIGHT) return response
    await new Promise((resolve) =>
      setTimeout(resolve, automaticWaitMs(response, IN_FLIGHT_FALLBACK_MS)),
    )
  }
}
