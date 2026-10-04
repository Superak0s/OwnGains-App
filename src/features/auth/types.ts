export type { RootStackParamList } from "@shared/types";

import type { User as AuthUser } from "@shared/types";
import { log, metric } from "@shared/services/crashReporting"
export type { User as AuthUser } from "@shared/types";

export interface ProfileUpdate {
  name?: string
  email?: string
  /** Server mode requires it whenever `email` changes. */
  currentPassword?: string
  heightCm?: number
  bfFormulaSex?: "male" | "female"
}

export interface AuthResponse {
  success: boolean
  token?: string
  /** Absent until the server supports rotating refresh tokens. */
  refreshToken?: string
  user: AuthUser
}

/**
 * A truncated or corrupt stored user must not throw: getStoredUser runs on
 * every boot and on the offline session-restore path, and an exception there
 * logs the user out with no way back in.
 */
export const parseStoredUser = (raw: string | null): AuthUser | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as AuthUser
  } catch (error) {
    console.warn("Stored user is corrupt, ignoring it", error)
    metric.count("auth.stored_user_corrupt")
    log.warn("auth.stored_user_corrupt")
    return null
  }
}
