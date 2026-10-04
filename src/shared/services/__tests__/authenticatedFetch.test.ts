jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

jest.mock("@shared/services/config", () => ({
  getServerUrl: jest.fn(() => "https://api.example.com"),
  assertSecureTransport: jest.fn(),
}))

jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { get: jest.fn(), clearAccess: jest.fn() },
  refreshTokenStorage: { get: jest.fn() },
}))

import { refreshTokenStorage, tokenStorage } from "@shared/services/tokenStorage"
import { ApiError } from "../apiError"
import { authenticatedFetch, setSessionRefresher } from "../authenticatedFetch"

const tokenGet = tokenStorage.get as jest.Mock
const clearAccess = tokenStorage.clearAccess as jest.Mock
const refreshGet = refreshTokenStorage.get as jest.Mock
const fetchMock = jest.fn()

const respond = (status: number): Response => new Response("{}", { status })
const bearerOf = (call: unknown[]): string | undefined =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization

describe("authenticatedFetch 401 handling", () => {
  let accessToken: string | null

  beforeEach(() => {
    jest.clearAllMocks()
    globalThis.fetch = fetchMock
    accessToken = "old"
    tokenGet.mockImplementation(async () => accessToken)
    refreshGet.mockResolvedValue("refresh")
  })

  afterEach(() => setSessionRefresher(null))

  it("refreshes once and retries the request with the new token", async () => {
    const refresher = jest.fn(async () => {
      accessToken = "new"
      return "refreshed" as const
    })
    setSessionRefresher(refresher)
    fetchMock.mockResolvedValueOnce(respond(401)).mockResolvedValueOnce(respond(200))

    const res = await authenticatedFetch("/api/program")

    expect(res.status).toBe(200)
    expect(refresher).toHaveBeenCalledTimes(1)
    expect(bearerOf(fetchMock.mock.calls[0])).toBe("Bearer old")
    expect(bearerOf(fetchMock.mock.calls[1])).toBe("Bearer new")
    expect(clearAccess).not.toHaveBeenCalled()
  })

  it("skips the refresh when another request already rotated the token", async () => {
    const refresher = jest.fn()
    setSessionRefresher(refresher)
    fetchMock.mockImplementationOnce(async () => {
      accessToken = "rotated"
      return respond(401)
    })
    fetchMock.mockResolvedValueOnce(respond(200))

    await authenticatedFetch("/api/program")

    expect(refresher).not.toHaveBeenCalled()
    expect(bearerOf(fetchMock.mock.calls[1])).toBe("Bearer rotated")
  })

  it("gives up after one retry", async () => {
    setSessionRefresher(async () => "refreshed")
    fetchMock.mockResolvedValue(respond(401))

    await expect(authenticatedFetch("/api/program")).rejects.toThrow("SESSION_EXPIRED")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("throws SESSION_EXPIRED and drops the access token when the refresh is rejected", async () => {
    setSessionRefresher(async () => "rejected")
    fetchMock.mockResolvedValue(respond(401))

    const error = await authenticatedFetch("/api/program").catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toBe("SESSION_EXPIRED")
    expect(clearAccess).toHaveBeenCalled()
  })

  it("reports an unreachable refresh as a transport failure, not an expired session", async () => {
    setSessionRefresher(async () => "unreachable")
    fetchMock.mockResolvedValue(respond(401))

    const error = await authenticatedFetch("/api/program").catch((e: unknown) => e)
    expect(error).not.toBeInstanceOf(ApiError)
    expect(clearAccess).not.toHaveBeenCalled()
  })

  it("does not refresh on sign-out, which runs while a rejected refresh logs out", async () => {
    const refresher = jest.fn()
    setSessionRefresher(refresher)
    fetchMock.mockResolvedValue(respond(401))

    await expect(
      authenticatedFetch("/api/auth/signout", { method: "POST" }),
    ).rejects.toThrow("SESSION_EXPIRED")
    expect(refresher).not.toHaveBeenCalled()
  })

  it("refreshes with the bearer but keeps it without a refresh token", async () => {
    const refresher = jest.fn(async () => "rejected" as const)
    setSessionRefresher(refresher)
    refreshGet.mockResolvedValue(null)
    fetchMock.mockResolvedValue(respond(401))

    await expect(authenticatedFetch("/api/program")).rejects.toThrow("SESSION_EXPIRED")
    expect(refresher).toHaveBeenCalledTimes(1)
    expect(clearAccess).not.toHaveBeenCalled()
  })

  it("does not refresh a request that carried no credential", async () => {
    const refresher = jest.fn()
    setSessionRefresher(refresher)
    refreshGet.mockResolvedValue(null)
    accessToken = null
    fetchMock.mockResolvedValue(respond(401))

    await expect(authenticatedFetch("/api/program")).rejects.toThrow("SESSION_EXPIRED")
    expect(refresher).not.toHaveBeenCalled()
  })
})

describe("authenticatedFetch token scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    globalThis.fetch = fetchMock
    tokenGet.mockResolvedValue("secret")
    refreshGet.mockResolvedValue("refresh")
  })

  it("sends the bearer to the configured server, relative or absolute", async () => {
    fetchMock.mockResolvedValue(respond(200))

    await authenticatedFetch("/api/program")
    await authenticatedFetch("https://API.example.com/api/program")

    expect(bearerOf(fetchMock.mock.calls[0])).toBe("Bearer secret")
    expect(bearerOf(fetchMock.mock.calls[1])).toBe("Bearer secret")
  })

  it("never sends it to another origin", async () => {
    fetchMock.mockResolvedValue(respond(200))

    await authenticatedFetch("https://api.example.com.evil.test/x")
    await authenticatedFetch("https://cdn.example.org/img.jpg")

    expect(bearerOf(fetchMock.mock.calls[0])).toBeUndefined()
    expect(bearerOf(fetchMock.mock.calls[1])).toBeUndefined()
  })

  it("does not treat another origin's 401 as a session expiry", async () => {
    const refresher = jest.fn()
    setSessionRefresher(refresher)
    fetchMock.mockResolvedValue(respond(401))

    const res = await authenticatedFetch("https://cdn.example.org/img.jpg")

    expect(res.status).toBe(401)
    expect(refresher).not.toHaveBeenCalled()
    expect(clearAccess).not.toHaveBeenCalled()
    setSessionRefresher(null)
  })
})
