import { authService } from "../auth"
import { ServerUnreachableError } from "@shared/services/apiError"
import { refreshTokenStorage, tokenStorage } from "@shared/services/tokenStorage"
import { setStorageItem } from "@shared/services/sqliteStorage"

jest.mock("@shared/services/config", () => ({
  getServerUrl: jest.fn(() => "https://api.example.com"),
  assertSecureTransport: jest.requireActual("@shared/services/config").assertSecureTransport,
}))

jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { set: jest.fn().mockResolvedValue(undefined), get: jest.fn() },
  refreshTokenStorage: { get: jest.fn(), set: jest.fn() },
}))

jest.mock("@shared/services/sqliteStorage", () => ({
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  removeStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

const setTokenMock = tokenStorage.set as jest.Mock
const setStorageItemMock = setStorageItem as jest.Mock

describe("authService signin/signup network flow", () => {
  beforeEach(() => {
    setTokenMock.mockClear()
    setStorageItemMock.mockClear()
    globalThis.fetch = jest.fn()
  })

  it("stores token and user on successful signin", async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: "abc123",
        user: { id: 1, username: "tester" },
      }),
    })

    const result = await authService.signin("tester", "pw")

    expect(result.success).toBe(true)
    expect(setTokenMock).toHaveBeenCalledWith("abc123")
    expect(setStorageItemMock).toHaveBeenCalledWith(
      "@user",
      JSON.stringify({ id: 1, username: "tester" }),
    )
  })

  it("does not store a token when the server rejects credentials", async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ success: false, error: "Invalid credentials" }),
    })

    await expect(authService.signin("tester", "wrong")).rejects.toThrow(
      "Invalid credentials",
    )
    expect(setTokenMock).not.toHaveBeenCalled()
  })

  it("turns a network failure into ServerUnreachableError without storing anything", async () => {
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error("Network request failed"))

    await expect(authService.signin("tester", "pw")).rejects.toBeInstanceOf(
      ServerUnreachableError,
    )
    expect(setTokenMock).not.toHaveBeenCalled()
  })

  it("stores token and user on successful signup", async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        token: "xyz789",
        user: { id: 2, username: "newbie" },
      }),
    })

    const result = await authService.signup("newbie", "n@e.com", "pw")

    expect(result.success).toBe(true)
    expect(setTokenMock).toHaveBeenCalledWith("xyz789")
  })

  it("turns a network failure on signup into ServerUnreachableError without storing anything", async () => {
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error("Network request failed"))

    await expect(authService.signup("newbie", "n@e.com", "pw")).rejects.toBeInstanceOf(
      ServerUnreachableError,
    )
    expect(setTokenMock).not.toHaveBeenCalled()
  })
})

describe("authService.refreshToken failure classification", () => {
  beforeEach(() => {
    ;(refreshTokenStorage.get as jest.Mock).mockResolvedValue("refresh")
    ;(tokenStorage.get as jest.Mock).mockResolvedValue(null)
    globalThis.fetch = jest.fn()
  })

  const serverAnswers = (status: number): void => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ success: false, error: "nope" }),
    })
  }

  it("reports a refused refresh token as null", async () => {
    serverAnswers(401)
    await expect(authService.refreshToken()).resolves.toBeNull()
  })

  it.each([429, 502, 503])("surfaces a %i instead of reporting a refusal", async (status) => {
    serverAnswers(status)
    await expect(authService.refreshToken()).rejects.toThrow()
  })

  it("surfaces a proxy's non-JSON error page instead of reporting a refusal", async () => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <")
      },
    })
    await expect(authService.refreshToken()).rejects.toThrow()
  })
})

describe("authService.isAuthenticated", () => {
  it("counts a stored refresh token as signed in after the access token was dropped", async () => {
    ;(tokenStorage.get as jest.Mock).mockResolvedValue(null)
    ;(refreshTokenStorage.get as jest.Mock).mockResolvedValue("refresh")
    await expect(authService.isAuthenticated()).resolves.toBe(true)
  })

  it("is signed out with neither token", async () => {
    ;(tokenStorage.get as jest.Mock).mockResolvedValue(null)
    ;(refreshTokenStorage.get as jest.Mock).mockResolvedValue(null)
    await expect(authService.isAuthenticated()).resolves.toBe(false)
  })
})
