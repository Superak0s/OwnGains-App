import * as SecureStore from "expo-secure-store"
import { log, metric } from "./crashReporting"

const SECURE_TOKEN_KEY = "auth_token"
const SECURE_REFRESH_TOKEN_KEY = "auth_refresh_token"

// SecureStore throws when the keystore is unavailable (locked device, a
// keystore corrupted by a device restore). A token that cannot be read is the
// same as no token, and a token that cannot be written must not be reported to
// the caller as a failed sign-in, because the server has already created the session.
/** Resolves undefined when the store could not be read, so the caller can retry later. */
const readSecure = async (key: string): Promise<string | null | undefined> => {
  try {
    return await SecureStore.getItemAsync(key)
  } catch (error) {
    console.warn(`Secure store unavailable while reading ${key}:`, error)
    metric.count("securestore.read_failed", 1, { attributes: { key } })
    log.warn("securestore.read_failed", { key })
    return undefined
  }
}

const writeSecure = async (key: string, value: string): Promise<boolean> => {
  try {
    await SecureStore.setItemAsync(key, value)
    return true
  } catch (error) {
    console.warn(`Secure store unavailable while writing ${key}:`, error)
    metric.count("securestore.write_failed", 1, { attributes: { key } })
    log.warn("securestore.write_failed", { key })
    return false
  }
}

const deleteSecure = async (key: string): Promise<void> => {
  try {
    await SecureStore.deleteItemAsync(key)
  } catch (error) {
    console.warn(`Secure store unavailable while clearing ${key}:`, error)
    metric.count("securestore.delete_failed", 1, { attributes: { key } })
    log.warn("securestore.delete_failed", { key })
  }
}

// SecureStore reads are native round-trips and every request attaches the
// token, so each read is cached until a set or clear changes it. A read that
// resolves after a set or clear lost the race and must not overwrite it.
const cachedSecureKey = (key: string) => {
  let cached: string | null | undefined
  let version = 0
  return {
    get: async (): Promise<string | null> => {
      if (cached !== undefined) return cached
      const startedAt = version
      const value = await readSecure(key)
      if (version !== startedAt) return cached ?? null
      if (value !== undefined) cached = value
      return value ?? null
    },
    set: (token: string): Promise<boolean> => {
      version++
      cached = token
      return writeSecure(key, token)
    },
    clear: (): Promise<void> => {
      version++
      cached = null
      return deleteSecure(key)
    },
  }
}

const accessToken = cachedSecureKey(SECURE_TOKEN_KEY)
const refreshToken = cachedSecureKey(SECURE_REFRESH_TOKEN_KEY)

export const tokenStorage = {
  get: accessToken.get,
  /** Resolves false when the token could not be persisted. The in-memory session still works for this run. */
  set: accessToken.set,
  /** Access token only. A rejected access token says nothing about the refresh token. */
  clearAccess: accessToken.clear,
  clear: async (): Promise<void> => {
    await Promise.all([accessToken.clear(), refreshToken.clear()])
  },
}

/**
 * Kept in a separate key so it is never reachable from the code paths that
 * attach the access token to a request: it goes to /api/auth/refresh and
 * nowhere else. Absent until the server starts issuing one. See the rotating
 * refresh token spec in api-requests.md.
 */
export const refreshTokenStorage = refreshToken
