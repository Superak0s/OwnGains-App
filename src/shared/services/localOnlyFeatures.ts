import { apiCall } from "./apiClient"
import { isServerless } from "./appMode"
import { getServerUrl, onServerUrlChange } from "./config"
import { loadFromStorage, saveToStorage } from "./storage"
import { setTelemetryTag } from "./crashReporting"

const STORAGE_KEY = "@local_only_features"
const UNREACHABLE_RETRY_MS = 60_000
const MAX_UNREACHABLE_RETRY_MS = 30 * 60_000

// Every feature a server can refuse. Used until the server answers, so a first
// launch with no network never sends health data to one that won't keep it.
const ALL_LOCAL_ONLY = ["tracking", "supplements"]

const LABELS: Record<string, string> = {
  tracking: "Body tracking",
  supplements: "Supplements",
}

/**
 * Features the configured server refuses to store (its `LOCAL_ONLY_FEATURES`
 * env var), published on `/healthz`. The client logs those on-device instead,
 * so it must still work on a cold start with no network: the last known list is
 * persisted and used immediately while a refresh runs in the background.
 * Unknown means "stores nothing" on any server: until it has answered, health
 * data stays on the device rather than going to a server that may refuse it.
 */
let cached: string[] | null = null
let primed: Promise<void> | null = null
let retryAfter = 0
let unreachableStreak = 0

interface StoredList {
  url: string
  features: string[]
}

export interface LocalOnlyChange {
  nowLocal: string[]
  nowOnServer: string[]
}

const adopt = (features: string[]): void => {
  cached = features
  setTelemetryTag("local_only", features.join(",") || "none")
}

let pendingChange: LocalOnlyChange | null = null
const changeListeners = new Set<(change: LocalOnlyChange) => void>()

/**
 * Fires when the same server starts or stops storing a feature. Records logged
 * under the old routing aren't moved, so they drop out of view until it flips
 * back. A change seen before anyone subscribed is delivered on subscribe.
 */
export const onLocalOnlyFeaturesChange = (
  listener: (change: LocalOnlyChange) => void,
): (() => void) => {
  changeListeners.add(listener)
  if (pendingChange) {
    listener(pendingChange)
    pendingChange = null
  }
  return () => {
    changeListeners.delete(listener)
  }
}

const announceChange = (previous: string[], next: string[]): void => {
  const change = {
    nowLocal: next.filter((feature) => !previous.includes(feature)),
    nowOnServer: previous.filter((feature) => !next.includes(feature)),
  }
  if (!change.nowLocal.length && !change.nowOnServer.length) return
  if (changeListeners.size === 0) pendingChange = change
  changeListeners.forEach((listener) => listener(change))
}

/**
 * Returns null when the server didn't answer. That is unknown, which is not the same
 * as "stores everything", so callers that warn the user say nothing instead of
 * promising something this server never said.
 */
export const refreshLocalOnlyFeatures = async (): Promise<string[] | null> => {
  if (await isServerless()) return null
  const url = getServerUrl()
  try {
    const data = await apiCall<{ localOnlyFeatures?: string[] }>("/healthz")
    const features = data.localOnlyFeatures ?? []
    // The server may have been switched while this was in flight. This answer
    // describes the previous one, so it must not be adopted or persisted.
    if (getServerUrl() !== url) return null
    if (cached !== null) announceChange(cached, features)
    adopt(features)
    await saveToStorage(STORAGE_KEY, { url, features })
    return features
  } catch {
    // Unreachable server: keep the persisted list rather than silently
    // routing on-device data back to a server that may not accept it.
    return null
  }
}

/**
 * The server answered FEATURE_LOCAL_ONLY: it stopped storing `feature` since
 * the list was last read. Adopt that at once so no further call goes out, then
 * re-read /healthz for the rest of the list.
 */
export const markFeatureLocal = async (feature: string): Promise<void> => {
  if (cached === null || cached.includes(feature)) return
  const next = [...cached, feature]
  announceChange(cached, next)
  adopt(next)
  await saveToStorage(STORAGE_KEY, { url: getServerUrl(), features: next })
  void refreshLocalOnlyFeatures()
}

const prime = (): Promise<void> =>
  (primed ??= (async () => {
    const stored = await loadFromStorage<StoredList>(STORAGE_KEY)
    // Pinned to the server it came from, since another server has its own config,
    // and assuming this one's answer would route data to the wrong place.
    if (stored?.url === getServerUrl()) {
      adopt(stored.features)
      void refreshLocalOnlyFeatures()
      return
    }
    // Nothing known for this server: wait for the answer rather than guessing
    // "stores everything". If it never came, guess for the backoff window
    // instead of making every service call wait out /healthz again. Each
    // consecutive failure doubles the window so an offline server costs one
    // /healthz stall per retry, not per service call.
    const features = await refreshLocalOnlyFeatures()
    if (features === null) {
      primed = null
      unreachableStreak += 1
      retryAfter =
        Date.now() +
        Math.min(
          UNREACHABLE_RETRY_MS * 2 ** (unreachableStreak - 1),
          MAX_UNREACHABLE_RETRY_MS,
        )
    } else {
      unreachableStreak = 0
    }
  })())

export const getLocalOnlyFeatures = async (): Promise<string[]> => {
  if (cached === null && Date.now() >= retryAfter) await prime()
  if (cached) return cached
  if (await isServerless()) return []
  return ALL_LOCAL_ONLY
}

/** Health features the current server is known to store, null until it has answered. */
export const getServerStoredFeatures = (): string[] | null =>
  cached && ALL_LOCAL_ONLY.filter((feature) => !cached!.includes(feature))

export const isFeatureLocal = async (feature: string): Promise<boolean> =>
  (await getLocalOnlyFeatures()).includes(feature)

/** "Body tracking and Supplements", for user-facing copy. */
export const describeLocalOnlyFeatures = (features: string[]): string => {
  const labels = features.map((feature) => LABELS[feature] ?? feature)
  if (labels.length < 2) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`
}

onServerUrlChange(() => {
  cached = null
  pendingChange = null
  primed = null
  retryAfter = 0
  unreachableStreak = 0
})
