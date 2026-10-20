import { useEffect } from "react"
import { AppState } from "react-native"
import * as FileSystem from "expo-file-system/legacy"
import { fromByteArray, toByteArray } from "base64-js"
import { ApiError } from "@shared/services/apiErrorClasses"
import { getAppModeSync } from "@shared/services/appMode"
import { captureException } from "@shared/services/crashReporting"
import { isFeatureLocal } from "@shared/services/localOnlyFeatures"
import { getRecordStoreUser, readJSON } from "@shared/services/offlineHelpers"
import { listRecords } from "@shared/services/sqliteStorage"
import { getUserKey, loadFromStorage, saveToStorage } from "@shared/services/storage"
import { sha256 } from "@utils/pbkdf2"
import { trackingRelayApi } from "../services"
import type { RecipientKey } from "../services/on/trackingRelay"
import { seal } from "./trackingCrypto"

export const TRACKING_COLLECTIONS = [
  "body_weight",
  "body_fat",
  "body_measurements",
  "custom_measurement_types",
  "custom_measurement_values",
  "hydration_entries",
  "injuries",
  "macros_entries",
  "menstrual_entries",
  "personal_muscle_notes",
  "progress_photos_muscle",
  "soreness_entries",
] as const
export type TrackingCollection = (typeof TRACKING_COLLECTIONS)[number]

export const SETTINGS_KEYS = ["@off_hydration_settings", "@offline_macros_goals", "@off_menstrual_settings"]
export const PHOTO_COLLECTION = "progress_photos_muscle"
// Base64 and the box overhead must stay under the server's 3 MB per message.
const MAX_PHOTO_BYTES = 2_200_000

export interface TrackingSnapshot {
  sentAt: string
  records: Partial<Record<TrackingCollection, Record<string, unknown>[]>>
  settings: Record<string, unknown>
}

interface KeyState {
  snapshotHash: string
  sentPhotos: string[]
}

const stateKey = (keyId: number) => `@tracking_share_key_${keyId}`
const utf8 = (s: string) => new TextEncoder().encode(s)

/**
 * Reads this account's tracking data into one snapshot. Photos carry no file
 * paths, and only the ones small enough to relay are listed.
 */
export async function buildSnapshot(): Promise<{ snapshot: TrackingSnapshot; photos: { id: string; uri: string }[] }> {
  const user = getRecordStoreUser()
  const records: TrackingSnapshot["records"] = {}
  const photos: { id: string; uri: string }[] = []
  for (const collection of TRACKING_COLLECTIONS) {
    const rows = (await listRecords(getUserKey(collection, user))).map(
      (v) => JSON.parse(v) as Record<string, unknown>,
    )
    if (collection !== PHOTO_COLLECTION) {
      records[collection] = rows
      continue
    }
    records[collection] = []
    for (const { uri, thumbUri: _thumb, ...photo } of rows) {
      if (typeof uri !== "string") continue
      const info = await FileSystem.getInfoAsync(uri)
      if (!info.exists || (info.size ?? 0) > MAX_PHOTO_BYTES) continue
      photos.push({ id: String(photo.id), uri })
      records[collection].push(photo)
    }
  }
  const settings: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) settings[key] = await readJSON(key, null)
  return { snapshot: { sentAt: new Date().toISOString(), records, settings }, photos }
}

export const snapshotHash = (s: TrackingSnapshot): string =>
  fromByteArray(sha256(utf8(JSON.stringify([s.records, s.settings]))))

async function sendToKey(
  key: RecipientKey,
  snapshot: TrackingSnapshot,
  photos: { id: string; uri: string }[],
): Promise<void> {
  const user = getRecordStoreUser()
  const saved = key.resend ? null : await loadFromStorage<KeyState>(stateKey(key.keyId), user)
  const live = new Set(photos.map((p) => p.id))
  const state: KeyState = {
    snapshotHash: saved?.snapshotHash ?? "",
    sentPhotos: (saved?.sentPhotos ?? []).filter((id) => live.has(id)),
  }
  for (const photo of photos) {
    if (state.sentPhotos.includes(photo.id)) continue
    const bytes = toByteArray(
      await FileSystem.readAsStringAsync(photo.uri, { encoding: FileSystem.EncodingType.Base64 }),
    )
    await trackingRelayApi.sendMessage(key.keyId, "photo", photo.id, seal(bytes, key.publicKey))
    state.sentPhotos.push(photo.id)
    await saveToStorage(stateKey(key.keyId), state, user)
  }
  const hash = snapshotHash(snapshot)
  if (hash === state.snapshotHash) return
  await trackingRelayApi.sendMessage(key.keyId, "snapshot", "", seal(utf8(JSON.stringify(snapshot)), key.publicKey))
  state.snapshotHash = hash
  await saveToStorage(stateKey(key.keyId), state, user)
}

let running: Promise<void> | null = null

/**
 * Sends this account's tracking data, end to end encrypted, to every device of
 * every trainer it granted Tracking Access. Unchanged data isn't sent again.
 * Any failure (a 429, a full mailbox, no network) stops the run until the next one.
 */
export function shareTracking(): Promise<void> {
  running ??= (async () => {
    if (getAppModeSync() !== "online") return
    // ponytail: a server that stores tracking itself leaves the local stores empty, so nothing is shared from it.
    if (!(await isFeatureLocal("tracking"))) return
    const keys = (await trackingRelayApi.getRecipients()).flatMap((r) => r.keys)
    if (keys.length === 0) return
    const { snapshot, photos } = await buildSnapshot()
    for (const key of keys) await sendToKey(key, snapshot, photos)
  })().finally(() => {
    running = null
  })
  return running
}

const SHARE_INTERVAL_MS = 10 * 60_000

/** Shares tracking with trainers on start, on return to the app and every ten minutes. */
export function useTrackingShare(userId: string | null): void {
  useEffect(() => {
    if (!userId) return
    const share = () => {
      shareTracking().catch((error: unknown) => {
        // A full mailbox or a grant revoked mid-run clears up on its own.
        if (error instanceof ApiError && [404, 413].includes(error.status)) return
        captureException(error, { feature: "trackingShare" })
      })
    }
    share()
    const timer = setInterval(share, SHARE_INTERVAL_MS)
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") share()
    })
    return () => {
      clearInterval(timer)
      subscription.remove()
    }
  }, [userId])
}
