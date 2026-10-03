import { authService } from "../auth"
import { refreshTokenStorage, tokenStorage } from "@shared/services/tokenStorage"
import {
  getStorageItem,
  removeStorageItem,
  renameUserData,
  setStorageItem,
} from "@shared/services/sqliteStorage"

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
  renameUserData: jest.fn().mockResolvedValue(undefined),
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

  it("propagates a network failure without storing anything", async () => {
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error("Network request failed"))

    await expect(authService.signin("tester", "pw")).rejects.toThrow(
      "Network request failed",
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

  it("propagates a network failure on signup without storing anything", async () => {
    ;(globalThis.fetch as jest.Mock).mockRejectedValue(new Error("Network request failed"))

    await expect(authService.signup("newbie", "n@e.com", "pw")).rejects.toThrow(
      "Network request failed",
    )
    expect(setTokenMock).not.toHaveBeenCalled()
  })
})

describe("authService numeric-id to uuid migration", () => {
  const uuid = "3f2b8c1e-9a4d-4e6f-8b2a-1c0d9e8f7a6b"
  const getStorageItemMock = getStorageItem as jest.Mock
  const renameUserDataMock = renameUserData as jest.Mock
  const removeStorageItemMock = removeStorageItem as jest.Mock

  const signinAs = async (user: { id: string | number; username: string }) => {
    ;(globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: "t", user }),
    })
    await authService.signin(user.username, "pw")
  }

  beforeEach(() => {
    globalThis.fetch = jest.fn()
    getStorageItemMock.mockReset()
    renameUserDataMock.mockClear()
    removeStorageItemMock.mockClear()
  })

  it("moves the account's rows from its numeric id to its new uuid", async () => {
    getStorageItemMock.mockResolvedValue(JSON.stringify({ id: 2, username: "kostis" }))

    await signinAs({ id: uuid, username: "kostis" })

    expect(renameUserDataMock).toHaveBeenCalledWith("2", uuid)
    expect(removeStorageItemMock).toHaveBeenCalledWith(`@active_trainee_user_${uuid}`)
  })

  it("leaves another account's rows alone", async () => {
    getStorageItemMock.mockResolvedValue(JSON.stringify({ id: 2, username: "someone" }))

    await signinAs({ id: uuid, username: "kostis" })

    expect(renameUserDataMock).not.toHaveBeenCalled()
  })

  it("does nothing once the stored id is already a uuid", async () => {
    getStorageItemMock.mockResolvedValue(JSON.stringify({ id: uuid, username: "kostis" }))

    await signinAs({ id: uuid, username: "kostis" })

    expect(renameUserDataMock).not.toHaveBeenCalled()
  })

  it("does nothing against a server that still sends numeric ids", async () => {
    getStorageItemMock.mockResolvedValue(JSON.stringify({ id: 2, username: "kostis" }))

    await signinAs({ id: 2, username: "kostis" })

    expect(renameUserDataMock).not.toHaveBeenCalled()
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
