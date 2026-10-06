import { getStorageItem, getStorageItems, setStorageItem, removeStorageItem, removeStorageItems } from "@shared/services/sqliteStorage"
import { captureException, metric } from "@shared/services/crashReporting"

export const getUserKey = (key: string, userId: string | null = null): string => {
  if (!userId) return key
  return `${key}_user_${userId}`
}

export const saveToStorage = async (
  key: string,
  value: unknown,
  userId: string | null = null,
): Promise<boolean> => {
  try {
    const storageKey = getUserKey(key, userId)
    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value)
    await setStorageItem(storageKey, stringValue)
    return true
  } catch (error) {
    console.error(`Error saving ${key}:`, error)
    metric.count("storage.op_failed", 1, { attributes: { op: "save", key } })
    return false
  }
}

export const loadFromStorage = async <T = unknown,>(
  key: string,
  userId: string | null = null,
  parse: boolean = true,
): Promise<T | null> => {
  try {
    const storageKey = getUserKey(key, userId)
    const value = await getStorageItem(storageKey)

    if (!value) return null

    return (parse ? JSON.parse(value) : value) as T
  } catch (error) {
    console.error(`Error loading ${key}:`, error)
    metric.count("storage.op_failed", 1, { attributes: { op: "load", key } })
    // SQLite failures are already reported to Sentry through the storage error handler.
    // A corrupt stored value only shows up as a parse failure here.
    captureException(error, { op: "load", key })
    return null
  }
}

export const loadMultipleFromStorage = async (
  keys: string[],
  userId: string | null = null,
): Promise<Record<string, string>> => {
  const storageKeys = keys.map((key) => getUserKey(key, userId))
  const values = await getStorageItems(storageKeys)
  const result: Record<string, string> = {}
  keys.forEach((key, i) => {
    const value = values[storageKeys[i]]
    if (value !== undefined) result[key] = value
  })
  return result
}

export const removeFromStorage = async (
  key: string,
  userId: string | null = null,
): Promise<boolean> => {
  try {
    const storageKey = getUserKey(key, userId)
    await removeStorageItem(storageKey)
    return true
  } catch (error) {
    console.error(`Error removing ${key}:`, error)
    metric.count("storage.op_failed", 1, { attributes: { op: "remove", key } })
    return false
  }
}

export const removeMultipleFromStorage = async (
  keys: string[],
  userId: string | null = null,
): Promise<boolean> => {
  try {
    const storageKeys = keys.map((key) => getUserKey(key, userId))
    await removeStorageItems(storageKeys)
    return true
  } catch (error) {
    console.error("Error removing multiple items:", error)
    metric.count("storage.op_failed", 1, { attributes: { op: "removeMany" } })
    return false
  }
}

export const STORAGE_KEYS = {
  WORKOUT_DATA: "workoutData",
  // Value predates the person→split rename. Changing it would orphan every
  // existing install's saved selection.
  SELECTED_SPLIT: "selectedPerson",
  CURRENT_DAY: "currentDay",
  COMPLETED_DAYS: "completedDays",
  LOCKED_DAYS: "lockedDays",
  UNLOCKED_OVERRIDES: "unlockedOverrides",
  LAST_RESET_DATE: "lastResetDate",
  TIME_BETWEEN_SETS: "timeBetweenSets",
  REST_REMINDER_SECONDS: "restReminderSeconds",
  REST_BY_EXERCISE: "restByExercise",
  WORKOUT_START_TIME: "workoutStartTime",
  CURRENT_SESSION_ID: "currentSessionId",
  USE_MANUAL_TIME: "useManualTime",
  PENDING_SYNCS: "pendingSyncs",
  LAST_ACTIVITY_TIME: "lastActivityTime",
  LAST_SET_END_TIME: "lastSetEndTime",
  SESSION_DAY_OVERRIDE: "sessionDayOverride",
  WEIGHT_UNIT: "weight_unit",
  HOME_WIDGETS: "homeWidgets",
  WORKOUT_WIDGETS: "workoutWidgets",
  PLAN_WIDGETS: "planWidgets",
  ANALYTICS_WIDGETS: "analyticsWidgets",
  WEIGHT_TAB_WIDGETS: "trackingScreen_weightWidgets",
  PHOTOS_TAB_WIDGETS: "trackingScreen_photosWidgets",
  MACROS_TAB_WIDGETS: "trackingScreen_macrosWidgets",
  BODYFAT_TAB_WIDGETS: "trackingScreen_bodyfatWidgets",
  MEASUREMENTS_TAB_WIDGETS: "trackingScreen_measurementsWidgets",
  HYDRATION_TAB_WIDGETS: "trackingScreen_hydrationWidgets",
  HYDRATION_PRESETS: "tracking_hydration_presets",
  HYDRATION_NOTIFICATION: "tracking_hydration_notification",
  MACROS_SAVED_FOODS: "tracking_macros_saved_foods",
  SORENESS_TAB_WIDGETS: "trackingScreen_sorenessWidgets",
  MENSTRUAL_TAB_WIDGETS: "trackingScreen_menstrualWidgets",
  MENSTRUAL_PREFS: "tracking_menstrual_prefs",
  FRIENDS_TAB_WIDGETS: "friendsScreen_friendsWidgets",
  REQUESTS_TAB_WIDGETS: "friendsScreen_requestsWidgets",
  SEARCH_TAB_WIDGETS: "friendsScreen_searchWidgets",
  UNDERTRAINED_DISPLAY_MODE: "undertrainedDisplayMode",
  UNDERTRAINED_CALCULATION_MODE: "undertrainedCalculationMode",
  PR_CELEBRATION: "prCelebration",
  AUTO_PROGRESSION: "autoProgression",
  PROGRAM_DIRTY: "programDirty",
  HEALTH_CONNECT_IMPORTED: "healthConnectImported",
  HEALTH_CONNECT_LAST_SYNC: "healthConnectLastSync",
} as const

