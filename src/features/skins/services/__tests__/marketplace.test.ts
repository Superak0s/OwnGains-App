jest.mock("expo-crypto", () => ({ randomUUID: () => require("crypto").randomUUID() }))
jest.mock("@shared/services/appMode", () => ({ getAppMode: jest.fn(async () => "online") }))
jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { get: jest.fn(async () => "tok") },
  refreshTokenStorage: { get: jest.fn(async () => "refresh") },
}))
jest.mock("@shared/services/config", () => ({
  ...jest.requireActual("@shared/services/config"),
  getServerUrl: jest.fn(() => "https://owngains.superak0s.com"),
}))

import { setSessionRefresher } from "@shared/services/authenticatedFetch"
import { getServerUrl } from "@shared/services/config"
import { tokenStorage } from "@shared/services/tokenStorage"
import { getSkin, normalizeMarketplaceUrl, rateSkin, recordDownload, setMarketplaceUrl } from "../marketplace"

const BASE = "https://owngains.superak0s.com/marketplace"

type Call = { url: string; headers: Record<string, string> }
let calls: Call[]

function mockFetch(authServer: string) {
  calls = []
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
    const body = url.endsWith("/healthz") ? { status: "ok", authServer } : { id: 1, average: 5, count: 1, myRating: 5 }
    return new Response(JSON.stringify(body), { status: 200 })
  }) as unknown as typeof fetch
}

describe("marketplace client", () => {
  it("never sends the token to a marketplace trusting another server", async () => {
    mockFetch("https://evil.example")
    const base = "https://other.example/m"
    await getSkin(1, base)
    const read = calls.find((c) => c.url === `${base}/api/skins/1`)
    expect(read?.headers.Authorization).toBeUndefined()
    await expect(rateSkin(1, 5, base)).rejects.toMatchObject({ code: "MARKETPLACE_SIGN_IN_REQUIRED" })
    expect(calls.some((c) => c.url.endsWith("/rating"))).toBe(false)
  })

  it("never sends the token to another origin that claims to trust the app's server", async () => {
    mockFetch("https://owngains.superak0s.com")
    const base = "https://evil.example/marketplace"
    await getSkin(1, base)
    expect(calls.find((c) => c.url === `${base}/api/skins/1`)?.headers.Authorization).toBeUndefined()
    await expect(rateSkin(1, 5, base)).rejects.toMatchObject({ code: "MARKETPLACE_SIGN_IN_REQUIRED" })
  })

  it("sends the token to a marketplace on the app server's origin", async () => {
    mockFetch("https://owngains.superak0s.com")
    await rateSkin(1, 5, BASE)
    expect(calls.find((c) => c.url.endsWith("/rating"))?.headers.Authorization).toBe("Bearer tok")
  })

  it("dev builds send the token to a marketplace on the server's host and another port, release builds don't", async () => {
    ;(getServerUrl as jest.Mock).mockReturnValue("http://192.168.10.243:5000")
    const base = "http://192.168.10.243:5100"
    try {
      mockFetch("http://192.168.10.243:5000")
      await getSkin(1, base)
      expect(calls.find((c) => c.url === `${base}/api/skins/1`)?.headers.Authorization).toBe("Bearer tok")
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false
      mockFetch("http://192.168.10.243:5000")
      await getSkin(1, base)
      expect(calls.find((c) => c.url === `${base}/api/skins/1`)?.headers.Authorization).toBeUndefined()
    } finally {
      ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true
      ;(getServerUrl as jest.Mock).mockReturnValue("https://owngains.superak0s.com")
    }
  })

  it("refreshes an expired token once and retries", async () => {
    mockFetch("https://owngains.superak0s.com")
    const ok = global.fetch as jest.Mock
    let token = "tok"
    ;(tokenStorage.get as jest.Mock).mockImplementation(async () => token)
    setSessionRefresher(async () => {
      token = "tok2"
      return "refreshed"
    })
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string>)?.Authorization
      if (url.endsWith("/rating") && auth === "Bearer tok") {
        calls.push({ url, headers: init?.headers as Record<string, string> })
        return new Response(JSON.stringify({ error: "expired" }), { status: 401 })
      }
      return ok(url, init)
    }) as unknown as typeof fetch
    await expect(rateSkin(1, 5, BASE)).resolves.toMatchObject({ myRating: 5 })
    expect(calls.filter((c) => c.url.endsWith("/rating")).map((c) => c.headers.Authorization)).toEqual(["Bearer tok", "Bearer tok2"])
    setSessionRefresher(null)
    ;(tokenStorage.get as jest.Mock).mockImplementation(async () => "tok")
  })

  it("sends the same install id on every download", async () => {
    mockFetch("https://owngains.superak0s.com")
    await recordDownload(1, BASE)
    await recordDownload(2, BASE)
    const ids = calls.filter((c) => c.url.endsWith("/download")).map((c) => c.headers["X-Install-Id"])
    expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/)
    expect(ids[1]).toBe(ids[0])
  })

  it("refuses an insecure marketplace URL", async () => {
    await expect(setMarketplaceUrl("http://example.com")).rejects.toThrow(/https/i)
  })
})

describe("normalizeMarketplaceUrl", () => {
  it("keeps a marketplace under a path", () => {
    expect(normalizeMarketplaceUrl(`${BASE}/`)).toBe(BASE)
  })

  it.each(["https://owngains.superak0s.com/api/users/me#", "https://owngains.superak0s.com/api/users/me?x="])(
    "rejects %s, which would retarget requests at another route",
    (url) => {
      expect(() => normalizeMarketplaceUrl(url)).toThrow()
    },
  )
})
