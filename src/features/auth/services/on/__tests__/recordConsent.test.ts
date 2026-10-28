import { authService } from "../auth"
import { apiCall } from "@shared/services/apiClient"
import { ApiError, ServerUnreachableError } from "@shared/services/apiError"
import { kv, resetMemorySqlite } from "test-utils/memorySqlite"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/services/apiClient", () => ({
  ...jest.requireActual("@shared/services/apiClient"),
  apiCall: jest.fn(),
}))

const apiCallMock = apiCall as jest.Mock

beforeEach(() => {
  resetMemorySqlite()
  apiCallMock.mockReset()
})

describe("authService.recordConsent", () => {
  it("sends the terms version and health choice as PUT /api/auth/consent and caches the user", async () => {
    apiCallMock.mockResolvedValue({ user: { id: "u1", username: "t", termsVersion: "3" } })

    await authService.recordConsent("3", true)

    expect(apiCallMock).toHaveBeenCalledWith("/api/auth/consent", {
      method: "PUT",
      body: JSON.stringify({ termsVersion: "3", healthConsent: true }),
    })
    expect(JSON.parse(kv["@user"]).termsVersion).toBe("3")
  })

  it.each([
    ["a 401", new ApiError("Unauthorized", 401)],
    ["a 429", new ApiError("Too many requests", 429)],
    ["a 5xx", new ApiError("Bad gateway", 502)],
    ["a network failure", new ServerUnreachableError()],
  ])("does not report consent as recorded after %s", async (_name, error) => {
    apiCallMock.mockRejectedValue(error)
    await expect(authService.recordConsent("3", true)).rejects.toBe(error)
    expect(kv["@user"]).toBeUndefined()
  })
})

describe("authService.deleteAccount", () => {
  it("keeps the signed-in user when the server refuses the password", async () => {
    kv["@user"] = JSON.stringify({ id: "u1", username: "t" })
    apiCallMock.mockRejectedValue(new ApiError("Incorrect password", 401))

    await expect(authService.deleteAccount("wrong")).rejects.toThrow("Incorrect password")
    expect(apiCallMock).toHaveBeenCalledWith("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify({ password: "wrong" }),
    })
    expect(kv["@user"]).toBeDefined()
  })

  it("keeps the signed-in user when the server is unreachable", async () => {
    kv["@user"] = JSON.stringify({ id: "u1", username: "t" })
    apiCallMock.mockRejectedValue(new ServerUnreachableError())

    await expect(authService.deleteAccount("pw")).rejects.toBeInstanceOf(ServerUnreachableError)
    expect(kv["@user"]).toBeDefined()
  })
})

describe("authService.verifyIdentity", () => {
  it("rejects a wrong password", async () => {
    apiCallMock.mockRejectedValue(new ApiError("Incorrect password", 403))
    await expect(authService.verifyIdentity("wrong")).rejects.toThrow("Incorrect password")
    expect(apiCallMock).toHaveBeenCalledWith("/api/auth/reauth", {
      method: "POST",
      body: JSON.stringify({ password: "wrong" }),
    })
  })

  it("passes on a server without the route", async () => {
    apiCallMock.mockRejectedValue(new ApiError("Not found", 404))
    await expect(authService.verifyIdentity(null, "id-token")).resolves.toBeUndefined()
  })
})

describe("authService.logout", () => {
  it("still signs out when the server cannot revoke the refresh token", async () => {
    const { refreshTokenStorage, tokenStorage } = jest.requireActual("@shared/services/tokenStorage")
    jest.spyOn(refreshTokenStorage, "get").mockResolvedValue("refresh")
    const clear = jest.spyOn(tokenStorage, "clear").mockResolvedValue(undefined)
    kv["@user"] = JSON.stringify({ id: "u1", username: "t" })
    apiCallMock.mockRejectedValue(new ServerUnreachableError())

    await authService.logout()

    expect(clear).toHaveBeenCalled()
    expect(kv["@user"]).toBeUndefined()
  })

  it("renews an expired access token so the server accepts the sign-out", async () => {
    const { refreshTokenStorage, tokenStorage } = jest.requireActual("@shared/services/tokenStorage")
    let refresh = "old-refresh"
    jest.spyOn(refreshTokenStorage, "get").mockImplementation(async () => refresh)
    jest.spyOn(refreshTokenStorage, "set").mockImplementation(async (v: unknown) => {
      refresh = String(v)
      return true
    })
    jest.spyOn(tokenStorage, "get").mockResolvedValue(null)
    jest.spyOn(tokenStorage, "set").mockResolvedValue(undefined)
    jest.spyOn(tokenStorage, "clear").mockResolvedValue(undefined)
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ token: "fresh", refreshToken: "rotated" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    )
    apiCallMock.mockResolvedValue({})

    await authService.logout()

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/auth\/refresh$/)
    expect(apiCallMock).toHaveBeenCalledWith(
      "/api/auth/signout",
      expect.objectContaining({ body: JSON.stringify({ refreshToken: "rotated", allDevices: false }) }),
    )
    fetchMock.mockRestore()
  })
})
