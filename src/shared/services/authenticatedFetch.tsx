import { refreshTokenStorage, tokenStorage } from "./tokenStorage"
import { assertSecureTransport, getServerUrl } from "./config"
import { metric, log, trackBreadcrumb } from "./crashReporting"
import { ApiError, ServerUnreachableError } from "./apiError"

const DEFAULT_TIMEOUT_MS = 15000
const RETRY_BASE_MS = 300

// Sentry attributes are low-cardinality by design: an id per path segment
// would make every request its own series, so ids collapse to ":id". Split and
// muscle names are user content (an injured muscle is health data).
const NAMED_SEGMENT_PARENTS = new Set(["split", "muscle", "group"])

export const routeOf = (url: string): string =>
  url
    .replace(/^https?:\/\/[^/]+/i, "")
    .split("?")[0]
    .split("/")
    .map((segment, i, all) => {
      if (/^\d+$|^local_|^[0-9a-f-]{16,}$/i.test(segment)) return ":id"
      if (NAMED_SEGMENT_PARENTS.has(all[i - 1]) && !NAMED_SEGMENT_PARENTS.has(segment))
        return ":name"
      return segment
    })
    .join("/") || "/"

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  attempts: number,
  method: string,
  route: string,
  timeoutMs: number,
): Promise<Response> => {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController()
    const callerSignal = init.signal
    const forward = (): void => controller.abort()
    if (callerSignal?.aborted) controller.abort()
    else callerSignal?.addEventListener("abort", forward)
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } catch (error) {
      if ((error as Error).name === "AbortError" && callerSignal?.aborted) {
        throw error
      }
      if ((error as Error).name === "AbortError") {
        log.warn("api.timeout", { method, route, timeoutMs })
        throw new ServerUnreachableError()
      }
      if (attempt === attempts - 1) {
        log.warn("api.transport_error", {
          method,
          route,
          reason: (error as Error).message,
        })
        throw new ServerUnreachableError()
      }
      log.warn("api.retry", { method, route })
      console.debug(`[API] Retrying after transport error: ${url}`)
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_BASE_MS + Math.random() * RETRY_BASE_MS),
      )
    } finally {
      clearTimeout(timeoutHandle)
      callerSignal?.removeEventListener("abort", forward)
    }
  }
  throw new Error(`Request failed after ${attempts} attempts`)
}

export interface AuthenticatedFetchOptions extends RequestInit {
  /** Overrides the 15s default, since uploads need longer than an API call. */
  timeoutMs?: number
}

export type HttpFetch = (
  url: string,
  options?: AuthenticatedFetchOptions,
) => Promise<Response>

export type SessionRefreshResult = "refreshed" | "rejected" | "unreachable"

let sessionRefresher: (() => Promise<SessionRefreshResult>) | null = null

/** AuthContext runs the refresh (dedup, logout on rejection). This module only requests one. */
export const setSessionRefresher = (
  refresher: (() => Promise<SessionRefreshResult>) | null,
): void => {
  sessionRefresher = refresher
}

// Signing out while the refresh token is being rejected must not ask for yet
// another refresh: the rejection path is what triggered the sign-out.
const SIGNOUT_ROUTE = "/api/auth/signout"

export const authenticatedFetch = (
  url: string,
  options: AuthenticatedFetchOptions = {},
): Promise<Response> => fetchAuthenticated(url, options, true)

const originOf = (url: string): string =>
  /^(https?:\/\/[^/?#]+)/i.exec(url)?.[1].toLowerCase() ?? ""

const fetchAuthenticated = async (
  url: string,
  options: AuthenticatedFetchOptions,
  mayRefresh: boolean,
): Promise<Response> => {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const resolvedUrl = /^https?:\/\//i.test(url)
    ? url
    : `${getServerUrl()}${url}`

  assertSecureTransport(resolvedUrl)

  console.debug(`[API] Calling: ${resolvedUrl}`)
  const toOwnServer = originOf(resolvedUrl) === originOf(getServerUrl())
  const token = toOwnServer ? await tokenStorage.get() : null

  // A multipart body sets its own Content-Type boundary. Forcing JSON here
  // would make the server unable to parse it.
  const isMultipart = init.body instanceof FormData
  const headers: Record<string, string> = {
    ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(init.headers as Record<string, string>),
  }

  const method = (init.method ?? "GET").toUpperCase()
  const attempts = method === "GET" || method === "HEAD" ? 2 : 1
  const route = routeOf(resolvedUrl)
  const startedAt = Date.now()
  const response = await fetchWithRetry(
    resolvedUrl,
    { ...init, headers },
    attempts,
    method,
    route,
    timeoutMs,
  )

  const durationMs = Date.now() - startedAt
  const status = response.status
  metric.distribution("api.request.duration", durationMs, {
    unit: "millisecond",
    attributes: { method, route, status, outcome: response.ok ? "ok" : "http_error" },
  })
  trackBreadcrumb("api", `${method} ${route}`, { status, durationMs })
  if (!response.ok) {
    log.warn("api.http_error", { method, route, status, durationMs })
  }

  // Login, registration and refresh use raw fetch, so a 401 here can only mean
  // the bearer token itself was rejected, regardless of the message body.
  if (status === 401 && toOwnServer) {
    const hasRefreshToken = !!(await refreshTokenStorage.get())
    // A session without a refresh token still refreshes with its bearer, and a
    // refusal there is what logs it out instead of failing every request.
    if (mayRefresh && (hasRefreshToken || token) && route !== SIGNOUT_ROUTE) {
      const current = await tokenStorage.get()
      // Another request may already have refreshed while this one was in flight.
      const outcome =
        current && current !== token
          ? "refreshed"
          : await (sessionRefresher?.() ?? Promise.resolve("rejected" as const))
      if (outcome === "refreshed") return fetchAuthenticated(url, options, false)
      if (outcome === "unreachable") {
        throw new ServerUnreachableError()
      }
    }
    console.warn("Token rejected, clearing access token")
    log.warn("auth.token_rejected", { method, route })
    metric.count("auth.session_expired")
    // Only safe to drop while a separate refresh credential exists. Until the
    // server issues one, the access token is its own refresh credential, so
    // clearing it here would turn a routine expiry into a forced logout.
    if (hasRefreshToken) await tokenStorage.clearAccess()
    // Must be an ApiError: isCredentialRejection() keys off it to tell a
    // rejected credential from an unreachable server.
    throw new ApiError("SESSION_EXPIRED", status)
  }

  return response
}
