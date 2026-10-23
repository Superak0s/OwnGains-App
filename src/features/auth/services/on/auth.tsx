import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
} from "@shared/services/sqliteStorage"
import { assertSecureTransport, getServerUrl } from "@shared/services/config"
import { refreshTokenStorage, tokenStorage } from "@shared/services/tokenStorage"
import { buildDeviceBackup } from "@utils/deviceBackup"
import { apiCall, isCredentialRejection, parseApiResponse } from "@shared/services/apiClient"
import { ApiError, ServerUnreachableError } from "@shared/services/apiError"
import type { AuthResponse, AuthUser, ProfileUpdate } from "../../types"
import { parseStoredUser } from "../../types"
import { captureException, log, metric } from "@shared/services/crashReporting"
import { getGoogleIdToken, GoogleLinkNeedsPasswordError, type GoogleLink } from "../../googleSignIn"

const USER_KEY = "@user"
const FETCH_TIMEOUT_MS = 15000
// Logout must not hang on a dead server, and the refresh token expires on its own.
const SIGNOUT_TIMEOUT_MS = 3000
async function persistUser(user: AuthUser): Promise<void> {
  await setStorageItem(USER_KEY, JSON.stringify(user))
}

async function persistSession(data: AuthResponse): Promise<AuthResponse> {
  if (data.success && data.token) {
    await tokenStorage.set(data.token)
    if (data.refreshToken) await refreshTokenStorage.set(data.refreshToken)
    await persistUser(data.user)
  }
  return data
}

// Raw fetch rather than apiCall, which would attach the stored bearer token
// these endpoints must work without.
async function unauthenticatedCall<T>(path: string, body: unknown): Promise<T> {
  const url = `${getServerUrl()}${path}`
  assertSecureTransport(url)
  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch(
      () => {
        throw new ServerUnreachableError()
      },
    )
    return await parseApiResponse<T>(response)
  } finally {
    clearTimeout(timeoutHandle)
  }
}

export const authService = {
  signup: async (
    username: string,
    email: string,
    password: string,
    name: string | null = null,
  ): Promise<AuthResponse> => {
    return persistSession(
      await unauthenticatedCall<AuthResponse>("/api/auth/signup", {
        username,
        email,
        password,
        ...(name && { name }),
      }),
    )
  },

  signin: async (username: string, password: string): Promise<AuthResponse> => {
    return persistSession(
      await unauthenticatedCall<AuthResponse>("/api/auth/signin", { username, password }),
    )
  },

  signInWithGoogle: async (link?: GoogleLink): Promise<AuthResponse> => {
    const idToken = link?.idToken ?? (await getGoogleIdToken())
    let data: AuthResponse
    try {
      data = await unauthenticatedCall<AuthResponse>("/api/auth/google", {
        idToken,
        password: link?.password,
      })
    } catch (err) {
      if (err instanceof ApiError && err.code === "GOOGLE_LINK_NEEDS_PASSWORD") {
        const username = (err.details as { username?: string } | undefined)?.username ?? ""
        throw new GoogleLinkNeedsPasswordError(idToken, username)
      }
      throw err
    }
    return persistSession(data)
  },

  getCurrentUser: async (): Promise<AuthUser> => {
    const data = await apiCall<{ user: AuthUser }>("/api/auth/me")
    await persistUser(data.user)
    return data.user
  },

  updateProfile: async (profile: ProfileUpdate): Promise<AuthUser> => {
    const data = await apiCall<{ user: AuthUser }>("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    })
    await persistUser(data.user)
    return data.user
  },

  // Server-side proof of consent (GDPR Art. 7(1)).
  recordConsent: async (termsVersion: string, healthConsent: boolean): Promise<void> => {
    const data = await apiCall<{ user: AuthUser }>("/api/auth/consent", {
      method: "PUT",
      body: JSON.stringify({ termsVersion, healthConsent }),
    })
    // Update the cached termsVersion, or the next launch asks again.
    await persistUser(data.user)
  },

  refreshToken: async (): Promise<string | null> => {
    try {
      // A session without a refresh token can't be renewed: sign in again.
      const stored = await refreshTokenStorage.get()
      if (!stored) return null

      const data = await unauthenticatedCall<{
        token?: string
        refreshToken?: string
      }>("/api/auth/refresh", { refreshToken: stored })

      const newToken = data.token
      if (!newToken) {
        captureException(new Error("Token refresh succeeded without a token"), {
          stage: "refreshToken",
        })
        return null
      }
      // Rotation: the presented token is dead server-side, so the replacement
      // has to land before the new access token is used for anything.
      if (
        data.refreshToken &&
        !(await refreshTokenStorage.set(data.refreshToken))
      ) {
        // The old refresh token is already dead server-side, so this device
        // will be signed out on its next cold start.
        captureException(new Error("Rotated refresh token was not persisted"), {
          stage: "refreshTokenPersist",
        })
      }
      await tokenStorage.set(newToken)
      return newToken
    } catch (error) {
      // Only an explicit refusal says anything about the token's validity. An
      // unreachable or failing server is rethrown rather than treated as one.
      if (!isCredentialRejection(error)) throw error
      console.warn("Error refreshing token:", error)
      metric.count("auth.token_refresh_failed")
      log.warn("auth.token_refresh_failed")
      return null
    }
  },

  // An expired access token is cleared on its first 401, but the refresh token
  // can still restore the session.
  isAuthenticated: async (): Promise<boolean> =>
    !!(await tokenStorage.get()) || !!(await refreshTokenStorage.get()),

  logout: async (): Promise<void> => {
    const stored = await refreshTokenStorage.get()
    if (stored) {
      try {
        await apiCall("/api/auth/signout", {
          method: "POST",
          body: JSON.stringify({ refreshToken: stored, allDevices: false }),
          timeoutMs: SIGNOUT_TIMEOUT_MS,
        })
      } catch (error) {
        // A server that can't be reached must not trap the user in a session
        // they asked to end, and the token expires on its own.
        console.warn("Sign-out could not revoke the refresh token:", error)
        metric.count("auth.signout_revoke_failed")
        log.warn("auth.signout_revoke_failed")
      }
    }
    await tokenStorage.clear()
    await removeStorageItem(USER_KEY)
  },

  unlinkGoogle: async (password: string): Promise<AuthUser> => {
    const data = await apiCall<{ user: AuthUser }>("/api/auth/google", {
      method: "DELETE",
      body: JSON.stringify({ password }),
    })
    await persistUser(data.user)
    return data.user
  },

  /** A null password proves the account with a fresh Google sign-in instead. */
  deleteAccount: async (password: string | null): Promise<void> => {
    const proof = password === null ? { idToken: await getGoogleIdToken() } : { password }
    await apiCall("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify(proof),
    })
    await tokenStorage.clear()
    await removeStorageItem(USER_KEY)
  },

  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    const data = await apiCall<{ token?: string; refreshToken?: string }>(
      "/api/auth/password",
      {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword }),
      },
    )
    // The server invalidates every token on a password change (access and
    // refresh alike) and hands back replacements. Store both or this device
    // signs itself out the moment the new access token expires.
    if (data.token) await tokenStorage.set(data.token)
    if (data.refreshToken) await refreshTokenStorage.set(data.refreshToken)
  },

  // Carries the device snapshot too, not just the server's copy: progress
  // photos and any data still queued for sync live only on this device, so a
  // server-only export would quietly miss them.
  exportAccountData: async (): Promise<unknown> => {
    const data = await apiCall<{ data: unknown }>("/api/auth/account/export")
    const profile = await authService.getStoredUser()
    if (!profile) throw new Error("Not signed in")
    return buildDeviceBackup(String(profile.id), { profile, server: data.data })
  },

  getStoredUser: async (): Promise<AuthUser | null> => {
    return parseStoredUser(await getStorageItem(USER_KEY))
  },
}
