/**
 * In-memory stand-in for `@shared/services/sqliteStorage`, so offline services
 * can be tested through the real storage/offlineHelpers layers instead of
 * mocking each of them out.
 *
 * Usage:
 *   jest.mock("@shared/services/sqliteStorage", () => require("@test-utils/memorySqlite"))
 *   import { resetMemorySqlite } from "@test-utils/memorySqlite"
 */

type Row = { id: string; sortKey: string; value: string }

export const kv: Record<string, string> = {}
export const collections: Record<string, Row[]> = {}

export function resetMemorySqlite(): void {
  for (const k of Object.keys(kv)) delete kv[k]
  for (const k of Object.keys(collections)) delete collections[k]
}

const rowsOf = (c: string): Row[] => (collections[c] ??= [])
const newestFirst = (rows: Row[]): Row[] =>
  [...rows].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))

const upsert = (c: string, row: Row): void => {
  const rows = rowsOf(c)
  const i = rows.findIndex((r) => r.id === row.id)
  if (i === -1) rows.push(row)
  else rows[i] = row
}

export const getStorageItem = jest.fn(async (k: string) => kv[k] ?? null)

export const getStorageItemSync = jest.fn((k: string) => kv[k] ?? null)

export const getStorageItems = jest.fn(async (keys: string[]) => {
  const out: Record<string, string> = {}
  keys.forEach((k) => {
    if (kv[k] !== undefined) out[k] = kv[k]
  })
  return out
})

export const setStorageItem = jest.fn(async (k: string, v: string) => {
  kv[k] = v
})

export const removeStorageItem = jest.fn(async (k: string) => {
  delete kv[k]
})

export const removeStorageItems = jest.fn(async (keys: string[]) => {
  keys.forEach((k) => delete kv[k])
})

export const getRecord = jest.fn(
  async (c: string, id: string) =>
    rowsOf(c).find((r) => r.id === id)?.value ?? null,
)

export const listRecords = jest.fn(async (c: string, limit?: number) => {
  const values = newestFirst(rowsOf(c)).map((r) => r.value)
  return limit == null ? values : values.slice(0, limit)
})

let versionReads = 0
// A fresh value per call keeps the record store's parsed cache cold, as no write here bumps it.
export const getRecordsVersion = jest.fn(() => ++versionReads)

export const listRecordsBefore = jest.fn(
  async (c: string, before: { sortKey: string; id: string } | null, limit: number) =>
    [...rowsOf(c)]
      .sort((a, b) => {
        if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? 1 : -1
        return a.id < b.id ? 1 : -1
      })
      .filter(
        (r) =>
          !before ||
          r.sortKey < before.sortKey ||
          (r.sortKey === before.sortKey && r.id < before.id),
      )
      .slice(0, limit)
      .map((r) => r.value),
)

export const listRecordsWhere = jest.fn(
  async (c: string, where: Record<string, string | number>, limit?: number) => {
    const values = newestFirst(rowsOf(c))
      .map((r) => r.value)
      .filter((v) => {
        const parsed = JSON.parse(v) as Record<string, unknown>
        return Object.entries(where).every(([k, want]) => parsed[k] === want)
      })
    return limit == null ? values : values.slice(0, limit)
  },
)

export const putRecord = jest.fn(
  async (c: string, id: string, sortKey: string, value: string) => {
    upsert(c, { id, sortKey, value })
  },
)

export const putRecords = jest.fn(async (c: string, records: Row[]) => {
  records.forEach((r) => upsert(c, r))
})

export const deleteRecord = jest.fn(async (c: string, id: string) => {
  collections[c] = rowsOf(c).filter((r) => r.id !== id)
})

export const deleteRecords = jest.fn(async (c: string, ids: string[]) => {
  collections[c] = rowsOf(c).filter((r) => !ids.includes(r.id))
})

export const clearCollection = jest.fn(async (c: string) => {
  collections[c] = []
})

export const applyRecordChanges = jest.fn(
  async (c: string, puts: Row[], deleteIds: string[]) => {
    puts.forEach((r) => upsert(c, r))
    collections[c] = rowsOf(c).filter((r) => !deleteIds.includes(r.id))
  },
)

export const replaceCollection = jest.fn(async (c: string, records: Row[]) => {
  collections[c] = []
  records.forEach((r) => upsert(c, r))
})

export const renameUserData = jest.fn(async (from: string, to: string) => {
  const src = `_user_${from}`
  const dst = `_user_${to}`
  const rekey = (k: string) => k.slice(0, -src.length) + dst
  for (const k of Object.keys(kv).filter((k) => k.endsWith(src))) {
    kv[rekey(k)] = kv[k]
    delete kv[k]
  }
  for (const c of Object.keys(collections).filter((c) => c.endsWith(src))) {
    collections[rekey(c)] = collections[c]
    delete collections[c]
  }
})
