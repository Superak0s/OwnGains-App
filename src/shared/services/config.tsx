import { getStorageItemSync, setStorageItem, removeStorageItem } from "@shared/services/sqliteStorage"
import { metric } from "@shared/services/crashReporting"

const SERVER_URL_KEY = "@server_url"
const DEFAULT_API_BASE_URL = __DEV__ ? "http://192.168.10.243:5000" : "https://owngains.superak0s.com"

function readStoredServerUrl(): string {
  try {
    return getStorageItemSync(SERVER_URL_KEY) ?? DEFAULT_API_BASE_URL
  } catch (err) {
    console.error(`Error loading ${SERVER_URL_KEY}:`, err)
    metric.count("config.server_url_failed", 1, { attributes: { op: "load" } })
    return DEFAULT_API_BASE_URL
  }
}

// Read synchronously at module init, not awaited: AuthContext.checkAuthStatus
// and localOnlyFeatures both run before any promise resolves, and with the
// default still in place they would send a self-hosted token to the public
// server and cache the wrong local-only feature list.
let currentServerUrl = readStoredServerUrl()

// ponytail: inline pub/sub, no abstraction needed for one event
const listeners: ((v: string) => void)[] = []
export const onServerUrlChange = (callback: (v: string) => void): (() => void) => {
  listeners.push(callback)
  return () => {
    const idx = listeners.lastIndexOf(callback)
    if (idx > -1) listeners.splice(idx, 1)
  }
}

// Snapshot: a listener that unsubscribes from inside its own callback would
// otherwise shift the array mid-iteration and skip the next one.
const notify = (url: string): void => { [...listeners].forEach((cb) => cb(url)) }

export const getServerUrl = (): string => currentServerUrl

interface ServerUrlValidation {
  valid: boolean
  message?: string
}

// RFC 1918 / loopback / RFC 4193 ULA / link-local ranges, matched against the
// parsed hostname (not a substring of the URL). `URL` strips the brackets from
// an IPv6 literal, so the hostname arrives bare.
export const isPrivateHost = (hostname: string): boolean => {
  if (hostname === "localhost" || hostname === "::1") return true
  // mDNS names for a self-hosted server, e.g. owngains.local
  if (hostname.toLowerCase().endsWith(".local")) return true

  const ipv6 = hostname.replace(/^\[|]$/g, "").toLowerCase()
  if (ipv6.includes(":")) {
    return /^f[cd][0-9a-f]{2}:/.test(ipv6) || /^fe[89ab][0-9a-f]:/.test(ipv6)
  }

  const match = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(hostname)
  if (!match) return false
  const a = Number(match[1])
  const b = Number(match[2])
  return a === 127 || a === 10 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/**
 * Cleartext stays enabled at the OS level so a self-hosted LAN server on an
 * arbitrary RFC 1918 address keeps working, because Android's network security config
 * cannot express address ranges. That makes this the only thing standing
 * between a mis-set or LAN-suggested URL and credentials on the wire, so it
 * lives on the request path rather than only in `setServerUrl`.
 */
export const assertSecureTransport = (url: string): void => {
  if (!/^(http|ws):\/\//i.test(url)) return

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    throw new Error("Refusing to send a request to a malformed URL")
  }

  if (!hostname || !isPrivateHost(hostname)) {
    throw new Error(
      "Refusing to send an unencrypted request to a public host. Use https://.",
    )
  }
}

/**
 * Every request appends its own leading-slash path, so anything after the
 * origin (a trailing slash copied from a browser, a path, a query) produces
 * a doubled slash or a dead URL. Normalise once on save rather than at every
 * call site.
 */
export const normalizeServerUrl = (url: string): string =>
  url.trim().replace(/^(https?:\/\/[^/?#]+)\/+$/i, "$1")

export const validateServerUrl = (url: string): ServerUrlValidation => {
  const trimmedUrl = normalizeServerUrl(url)

  if (!trimmedUrl) {
    return { valid: false, message: "Please enter a server URL" }
  }

  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    return { valid: false, message: "URL must start with http:// or https://" }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmedUrl)
  } catch {
    return { valid: false, message: "Invalid URL format" }
  }

  // React Native's URL never throws on a malformed single-argument URL, so an
  // empty hostname means there is nothing to connect to.
  if (!parsed.hostname) {
    return { valid: false, message: "Invalid URL format" }
  }

  if (parsed.pathname.replace(/\/+$/, "") !== "" || parsed.search || parsed.hash) {
    return {
      valid: false,
      message: "Enter the server address only, with no path or query (e.g. https://example.com)",
    }
  }

  if (trimmedUrl.startsWith("http://") && !isPrivateHost(parsed.hostname)) {
    return {
      valid: false,
      message: "HTTP is not secure. Please use HTTPS for production servers.",
    }
  }

  return { valid: true }
}

export const setServerUrl = async (url: string): Promise<boolean> => {
  const normalized = normalizeServerUrl(url)
  if (!validateServerUrl(normalized).valid) return false

  try {
    const previous = currentServerUrl
    await setStorageItem(SERVER_URL_KEY, normalized)
    currentServerUrl = normalized
    if (previous !== normalized) notify(normalized)
    return true
  } catch (err) {
    console.error(`Error saving ${SERVER_URL_KEY}:`, err)
    metric.count("config.server_url_failed", 1, { attributes: { op: "save" } })
    return false
  }
}

export const getDefaultServerUrl = (): string => DEFAULT_API_BASE_URL

export const resetServerUrl = async (): Promise<boolean> => {
  try {
    const previous = currentServerUrl
    await removeStorageItem(SERVER_URL_KEY)
    currentServerUrl = DEFAULT_API_BASE_URL
    if (previous !== DEFAULT_API_BASE_URL) notify(DEFAULT_API_BASE_URL)
    return true
  } catch (err) {
    console.error(`Error resetting ${SERVER_URL_KEY}:`, err)
    metric.count("config.server_url_failed", 1, { attributes: { op: "reset" } })
    return false
  }
}
