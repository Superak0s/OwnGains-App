jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

import {
  ApiError,
  fetchIdempotent,
  parseApiResponse,
  parseRetryAfterMs,
} from "../apiClient"
import type { HttpFetch } from "../authenticatedFetch"

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  })

describe("parseRetryAfterMs", () => {
  it("reads delta-seconds", () => {
    expect(parseRetryAfterMs(respond(429, {}, { "Retry-After": "7" }))).toBe(7000)
  })

  it("reads an HTTP date", () => {
    const at = new Date(Date.now() + 60_000).toUTCString()
    const ms = parseRetryAfterMs(respond(503, {}, { "Retry-After": at }))
    expect(ms).toBeGreaterThan(55_000)
    expect(ms).toBeLessThanOrEqual(60_000)
  })

  it("is undefined without a usable header", () => {
    expect(parseRetryAfterMs(respond(503, {}))).toBeUndefined()
    expect(parseRetryAfterMs(respond(503, {}, { "Retry-After": "soon" }))).toBeUndefined()
  })
})

describe("fetchIdempotent", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("resends the same key after an in-flight 409, waiting Retry-After", async () => {
    const http = jest
      .fn<Promise<Response>, Parameters<HttpFetch>>()
      .mockResolvedValueOnce(
        respond(409, { code: "IDEMPOTENCY_KEY_IN_FLIGHT" }, { "Retry-After": "2" }),
      )
      .mockResolvedValueOnce(respond(200, { success: true }))

    const pending = fetchIdempotent(http, "/x", { method: "POST", body: "{}" }, "k1")
    await jest.advanceTimersByTimeAsync(1999)
    expect(http).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    const response = await pending

    expect(response.status).toBe(200)
    expect(http).toHaveBeenCalledTimes(2)
    for (const [, init] of http.mock.calls) {
      expect((init?.headers as Record<string, string>)["Idempotency-Key"]).toBe("k1")
    }
  })

  it("returns any other 409 untouched", async () => {
    const http = jest
      .fn<Promise<Response>, Parameters<HttpFetch>>()
      .mockResolvedValue(respond(409, { code: "TOO_MANY_GRANTS" }))
    const response = await fetchIdempotent(http, "/x", { method: "POST" }, "k1")
    expect(http).toHaveBeenCalledTimes(1)
    await expect(parseApiResponse(response)).rejects.toMatchObject({ code: "TOO_MANY_GRANTS" })
  })
})

describe("parseApiResponse", () => {
  it("carries Retry-After and plain copy for a throttled sign-in", async () => {
    const error = (await parseApiResponse(
      respond(429, { code: "AUTH_THROTTLED", error: "Too many attempts" }, { "Retry-After": "90" }),
    ).catch((e: unknown) => e)) as ApiError
    expect(error.retryAfterMs).toBe(90_000)
    expect(error.message).toBe("Too many incorrect passwords. Try again in 90 seconds.")
  })

  it("keeps the server's prose for codes without their own copy", async () => {
    await expect(
      parseApiResponse(respond(400, { code: "METRIC_LIMIT", error: "At most 50 metrics" })),
    ).rejects.toThrow("At most 50 metrics")
  })
})
