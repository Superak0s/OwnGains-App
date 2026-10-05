import {
  getStorageItem,
  getStorageItemSync,
  setStorageItem,
} from "@shared/services/sqliteStorage"
import { setTelemetryTag, metric } from "@shared/services/crashReporting"
import { createEmitter } from "@utils/emitter"

const APP_MODE_KEY = "appMode"
export type AppMode = "online" | "offline"

let cachedMode: AppMode | null = null
let loadPromise: Promise<AppMode> | null = null

export const getAppMode = async (): Promise<AppMode> => {
  if (cachedMode) return cachedMode
  loadPromise ??= getStorageItem(APP_MODE_KEY)
    .catch(() => null)
    .then((stored) => {
      // `??=`, not `=`: setAppMode can land while this read is still in flight
      // (onboarding picks a mode within the first frames) and the stale stored
      // value must not overwrite the choice the user just made.
      cachedMode ??= (stored as AppMode) || "online"
      setTelemetryTag("app_mode", cachedMode)
      return cachedMode
    })
  return loadPromise
}

/** Synchronous, for render paths that cannot await, the same pattern as isOnboardingComplete. */
export const getAppModeSync = (): AppMode =>
  cachedMode ?? ((getStorageItemSync(APP_MODE_KEY) as AppMode) || "online")

export const setAppMode = async (mode: AppMode): Promise<boolean> => {
  // Re-picking the mode already in effect must not fire the change listeners:
  // AuthContext logs the user out on every trigger, so an unconditional write
  // would end a session the user never asked to leave. Read synchronously, not
  // via getAppMode, because a mode chosen while the initial read is still in flight
  // has to take precedence over the stored value.
  if (getAppModeSync() === mode) return true
  await setStorageItem(APP_MODE_KEY, mode)
  cachedMode = mode
  setTelemetryTag("app_mode", mode)
  metric.count("app_mode.changed", 1, { attributes: { mode } })
  onAppModeChange.trigger(mode)
  return true
}

export const isServerless = async (): Promise<boolean> =>
  (await getAppMode()) === "offline"

export const onAppModeChange = createEmitter<AppMode>()

// Onboarding is the only place the mode is chosen. The login screen and
// Settings clear this flag to send the user back there.
const ONBOARDING_KEY = "@onboarding_complete"

// Synchronous so a returning user never sees onboarding flash while an async
// read resolves.
export const isOnboardingComplete = (): boolean =>
  getStorageItemSync(ONBOARDING_KEY) === "true"

export const setOnboardingComplete = async (done: boolean): Promise<void> => {
  await setStorageItem(ONBOARDING_KEY, done ? "true" : "false")
  onOnboardingChange.trigger(done)
}

export const restartOnboarding = (): Promise<void> => setOnboardingComplete(false)

export const onOnboardingChange = createEmitter<boolean>()
