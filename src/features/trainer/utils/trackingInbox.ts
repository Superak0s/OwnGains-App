import * as FileSystem from "expo-file-system/legacy"
import { fromByteArray } from "base64-js"
import { getRecordStoreUser } from "@shared/services/offlineHelpers"
import { replaceCollection } from "@shared/services/sqliteStorage"
import { getUserKey, loadFromStorage, removeFromStorage, saveToStorage } from "@shared/services/storage"
import { metric } from "@shared/services/crashReporting"
import { trackingRelayApi } from "../services"
import type { ClientSummary } from "../types"
import { getDeviceKey, open, type DeviceKey } from "./trackingCrypto"
import {
  PHOTO_COLLECTION,
  SETTINGS_KEYS,
  TRACKING_COLLECTIONS,
  type TrackingCollection,
  type TrackingSnapshot,
} from "./trackingShare"

/** A client's tracking data as last received on this phone. */
export interface TrackingCopy {
  snapshot: TrackingSnapshot
  receivedAt: string
}

const INDEX_KEY = "@trainer_tracking_clients"
const copyKey = (clientId: string) => `@trainer_tracking_copy_${clientId}`
const MAX_PAGES = 20
// Ids come from another user's phone and become file names, so anything that could leave the folder is dropped.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/

const photoDir = (clientId: string) =>
  `${FileSystem.documentDirectory}trainer-tracking/${getRecordStoreUser() ?? "anon"}/${clientId}/`
export const trackingPhotoUri = (clientId: string, photoId: string) => `${photoDir(clientId)}${photoId}.jpg`

// Must match each offline tracking store's sortKeyOf, or the copy reads back out of order.
const SORT_FIELD: Record<TrackingCollection, string> = {
  body_weight: "recordedAt",
  body_fat: "calculatedAt",
  body_measurements: "measuredAt",
  custom_measurement_types: "createdAt",
  custom_measurement_values: "measuredAt",
  hydration_entries: "loggedAt",
  injuries: "startDate",
  macros_entries: "takenAt",
  menstrual_entries: "cycleStart",
  personal_muscle_notes: "createdAt",
  progress_photos_muscle: "takenAt",
  soreness_entries: "loggedAt",
}

/** The record-store account a client's copy is unpacked under, apart from this account's own data. */
export const trackingViewUser = (clientId: string) => `trainer-copy-${getRecordStoreUser() ?? "anon"}-${clientId}`

/** Unpacks a client's copy into record stores, so the Tracking screen can read it like local data. */
export async function unpackTrackingCopy(clientId: string, copy: TrackingCopy): Promise<void> {
  const user = trackingViewUser(clientId)
  for (const collection of TRACKING_COLLECTIONS) {
    const sent = copy.snapshot.records[collection]
    const rows = (Array.isArray(sent) ? sent : []).filter(
      (r) => collection !== PHOTO_COLLECTION || SAFE_ID.test(String(r.id)),
    )
    await replaceCollection(
      getUserKey(collection, user),
      rows.map((r) => {
        const id = String(r.id)
        const uri = trackingPhotoUri(clientId, id)
        return {
          id,
          sortKey: String(r[SORT_FIELD[collection]] ?? ""),
          value: JSON.stringify(collection === PHOTO_COLLECTION ? { ...r, uri, thumbUri: uri } : r),
        }
      }),
    )
  }
  for (const key of SETTINGS_KEYS) {
    const value = copy.snapshot.settings[key]
    if (value == null) await removeFromStorage(key, user)
    else await saveToStorage(key, value, user)
  }
}

export const loadTrackingCopy = (clientId: string): Promise<TrackingCopy | null> =>
  loadFromStorage<TrackingCopy>(copyKey(clientId), getRecordStoreUser())

const loadIndex = async () => (await loadFromStorage<string[]>(INDEX_KEY, getRecordStoreUser())) ?? []

let registered: { user: string | null; key: Promise<DeviceKey> } | null = null

/** This phone's key, registered with the server once per account per app run. */
function registeredKey(): Promise<DeviceKey> {
  const user = getRecordStoreUser()
  if (registered?.user !== user) {
    const key = getDeviceKey().then(async (k) => {
      await trackingRelayApi.registerDeviceKey(k.deviceId, k.publicKey)
      return k
    })
    key.catch(() => {
      registered = null
    })
    registered = { user, key }
  }
  return registered.key
}

async function storeSnapshot(clientId: string, snapshot: TrackingSnapshot): Promise<boolean> {
  const user = getRecordStoreUser()
  await saveToStorage(copyKey(clientId), { snapshot, receivedAt: new Date().toISOString() }, user)
  const index = await loadIndex()
  if (!index.includes(clientId)) await saveToStorage(INDEX_KEY, [...index, clientId], user)

  const listed = new Set(
    (snapshot.records[PHOTO_COLLECTION] ?? []).map((p) => String(p.id)).filter((id) => SAFE_ID.test(id)).map((id) => `${id}.jpg`),
  )
  const dir = photoDir(clientId)
  const files = (await FileSystem.getInfoAsync(dir)).exists ? await FileSystem.readDirectoryAsync(dir) : []
  for (const f of files) if (!listed.has(f)) await FileSystem.deleteAsync(dir + f, { idempotent: true })
  return [...listed].some((f) => !files.includes(f))
}

/**
 * Collects what clients sent to this phone, decrypts and stores it, and asks
 * a client to send everything again when a listed photo never arrived.
 *
 * @returns The clients whose data changed.
 */
export async function syncTrackingInbox(): Promise<string[]> {
  const key = await registeredKey()
  const changed = new Set<string>()
  const resend = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    const messages = await trackingRelayApi.getMessages(key.deviceId)
    if (messages.length === 0) break
    for (const m of messages) {
      if (!SAFE_ID.test(m.clientId) || (m.kind === "photo" && !SAFE_ID.test(m.ref))) continue
      const plain = open(m, key.secretKey)
      if (!plain) {
        metric.count("trainer.tracking_decrypt_failed", 1, { attributes: { kind: m.kind } })
        resend.add(m.clientId)
        continue
      }
      if (m.kind === "photo") {
        await FileSystem.makeDirectoryAsync(photoDir(m.clientId), { intermediates: true })
        await FileSystem.writeAsStringAsync(trackingPhotoUri(m.clientId, m.ref), fromByteArray(plain), {
          encoding: FileSystem.EncodingType.Base64,
        })
      } else {
        const snapshot = JSON.parse(new TextDecoder().decode(plain)) as TrackingSnapshot
        if (await storeSnapshot(m.clientId, snapshot)) resend.add(m.clientId)
        else resend.delete(m.clientId)
      }
      changed.add(m.clientId)
    }
    await trackingRelayApi.ackMessages(key.deviceId, messages.map((m) => m.id))
  }
  for (const clientId of resend) await trackingRelayApi.requestResend(key.deviceId, clientId)
  return [...changed]
}

/** Deletes the copy of every client who no longer shares tracking with this account. */
export async function purgeTrackingCopies(clients: ClientSummary[]): Promise<void> {
  const keep = new Set(clients.filter((c) => c.hasTrackingAccess).map((c) => String(c.userId)))
  const index = await loadIndex()
  const gone = index.filter((id) => !keep.has(id))
  if (gone.length === 0) return
  for (const id of gone) {
    await removeFromStorage(copyKey(id), getRecordStoreUser())
    await unpackTrackingCopy(id, { snapshot: { sentAt: "", records: {}, settings: {} }, receivedAt: "" })
    await FileSystem.deleteAsync(photoDir(id), { idempotent: true })
  }
  await saveToStorage(INDEX_KEY, index.filter((id) => keep.has(id)), getRecordStoreUser())
}
