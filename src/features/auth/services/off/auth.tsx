import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  clearUserData,
} from "@shared/services/sqliteStorage"
import { buildDeviceBackup, deletePhotoFilesFor } from "@utils/deviceBackup"
import { tokenStorage } from "@shared/services/tokenStorage"
import { generateId } from "@utils/format"
import { OFFLINE_UNAVAILABLE_MESSAGE } from "@shared/services/apiError"
import type { AuthResponse, AuthUser, ProfileUpdate } from "../../types"
import { parseStoredUser } from "../../types"
import type { GoogleLink } from "../../googleSignIn"

const LOCAL_USER_KEY = "@offline_user"
const LOCAL_USER_ID = "local"

// checkAuthStatus calls isAuthenticated() then getCurrentUser() back to
// back on every app boot. Both resolve to the same stored user, so cache
// it in memory instead of hitting SQLite twice. Invalidated on every write.
let cachedUser: AuthUser | null | undefined

export const authService = {
  signup: async (
    username: string,
    email: string,
    _password: string,
    name: string | null = null,
  ): Promise<AuthResponse> => {
    const user: AuthUser = {
      id: LOCAL_USER_ID,
      username,
      email,
      ...(name && { name }),
    }
    await setStorageItem(LOCAL_USER_KEY, JSON.stringify(user))
    cachedUser = user
    await tokenStorage.set(generateId("offline"))
    return { success: true, token: "offline", user }
  },

  signin: async (
    username: string,
    _password: string,
  ): Promise<AuthResponse> => {
    const existing = await authService.getStoredUser()
    // A profile name typed on the login screen renames the profile rather than
    // being discarded. Before Settings opens, this is the only place to rename it.
    const renamed =
      existing && username && username !== existing.username
        ? { ...existing, username }
        : existing
    const user: AuthUser = renamed ?? { id: LOCAL_USER_ID, username, email: "" }
    await setStorageItem(LOCAL_USER_KEY, JSON.stringify(user))
    cachedUser = user
    await tokenStorage.set(generateId("offline"))
    return { success: true, token: "offline", user }
  },

  signInWithGoogle: async (_link?: GoogleLink): Promise<AuthResponse> => {
    throw new Error(OFFLINE_UNAVAILABLE_MESSAGE)
  },

  unlinkGoogle: async (_password: string): Promise<AuthUser> => {
    throw new Error(OFFLINE_UNAVAILABLE_MESSAGE)
  },

  getCurrentUser: async (): Promise<AuthUser> => {
    const user = await authService.getStoredUser()
    if (!user) throw new Error("No local profile found")
    return user
  },

  updateProfile: async (profile: ProfileUpdate): Promise<AuthUser> => {
    const existing = (await authService.getStoredUser()) || {
      id: LOCAL_USER_ID,
      username: "me",
      email: "",
    }
    const { currentPassword: _currentPassword, ...fields } = profile
    const updated: AuthUser = { ...existing, ...fields }
    await setStorageItem(LOCAL_USER_KEY, JSON.stringify(updated))
    cachedUser = updated
    return updated
  },

  // Nothing leaves the device offline, and termsAcceptance keeps the record.
  recordConsent: async (
    _termsVersion: string,
    _healthConsent: boolean,
    _strict = false,
  ): Promise<void> => {},

  // The session token, not the profile row: logging out must not destroy the
  // name, email, height and body-fat settings the profile includes.
  isAuthenticated: async (): Promise<boolean> => {
    return !!(await tokenStorage.get())
  },

  logout: async (): Promise<void> => {
    await tokenStorage.clear()
  },

  deleteAccount: async (_password: string | null): Promise<void> => {
    // Photo files are referenced only from the user's rows, so they have to be
    // removed before those rows go.
    await deletePhotoFilesFor(LOCAL_USER_ID)
    await clearUserData(LOCAL_USER_ID)
    await removeStorageItem(LOCAL_USER_KEY)
    cachedUser = null
    await tokenStorage.clear()
  },

  // An offline profile has no password (signin accepts anything), so there
  // is nothing to change. Settings hides the option in offline mode. This
  // exists so the on/off service contract stays symmetrical.
  changePassword: async (
    _currentPassword: string,
    _newPassword: string,
  ): Promise<void> => {
    throw new Error("Offline profiles are not password protected")
  },

  exportAccountData: async (): Promise<unknown> =>
    buildDeviceBackup(LOCAL_USER_ID, { profile: await authService.getStoredUser() }),

  getStoredUser: async (): Promise<AuthUser | null> => {
    if (cachedUser !== undefined) return cachedUser
    cachedUser = parseStoredUser(await getStorageItem(LOCAL_USER_KEY))
    return cachedUser
  },

  refreshToken: async (): Promise<string | null> => {
    const user = await authService.getStoredUser()
    if (!user) return null
    const token = generateId("offline")
    await tokenStorage.set(token)
    return token
  },
}
