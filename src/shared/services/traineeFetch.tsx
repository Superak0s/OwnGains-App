import {
  authenticatedFetch,
  isOwnServer,
  routeOf,
  type HttpFetch,
} from "@shared/services/authenticatedFetch"
import { captureException, metric } from "@shared/services/crashReporting"

const refuse = (reason: string): Promise<never> => {
  const error = new Error(reason)
  captureException(error, { stage: "traineeFetchRefused" })
  return Promise.reject(error)
}

// Resolves case, percent-encoding, empty, "." and ".." segments the way a server's
// router may, so "/API//x/../auth" can't slip past the prefix check.
const canonicalPath = (url: string): string | null => {
  const path = url.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0]
  let decoded: string
  try {
    decoded = decodeURIComponent(path)
  } catch {
    return null
  }
  const segments: string[] = []
  for (const segment of decoded.toLowerCase().split(/[/\\]/)) {
    if (segment === "" || segment === ".") continue
    if (segment === "..") segments.pop()
    else segments.push(segment)
  }
  return `/${segments.join("/")}/`
}

/**
 * Routes a request at another user's data. The server verifies an active
 * `trainer` grant from that user to the caller and 403s otherwise.
 */
export const traineeFetch =
  (traineeId: string): HttpFetch =>
  (url, options = {}) => {
    // A trainer grant covers workout data only. Retargeting an account route
    // (credentials, deletion) at a trainee must never leave the client, even
    // if the server's rejection were ever missing.
    if (canonicalPath(url)?.startsWith("/api/auth/") !== false)
      return refuse(`traineeFetch must not target an auth route: ${routeOf(url)}`)
    if (/^[a-z]+:/i.test(url) && !isOwnServer(url))
      return refuse("traineeFetch must not target another server")
    // The server 403s a trainer's deletes, and no trainer flow sends a
    // DELETE, so throw here rather than returning a 403 nobody reads.
    if (options.method?.toUpperCase() === "DELETE")
      return refuse(`traineeFetch must not delete a trainee's data: ${routeOf(url)}`)
    const method = options.method?.toUpperCase() ?? "GET"
    return authenticatedFetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        "X-Trainee-Id": traineeId,
      },
    }).then(
      (res) => {
        metric.count("trainer.act_as_request", 1, {
          attributes: { method, outcome: res.ok ? "ok" : `http_${res.status}` },
        })
        return res
      },
      (error: unknown) => {
        metric.count("trainer.act_as_request", 1, { attributes: { method, outcome: "error" } })
        throw error
      },
    )
  }
