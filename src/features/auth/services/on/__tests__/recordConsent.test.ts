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

  it("lets a server older than the consent route accept a normal consent", async () => {
    apiCallMock.mockRejectedValue(new ApiError("Not found", 404))
    await expect(authService.recordConsent("3", true)).resolves.toBeUndefined()
  })

  it("fails a withdrawal on a server that cannot record it, so nothing is deleted silently", async () => {
    apiCallMock.mockRejectedValue(new ApiError("Not found", 404))
    await expect(authService.recordConsent("3", false, true)).rejects.toBeInstanceOf(ApiError)
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
})
