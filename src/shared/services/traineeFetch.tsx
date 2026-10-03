import {
  authenticatedFetch,
  routeOf,
  type HttpFetch,
} from "@shared/services/authenticatedFetch"

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
      return Promise.reject(
        new Error(`traineeFetch must not target an auth route: ${url}`),
      )
    // The grant is read/write but not destructive: the server 403s the bulk
    // deletes, and no trainer flow deletes anything, so throw here
    // rather than returning a 403 nobody reads.
    if (options.method?.toUpperCase() === "DELETE")
      return Promise.reject(
        new Error(`traineeFetch must not delete a trainee's data: ${url}`),
      )
    return authenticatedFetch(url, {
      ...options,
      headers: {
        ...(options.headers as Record<string, string> | undefined),
        "X-Trainee-Id": traineeId,
      },
    })
  }
