import { randomUUID } from "expo-crypto"
import { ApiError } from "@shared/services/apiError"
import { getAppMode } from "@shared/services/appMode"
import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { assertSecureTransport, getServerUrl, isPrivateHost } from "@shared/services/config"
import { captureException } from "@shared/services/crashReporting"
import { countCall } from "@shared/services/dispatchProxy"
import { getStorageItem, removeStorageItem, setStorageItem } from "@shared/services/sqliteStorage"
import { tokenStorage } from "@shared/services/tokenStorage"
import type { SkinDocument } from "../skinFormat"

export const DEFAULT_MARKETPLACE_URL = __DEV__ ? "http://192.168.10.243:5100" : "https://owngains.superak0s.com/marketplace"
export const MARKETPLACE_SIGN_IN_REQUIRED = "MARKETPLACE_SIGN_IN_REQUIRED"

const URL_KEY = "@marketplace_url"
const INSTALL_ID_KEY = "@marketplace_install_id"

export type SkinSort = "popular" | "rating" | "new"

export interface SkinSummary {
  id: number
  name: string
  description: string
  author: string | null
  version: number
  hasTheme: boolean
  hasBoards: boolean
  swatch: string[]
  downloads: number
  uniqueDownloads: number
  rating: { average: number | null; count: number }
  updatedAt: string
  /** Only in My skins, on a skin the operator removed. Older marketplaces leave it out. */
  takenDown?: { reason: string } | null
}

export interface SkinDetail extends SkinSummary {
  skin: SkinDocument
  myRating: number | null
  url: string
  mine: boolean
}

export interface SkinUpload {
  name: string
  description: string
  skin: SkinDocument
}

/** Unlike a server URL, a marketplace may sit under a path such as `/marketplace`. */
export function normalizeMarketplaceUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "")
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error("Enter a full address starting with https://")
  }
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname)
    throw new Error("Enter a full address starting with https://")
  if (parsed.protocol === "http:" && !isPrivateHost(parsed.hostname))
    throw new Error("Use https:// for a marketplace on the internet")
  return trimmed
}

export const getMarketplaceUrl = async (): Promise<string> =>
  (await getStorageItem(URL_KEY)) ?? DEFAULT_MARKETPLACE_URL

/** Null resets to the official marketplace. */
export async function setMarketplaceUrl(url: string | null): Promise<void> {
  if (url === null) return removeStorageItem(URL_KEY)
  await setStorageItem(URL_KEY, normalizeMarketplaceUrl(url))
}

let installId: Promise<string> | null = null

/** A random id for this install, sent with downloads so each install counts once. Never tied to an account. */
export function getInstallId(): Promise<string> {
  installId ??= (async () => {
    const stored = await getStorageItem(INSTALL_ID_KEY)
    if (stored) return stored
    const id = randomUUID()
    await setStorageItem(INSTALL_ID_KEY, id)
    return id
  })()
  return installId
}

/**
 * Whether this marketplace may see the user's token: only when it is served from the same origin
 * as the app's server. What a marketplace says about itself can't be trusted, so a third-party one
 * never receives a token that works on the user's server.
 */
export async function canAuthenticate(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ?? (await getMarketplaceUrl())
  if ((await getAppMode()) !== "online" || !(await tokenStorage.get())) return false
  return new URL(base).origin === new URL(getServerUrl()).origin
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: "required" | "optional"
  headers?: Record<string, string>
  baseUrl?: string
}

function request<T>(op: string, path: string, opts: RequestOptions): Promise<T> {
  return countCall("skins", op, "online", async () => {
    const base = opts.baseUrl ?? (await getMarketplaceUrl())
    const url = `${base}${path}`
    assertSecureTransport(url)
    const headers: Record<string, string> = { ...opts.headers }
    const allowed = !!opts.auth && (await canAuthenticate(base))
    if (opts.auth) {
      if (!allowed && opts.auth === "required")
        throw new ApiError(
          "Sign in to your OwnGains account on the official server to publish or rate skins.",
          401,
          undefined,
          MARKETPLACE_SIGN_IN_REQUIRED,
        )
    }
    if (opts.body !== undefined) headers["Content-Type"] = "application/json"
    // authenticatedFetch attaches the token, and refreshes and retries an expired one.
    const res = await (allowed ? authenticatedFetch : fetch)(url, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
    const text = await res.text()
    let data: { error?: string; code?: string } | null = null
    try {
      data = text ? JSON.parse(text) : null
    } catch {
      // A proxy error page is HTML. The status below still reports it.
    }
    if (!res.ok)
      throw new ApiError(data?.error ?? `The marketplace answered ${res.status}`, res.status, data, data?.code)
    return data as T
  }).catch((error: unknown) => {
    // A 4xx is the user's to fix and a TypeError is fetch failing to connect.
    if (!(error instanceof ApiError && error.status < 500) && !(error instanceof TypeError))
      captureException(error, { feature: "skins", op })
    throw error
  })
}

export function listSkins(query: { q?: string; sort?: SkinSort; page?: number; mine?: boolean }, baseUrl?: string) {
  const params = new URLSearchParams()
  if (query.q) params.set("q", query.q)
  if (query.sort) params.set("sort", query.sort)
  if (query.page) params.set("page", String(query.page))
  if (query.mine) params.set("mine", "1")
  return request<{ skins: SkinSummary[]; page: number; hasMore: boolean }>("list", `/api/skins?${params}`, {
    auth: query.mine ? "required" : "optional",
    baseUrl,
  })
}

export const getSkin = (id: number, baseUrl?: string) =>
  request<SkinDetail>("get", `/api/skins/${id}`, { auth: "optional", baseUrl })

export const recordDownload = async (id: number, baseUrl?: string) =>
  request<{ downloads: number; uniqueDownloads: number }>("download", `/api/skins/${id}/download`, {
    method: "POST",
    headers: { "X-Install-Id": await getInstallId() },
    baseUrl,
  })

export const publishSkin = (body: SkinUpload, baseUrl?: string) =>
  request<{ id: number; url: string }>("publish", "/api/skins", { method: "POST", body, auth: "required", baseUrl })

export const updateSkin = (id: number, body: SkinUpload, baseUrl?: string) =>
  request<{ id: number; url: string; version: number }>("update", `/api/skins/${id}`, {
    method: "PUT",
    body,
    auth: "required",
    baseUrl,
  })

export const deleteSkin = (id: number, baseUrl?: string) =>
  request<null>("delete", `/api/skins/${id}`, { method: "DELETE", auth: "required", baseUrl })

export const rateSkin = (id: number, stars: number, baseUrl?: string) =>
  request<{ average: number | null; count: number; myRating: number }>("rate", `/api/skins/${id}/rating`, {
    method: "PUT",
    body: { stars },
    auth: "required",
    baseUrl,
  })

export const reportSkin = (id: number, reason: string, baseUrl?: string) =>
  request<null>("report", `/api/skins/${id}/report`, { method: "POST", body: { reason }, auth: "required", baseUrl })

/** Anonymizes the signed-in user's skins, ratings and reports. Called on account deletion. */
export const forgetMe = (baseUrl?: string) =>
  request<null>("forgetMe", "/api/me", { method: "DELETE", auth: "required", baseUrl })
