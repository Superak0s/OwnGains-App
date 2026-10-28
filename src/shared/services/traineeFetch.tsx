import {
  authenticatedFetch,
  routeOf,
  type HttpFetch,
} from "@shared/services/authenticatedFetch"
import { captureException, metric } from "@shared/services/crashReporting"

const refuse = (reason: string): Promise<never> => {
  const error = new Error(reason)
  captureException(error, { stage: "traineeFetchRefused" })
  return Promise.reject(error)
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
    if (routeOf(url).startsWith("/api/auth/"))
      return refuse(`traineeFetch must not target an auth route: ${routeOf(url)}`)
    // The server 403s a trainer's deletes, and no trainer flow sends a
    // DELETE, so throw here
    // rather than returning a 403 nobody reads.
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
