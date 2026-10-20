import { createEmitter } from "@utils/emitter"
import type { AppMode } from "./appMode"
import { trackFeature } from "./crashReporting"
import { loadFromStorage, saveToStorage } from "./storage"

/** Personal training or coaching clients. Distinct from `AppMode` (online/offline). */
export type AppRole = "personal" | "trainer"

export const APP_ROLE_KEY = "@app_role"

let role: AppRole = "personal"
let ownerId: string | null = null
const roleChange = createEmitter<AppRole>()
export const onAppRoleChange = { subscribe: roleChange.subscribe }

const emitRole = (next: AppRole): void => {
  role = next
  roleChange.trigger(next)
}

export const getAppRole = (): AppRole => role

export const setAppRole = async (next: AppRole): Promise<void> => {
  emitRole(next)
  trackFeature("trainer", "role_switch")
  await saveToStorage(APP_ROLE_KEY, next, ownerId)
}

export const restoreAppRole = async (userId: string | null): Promise<void> => {
  ownerId = userId
  const stored = userId ? await loadFromStorage<string>(APP_ROLE_KEY, userId, false) : null
  emitRole(stored === "trainer" ? "trainer" : "personal")
}

/** Coaching needs a server, so offline mode shows the personal app while keeping the stored choice. */
export const effectiveRole = (stored: AppRole, appMode: AppMode): AppRole =>
  appMode === "offline" ? "personal" : stored
