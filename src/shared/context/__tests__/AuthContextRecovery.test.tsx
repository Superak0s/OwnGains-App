import { create, act } from "react-test-renderer"
import { AuthProvider, useAuth, useAuthToken } from "../AuthContext"
import { ApiError } from "@shared/services/apiError"
import type { AppMode } from "@shared/services/appMode"

jest.mock("@features/auth/services/index", () => ({
  authService: {
    isAuthenticated: jest.fn(),
    getCurrentUser: jest.fn(),
    getStoredUser: jest.fn(),
    refreshToken: jest.fn(),
    signin: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  },
}))

jest.mock("@features/auth/services/on/auth", () => ({
  authService: { logout: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock("@shared/services/config", () => ({
  onServerUrlChange: jest.fn(() => () => {}),
}))

const modeListeners: Array<(mode: AppMode) => void> = []
jest.mock("@shared/services/appMode", () => ({
  getAppMode: jest.fn().mockResolvedValue("online"),
  isServerless: jest.fn().mockResolvedValue(false),
  onAppModeChange: {
    subscribe: jest.fn((fn: (mode: AppMode) => void) => {
      modeListeners.push(fn)
      return () => modeListeners.splice(modeListeners.indexOf(fn), 1)
    }),
  },
}))

jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { get: jest.fn() },
  refreshTokenStorage: { get: jest.fn(), clear: jest.fn().mockResolvedValue(undefined) },
}))

jest.mock("@shared/services/supplementReminders", () => ({
  cancelAllSupplementReminders: jest.fn().mockResolvedValue(undefined),
}))

import { authService } from "@features/auth/services/index"
import { authService as onlineAuthService } from "@features/auth/services/on/auth"
import { refreshTokenStorage, tokenStorage } from "@shared/services/tokenStorage"

const svc = authService as unknown as Record<string, jest.Mock>
const tokenGet = tokenStorage.get as jest.Mock
const refreshGet = refreshTokenStorage.get as jest.Mock

const expiredJwt = `h.${Buffer.from(JSON.stringify({ exp: 1_600_000_000 })).toString("base64url")}.s`

const seen: { current?: { isAuthenticated: boolean; username?: string; token: string } } = {}
const ctx: { current?: ReturnType<typeof useAuth> } = {}
function Probe() {
  const auth = useAuth()
  const { isAuthenticated, user } = auth
  ctx.current = auth
  seen.current = { isAuthenticated, username: user?.username, token: useAuthToken() }
  return null
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

let root: ReturnType<typeof create> | undefined
const boot = async (): Promise<void> => {
  await act(async () => {
    root = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await flush()
  })
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.useFakeTimers()
  jest.spyOn(console, "warn").mockImplementation(() => {})
  jest.spyOn(console, "info").mockImplementation(() => {})
  jest.spyOn(console, "error").mockImplementation(() => {})
  svc.isAuthenticated.mockResolvedValue(true)
  refreshGet.mockResolvedValue("refresh-token")
})

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  jest.useRealTimers()
  jest.restoreAllMocks()
})

describe("AuthProvider with a legacy expired session", () => {
  beforeEach(() => {
    svc.getStoredUser.mockResolvedValue(null)
    tokenGet.mockResolvedValue(expiredJwt)
  })

  it("renews the expired token and signs the user back in instead of leaving every screen failing", async () => {
    svc.getCurrentUser
      .mockRejectedValueOnce(new ApiError("Token expired", 401))
      .mockResolvedValueOnce({ id: 1, username: "tester" })
    svc.refreshToken.mockResolvedValue("fresh-token")

    await boot()

    expect(svc.refreshToken).toHaveBeenCalledTimes(1)
    expect(seen.current).toEqual({ isAuthenticated: true, username: "tester", token: "fresh-token" })
  })

  it("logs out to the login screen when the server rejects the legacy refresh token", async () => {
    svc.getCurrentUser.mockRejectedValue(new ApiError("Token expired", 401))
    svc.refreshToken.mockRejectedValue(new ApiError("Invalid refresh token", 401))

    await boot()

    expect(svc.logout).toHaveBeenCalled()
    expect(seen.current?.isAuthenticated).toBe(false)
  })

  it("does not log out on a 5xx during the legacy refresh, so the stored credential is kept for a retry", async () => {
    svc.getCurrentUser.mockRejectedValue(new ApiError("Token expired", 401))
    svc.refreshToken.mockRejectedValue(new ApiError("Bad gateway", 502))

    await boot()

    expect(svc.logout).not.toHaveBeenCalled()
  })
})

describe("AuthProvider refresh after the access token expired on a cached session", () => {
  beforeEach(() => {
    svc.getStoredUser.mockResolvedValue({ id: 1, username: "tester" })
    tokenGet.mockResolvedValue(expiredJwt)
  })

  it("keeps the signed-in session when the server answers 503 during the refresh", async () => {
    svc.getCurrentUser.mockRejectedValue(new ApiError("Token expired", 401))
    svc.refreshToken.mockRejectedValue(new ApiError("Service unavailable", 503))

    await boot()

    expect(seen.current?.isAuthenticated).toBe(true)
    expect(svc.logout).not.toHaveBeenCalled()
  })

  it("discards a refresh that resolves after the user logged out so the old session is not resurrected", async () => {
    svc.getCurrentUser.mockReturnValue(new Promise(() => {}))
    let resolveRefresh: (token: string) => void = () => {}
    svc.refreshToken.mockReturnValue(new Promise((r) => (resolveRefresh = r)))

    await boot()
    let pending: Promise<boolean> | undefined
    await act(async () => {
      pending = ctx.current!.refreshToken()
      await ctx.current!.logout()
      resolveRefresh("late-token")
      await pending
      await flush()
    })

    expect(await pending).toBe(false)
    expect(seen.current?.isAuthenticated).toBe(false)
    expect(seen.current?.token).toBe("")
  })
})

describe("AuthProvider app-mode switch", () => {
  beforeEach(() => {
    svc.getStoredUser.mockResolvedValue({ id: 1, username: "tester" })
    svc.getCurrentUser.mockResolvedValue({ id: 1, username: "tester" })
    tokenGet.mockResolvedValue(expiredJwt)
  })

  const switchTo = async (mode: AppMode): Promise<void> => {
    await act(async () => {
      modeListeners.forEach((fn) => fn(mode))
      await flush()
    })
  }

  it("revokes the server credential and connects the local profile when switching online to offline", async () => {
    svc.signin.mockResolvedValue({ success: true, user: { id: "local", username: "tester" }, token: "offline-token" })
    await boot()

    await switchTo("offline")

    expect(onlineAuthService.logout).toHaveBeenCalled()
    expect(refreshTokenStorage.clear).toHaveBeenCalled()
    expect(svc.signin).toHaveBeenCalledWith("tester", "")
    expect(seen.current).toEqual({ isAuthenticated: true, username: "tester", token: "offline-token" })
  })

  it("still connects the local profile when revoking the server credential fails during the switch", async () => {
    ;(onlineAuthService.logout as jest.Mock).mockRejectedValueOnce(new TypeError("Network request failed"))
    svc.signin.mockResolvedValue({ success: true, user: { id: "local", username: "tester" }, token: "offline-token" })
    await boot()

    await switchTo("offline")

    expect(seen.current?.isAuthenticated).toBe(true)
    expect(seen.current?.token).toBe("offline-token")
  })

  it("drops the offline session when switching back online so a real server login is required", async () => {
    svc.signin.mockResolvedValue({ success: true, user: { id: "local", username: "tester" }, token: "offline-token" })
    await boot()
    await switchTo("offline")

    await switchTo("online")

    expect(svc.logout).toHaveBeenCalled()
    expect(seen.current).toEqual({ isAuthenticated: false, username: undefined, token: "" })
  })
})
