import {
  getUserKey,
  loadFromStorage,
  removeFromStorage,
  saveToStorage,
} from "./storage"
import {
  getRecord,
  listRecords,
  listRecordsBefore,
  getRecordsVersion,
  listRecordsWhere,
  type RecordCursor,
  type RecordFilter,
  putRecord,
  putRecords,
  deleteRecord,
  deleteRecords,
  clearCollection,
  renameCollection,
} from "./sqliteStorage"
import { toDateString } from "@utils/format"

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  const value = await loadFromStorage<T>(key, getRecordStoreUser())
  return value ?? fallback
}

export async function writeJSON<T>(key: string, value: T): Promise<void> {
  const ok = await saveToStorage(key, value, getRecordStoreUser())
  if (!ok) {
    throw new Error(`[offline storage] Failed to write "${key}"`)
  }
}

export interface RecordStore<T> {
  getAll(): Promise<T[]>
  /** Most recent `limit` records (by sortKey, descending). */
  getRecent(limit: number): Promise<T[]>
  /** Records with sortKey >= sinceSortKey, most recent first. */
  getSince(sinceSortKey: string): Promise<T[]>
  /** Records whose top-level fields equal `where`, most recent first. */
  getWhere(where: RecordFilter, limit?: number): Promise<T[]>
  /** Up to `limit` records strictly older than `before`, most recent first, ties broken by id. */
  getPageBefore(before: RecordCursor | null, limit: number): Promise<T[]>
  getOne(id: string | number): Promise<T | null>
  put(record: T): Promise<void>
  putMany(records: T[]): Promise<void>
  remove(id: string | number): Promise<void>
  removeMany(ids: (string | number)[]): Promise<void>
  clear(): Promise<void>
}

// kv_records has no user column, so two accounts on one device would share
// every offline record. The collection name includes the user instead, the same
// way getUserKey namespaces kv_store keys.
let activeUserId: string | null = null
const recordStoreResets: (() => void)[] = []

/**
 * The account offline data is currently scoped to. Non-record offline storage
 * (settings, goals, the offline program) must namespace its keys with this, or
 * two accounts on one device share it.
 */
export function getRecordStoreUser(): string | null {
  return activeUserId
}

export function setRecordStoreUser(userId: string | null): void {
  if (userId === activeUserId) return
  activeUserId = userId
  for (const reset of recordStoreResets) reset()
}

export function createRecordStore<T>(
  collection: string,
  legacyBlobKey: string,
  idOf: (record: T) => string | number,
  sortKeyOf: (record: T) => string,
): RecordStore<T> {
  const toWrite = (record: T) => ({
    id: String(idOf(record)),
    sortKey: sortKeyOf(record),
    value: JSON.stringify(record),
  })

  let col = getUserKey(collection, activeUserId)
  let migration: Promise<void> | null = null
  const ensureMigrated = (): Promise<void> => {
    migration ??= (async () => {
      if (col !== collection) await renameCollection(collection, col)
      const legacy = await loadFromStorage<T[]>(legacyBlobKey)
      if (legacy && legacy.length > 0) {
        await putRecords(col, legacy.map(toWrite))
      }
      await removeFromStorage(legacyBlobKey)
    })().catch((error) => {
      // Caching the rejection would break every later read and write of this
      // collection for the rest of the session over one transient failure.
      migration = null
      throw error
    })
    return migration
  }

  const inFlightReads = new Map<number | undefined, Promise<T[]>>()
  // Parsing every session ever logged on each read grows with history, so the
  // full parsed collection is kept until any record write is queued.
  let parsed: { version: number; rows: T[] } | null = null

  recordStoreResets.push(() => {
    col = getUserKey(collection, activeUserId)
    migration = null
    inFlightReads.clear()
    parsed = null
  })

  const warmRows = (): T[] | null =>
    parsed?.version === getRecordsVersion() ? parsed.rows : null

  const read = (limit?: number): Promise<T[]> => {
    const warm = warmRows()
    if (warm) return Promise.resolve(limit == null ? [...warm] : warm.slice(0, limit))
    const existing = inFlightReads.get(limit)
    if (existing) return existing.then((rows) => [...rows])
    const version = getRecordsVersion()
    const pending: Promise<T[]> = listRecords(col, limit)
      .then((rows) => {
        const records = rows.map((v) => JSON.parse(v) as T)
        if (limit == null && inFlightReads.get(limit) === pending) {
          parsed = { version, rows: records }
        }
        return records
      })
      .finally(() => {
        // Only clear our own entry: an invalidateReads in between will have
        // replaced it with a newer read that is still in flight.
        if (inFlightReads.get(limit) === pending) inFlightReads.delete(limit)
      })
    inFlightReads.set(limit, pending)
    return pending.then((rows) => [...rows])
  }

  // A read already in flight was queued before this write, so its result no
  // longer reflects the collection and must not be handed to later callers.
  const invalidateReads = (): void => {
    inFlightReads.clear()
    parsed = null
  }

  return {
    async getAll() {
      await ensureMigrated()
      return read()
    },
    async getRecent(limit) {
      await ensureMigrated()
      return read(limit)
    },
    async getSince(sinceSortKey) {
      await ensureMigrated()
      const rows = await read()
      return rows.filter((record) => sortKeyOf(record) >= sinceSortKey)
    },
    async getWhere(where, limit) {
      await ensureMigrated()
      const rows = await listRecordsWhere(col, where, limit)
      return rows.map((v) => JSON.parse(v) as T)
    },
    async getPageBefore(before, limit) {
      await ensureMigrated()
      const rows = await listRecordsBefore(col, before, limit)
      return rows.map((v) => JSON.parse(v) as T)
    },
    async getOne(id) {
      await ensureMigrated()
      const row = await getRecord(col, String(id))
      return row ? (JSON.parse(row) as T) : null
    },
    async put(record) {
      await ensureMigrated()
      const w = toWrite(record)
      invalidateReads()
      await putRecord(col, w.id, w.sortKey, w.value)
    },
    async putMany(records) {
      await ensureMigrated()
      if (records.length === 0) return
      invalidateReads()
      await putRecords(col, records.map(toWrite))
    },
    async remove(id) {
      await ensureMigrated()
      invalidateReads()
      await deleteRecord(col, String(id))
    },
    async removeMany(ids) {
      await ensureMigrated()
      if (ids.length === 0) return
      invalidateReads()
      await deleteRecords(col, ids.map(String))
    },
    async clear() {
      await ensureMigrated()
      invalidateReads()
      await clearCollection(col)
    },
  }
}

// Offline records need ids that never collide with the server's. Seeding from
// the epoch clock keeps them above any plausible server id and monotonic across
// a session.
let localIdCounter = Date.now()
export function nextLocalId(): number {
  return ++localIdCounter
}

// Read-modify-write sequences sharing a key must not interleave: two callers
// reading the same state both write back their own version and the second one
// silently drops the first one's change.
// ponytail: one lock per key covers a whole collection. Split the key if a
// single collection ever becomes a throughput bottleneck.
const locks = new Map<string, Promise<unknown>>()

export function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve()
  const result = previous.then(fn, fn)
  locks.set(
    key,
    result.catch(() => {}),
  )
  return result
}

export function nextId(counterKey: string): Promise<number> {
  return withLock(counterKey, async () => {
    const current = await readJSON<number>(counterKey, 0)
    const next = current + 1
    await writeJSON(counterKey, next)
    return next
  })
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function computeDailyStreak(timestamps: string[]): number {
  if (timestamps.length === 0) return 0

  const days = new Set(timestamps.map((t) => toDateString(t)))
  // Anchored at midday: stepping a midnight cursor back a day across a DST
  // spring-forward can re-resolve onto an unexpected local date and end the
  // walk early.
  const cursor = new Date()
  cursor.setHours(12, 0, 0, 0)
  if (!days.has(toDateString(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
    if (!days.has(toDateString(cursor))) return 0
  }

  let streak = 0
  while (days.has(toDateString(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}


