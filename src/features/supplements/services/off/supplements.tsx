import {
  computeDailyStreak,
  nextId,
  readJSON,
  writeJSON,
  createRecordStore,
  withLock,
  type RecordStore,
} from "@shared/services/offlineHelpers"
import { toDateString } from "@utils/format"
import type {
  CreateSupplementParams,
  LogSupplementParams,
  SupplementEntry,
  SupplementLogResponse,
  SupplementSummary,
  UpdateSupplementParams,
} from "../../types"


interface StoredSupplement {
  id: number
  name: string
  unit: string
  defaultAmount: number
  reminderEnabled: boolean
  reminderTime: string | null
  color: string | null
  icon: string | null
  dosesPerDay?: number
  doseIntervalMinutes?: number | null
}

/**
 * Offline ids are offset out of the server's id space. The counter starts at 1
 * and `SupplementSummary.id` is a number, so there is no `local_` convention to
 * borrow from sessions: without the offset, local supplement 3 and server
 * supplement 3 are the same id for two unrelated rows.
 */
const LOCAL_ID_BASE = 1_000_000_000

const SUPPLEMENTS_KEY = "@offline:supplements:list"
const SUPPLEMENT_ID_COUNTER = "@offline:supplements:id_counter"
const ENTRY_ID_COUNTER = "@offline:supplements:entry_id_counter"
const entriesKey = (id: number) => `@offline:supplements:${id}:entries`

async function getAllSupplements(): Promise<StoredSupplement[]> {
  return readJSON<StoredSupplement[]>(SUPPLEMENTS_KEY, [])
}

async function saveAllSupplements(list: StoredSupplement[]): Promise<void> {
  await writeJSON(SUPPLEMENTS_KEY, list)
}

// Each supplement's log history is its own row-per-record collection, so
// logging one dose doesn't rewrite that supplement's *entire* log blob
// (potentially a year of daily entries).
const entryStores = new Map<number, RecordStore<SupplementEntry>>()
function entryStoreFor(id: number): RecordStore<SupplementEntry> {
  let store = entryStores.get(id)
  if (!store) {
    store = createRecordStore<SupplementEntry>(
      `supplement_entries_${id}`,
      entriesKey(id),
      (e) => e.id,
      (e) => e.takenAt,
    )
    entryStores.set(id, store)
  }
  return store
}

async function getEntries(id: number): Promise<SupplementEntry[]> {
  return entryStoreFor(id).getAll()
}

// A year of daily logs per supplement is thousands of rows read and parsed on
// every list() and every pull-to-refresh. The streak walk stops at the first
// missing day, so a bounded window answers it, and only a streak that extends to
// the window edge needs the full history.
const STREAK_WINDOW_DAYS = 400

async function getEntriesForSummary(id: number): Promise<SupplementEntry[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - STREAK_WINDOW_DAYS)
  const recent = await entryStoreFor(id).getSince(cutoff.toISOString())
  const streak = computeDailyStreak(recent.map((e) => e.takenAt))
  return streak >= STREAK_WINDOW_DAYS ? getEntries(id) : recent
}

function requireSupplement(
  list: StoredSupplement[],
  id: number,
): StoredSupplement {
  const found = list.find((s) => s.id === id)
  if (!found) throw new Error(`Supplement ${id} not found`)
  return found
}

async function toSummary(s: StoredSupplement): Promise<SupplementSummary> {
  const entries = await getEntriesForSummary(s.id)
  const timestamps = entries.map((e) => e.takenAt)
  const streak = computeDailyStreak(timestamps)
  const now = Date.now()
  const todayKey = toDateString(new Date(now))
  const dosesToday = entries.filter(
    (e) => toDateString(e.takenAt) === todayKey,
  ).length
  const lastTakenAt =
    entries
      .map((e) => e.takenAt)
      .filter((t) => new Date(t).getTime() <= now)
      .sort((a, b) => a.localeCompare(b))
      .at(-1) ?? null
  return {
    id: s.id,
    name: s.name,
    unit: s.unit,
    defaultAmount: s.defaultAmount,
    reminderEnabled: s.reminderEnabled,
    reminderTime: s.reminderTime,
    color: s.color,
    icon: s.icon,
    dosesPerDay: s.dosesPerDay ?? 1,
    doseIntervalMinutes: s.doseIntervalMinutes ?? null,
    takenToday: dosesToday > 0,
    dosesToday,
    lastTakenAt,
    streak,
  }
}


// create/update/delete are read-modify-write over one stored list, so two
// overlapping calls would each write back their own copy and lose the other's.
const SUPPLEMENTS_LOCK = "supplements"

export const supplementsApi = {

  list: async (): Promise<{
    success: boolean
    supplements: SupplementSummary[]
  }> => {
    const list = await getAllSupplements()
    const supplements = await Promise.all(list.map(toSummary))
    return { success: true, supplements }
  },

  create: async (
    params: CreateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> =>
    withLock(SUPPLEMENTS_LOCK, async () => {
      const list = await getAllSupplements()
      const id = LOCAL_ID_BASE + (await nextId(SUPPLEMENT_ID_COUNTER))
    const supplement: StoredSupplement = {
      id,
      name: params.name,
      unit: params.unit ?? "g",
      defaultAmount: params.defaultAmount ?? 1,
      reminderEnabled: params.reminderEnabled ?? false,
      reminderTime: params.reminderTime ?? null,
      color: params.color ?? null,
      icon: params.icon ?? null,
      dosesPerDay: params.dosesPerDay ?? 1,
      doseIntervalMinutes: params.doseIntervalMinutes ?? null,
    }
      list.push(supplement)
      await saveAllSupplements(list)
      return { success: true, supplement: await toSummary(supplement) }
    }),

  update: async (
    id: number,
    params: UpdateSupplementParams,
  ): Promise<{ success: boolean; supplement: SupplementSummary }> =>
    withLock(SUPPLEMENTS_LOCK, async () => {
      const list = await getAllSupplements()
      const stored = requireSupplement(list, id)

      if (params.name !== undefined) stored.name = params.name
      if (params.unit !== undefined) stored.unit = params.unit
      if (params.defaultAmount !== undefined)
        stored.defaultAmount = params.defaultAmount
      if (params.reminderEnabled !== undefined)
        stored.reminderEnabled = params.reminderEnabled
      if (params.reminderTime !== undefined)
        stored.reminderTime = params.reminderTime
      if (params.color !== undefined) stored.color = params.color
      if (params.icon !== undefined) stored.icon = params.icon
      if (params.dosesPerDay !== undefined)
        stored.dosesPerDay = params.dosesPerDay
      if (params.doseIntervalMinutes !== undefined)
        stored.doseIntervalMinutes = params.doseIntervalMinutes

      await saveAllSupplements(list)
      return { success: true, supplement: await toSummary(stored) }
    }),

  delete: async (id: number): Promise<{ success: boolean }> =>
    withLock(SUPPLEMENTS_LOCK, async () => {
      const list = await getAllSupplements()
      // Matches the online 404 rather than reporting success for a deletion
      // that did not happen.
      requireSupplement(list, id)
      const remaining = list.filter((s) => s.id !== id)
      await saveAllSupplements(remaining)
      await entryStoreFor(id).clear()
      entryStores.delete(id)
      return { success: true }
    }),


  log: async (
    id: number,
    params: LogSupplementParams = {},
  ): Promise<{ success: boolean; id: number; streak: number }> => {
    const list = await getAllSupplements()
    const stored = requireSupplement(list, id)
    const entries = await getEntriesForSummary(id)

    const entryId = LOCAL_ID_BASE + (await nextId(ENTRY_ID_COUNTER))
    const entry: SupplementEntry = {
      id: entryId,
      supplementId: id,
      amount: params.amount ?? stored.defaultAmount,
      takenAt: params.takenAt ?? new Date().toISOString(),
      note: params.note ?? null,
      createdAt: new Date().toISOString(),
    }
    await entryStoreFor(id).put(entry)

    const streak = computeDailyStreak([...entries.map((e) => e.takenAt), entry.takenAt])
    return { success: true, id: entryId, streak }
  },

  getLog: async (id: number, limit = 30): Promise<SupplementLogResponse> => {
    const list = await getAllSupplements()
    requireSupplement(list, id)
    const recent = await getEntriesForSummary(id)
    const entries = recent.length < limit ? await getEntries(id) : recent
    const sorted = [...entries].sort(
      (a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime(),
    )
    const limited = sorted.slice(0, limit)

    const streak = computeDailyStreak(entries.map((e) => e.takenAt))
    const todayKey = toDateString(new Date())
    const todayEntry =
      sorted.find((e) => toDateString(e.takenAt) === todayKey) ??
      null

    return {
      success: true,
      entries: limited,
      streak,
      takenToday: todayEntry !== null,
      todayEntry,
    }
  },

  deleteLogEntry: async (
    supplementId: number,
    entryId: number,
  ): Promise<{ success: boolean }> => {
    requireSupplement(await getAllSupplements(), supplementId)
    const store = entryStoreFor(supplementId)
    if (!(await store.getOne(entryId))) {
      throw new Error(`Log entry ${entryId} not found`)
    }
    await store.remove(entryId)
    return { success: true }
  },
}
