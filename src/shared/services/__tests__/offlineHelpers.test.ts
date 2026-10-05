type Row = { id: string; sortKey: string; value: string }

const kv: Record<string, string> = {}
const collections: Record<string, Row[]> = {}

const rowsOf = (c: string) => (collections[c] ??= [])
const desc = (rows: Row[]) =>
  [...rows].sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1))

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(async (k: string) => kv[k] ?? null),
  getStorageItems: jest.fn(async () => ({})),
  setStorageItem: jest.fn(async (k: string, v: string) => {
    kv[k] = v
  }),
  removeStorageItem: jest.fn(async (k: string) => {
    delete kv[k]
  }),
  removeStorageItems: jest.fn(async () => {}),
  getRecord: jest.fn(
    async (c: string, id: string) =>
      rowsOf(c).find((r) => r.id === id)?.value ?? null,
  ),
  listRecords: jest.fn(async (c: string, limit?: number) => {
    const values = desc(rowsOf(c)).map((r) => r.value)
    return limit == null ? values : values.slice(0, limit)
  }),
  getRecordsVersion: jest.fn(() => Math.random()),
  putRecord: jest.fn(
    async (c: string, id: string, sortKey: string, value: string) => {
      const rows = rowsOf(c)
      const i = rows.findIndex((r) => r.id === id)
      const row = { id, sortKey, value }
      if (i === -1) rows.push(row)
      else rows[i] = row
    },
  ),
  putRecords: jest.fn(async (c: string, records: Row[]) => {
    for (const r of records) {
      const rows = rowsOf(c)
      const i = rows.findIndex((x) => x.id === r.id)
      if (i === -1) rows.push(r)
      else rows[i] = r
    }
  }),
  deleteRecord: jest.fn(async (c: string, id: string) => {
    collections[c] = rowsOf(c).filter((r) => r.id !== id)
  }),
  deleteRecords: jest.fn(async (c: string, ids: string[]) => {
    collections[c] = rowsOf(c).filter((r) => !ids.includes(r.id))
  }),
  clearCollection: jest.fn(async (c: string) => {
    collections[c] = []
  }),
  renameCollection: jest.fn(async (from: string, to: string) => {
    if (rowsOf(from).length === 0) return
    collections[to] = [...rowsOf(to), ...rowsOf(from)]
    collections[from] = []
  }),
}))

import * as sqlite from "@shared/services/sqliteStorage"
import {
  readJSON,
  writeJSON,
  createRecordStore,
  setRecordStoreUser,
  nextLocalId,
  computeDailyStreak,
} from "@shared/services/offlineHelpers"

type Entry = { id: number; at: string; note?: string }

const entry = (id: number, at: string, note?: string): Entry => ({
  id,
  at,
  note,
})

const makeStore = (collection = "entries", legacyKey = "legacy_entries") =>
  createRecordStore<Entry>(
    collection,
    legacyKey,
    (e) => e.id,
    (e) => e.at,
  )

beforeEach(() => {
  for (const k of Object.keys(kv)) delete kv[k]
  for (const k of Object.keys(collections)) delete collections[k]
  setRecordStoreUser(null)
  jest.clearAllMocks()
})

describe("readJSON / writeJSON", () => {
  it("round-trips a value and falls back when the key is unset", async () => {
    expect(await readJSON("missing", { a: 1 })).toEqual({ a: 1 })
    await writeJSON("k", { a: 2 })
    expect(await readJSON("k", { a: 1 })).toEqual({ a: 2 })
  })

  it("keeps two accounts' values apart on one device", async () => {
    setRecordStoreUser("a")
    await writeJSON("@settings", { goal: 1 })
    setRecordStoreUser("b")
    expect(await readJSON("@settings", { goal: 0 })).toEqual({ goal: 0 })

    setRecordStoreUser("a")
    expect(await readJSON("@settings", { goal: 0 })).toEqual({ goal: 1 })
    setRecordStoreUser(null)
  })

  it("throws rather than silently losing a failed write", async () => {
    ;(sqlite.setStorageItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    )
    const error = jest.spyOn(console, "error").mockImplementation(() => {})
    await expect(writeJSON("k", 1)).rejects.toThrow(
      '[offline storage] Failed to write "k"',
    )
    error.mockRestore()
  })
})

describe("createRecordStore", () => {
  it("stores and reads records back, newest first", async () => {
    const store = makeStore()
    await store.put(entry(1, "2024-01-01"))
    await store.put(entry(2, "2024-03-01"))
    await store.put(entry(3, "2024-02-01"))

    expect((await store.getAll()).map((e) => e.id)).toEqual([2, 3, 1])
    expect((await store.getRecent(2)).map((e) => e.id)).toEqual([2, 3])
    expect((await store.getSince("2024-02-01")).map((e) => e.id)).toEqual([2, 3])
    expect(await store.getOne(3)).toEqual(entry(3, "2024-02-01"))
    expect(await store.getOne(99)).toBeNull()
  })

  it("overwrites a record with the same id", async () => {
    const store = makeStore()
    await store.put(entry(1, "2024-01-01", "first"))
    await store.put(entry(1, "2024-01-01", "second"))
    expect(await store.getAll()).toEqual([entry(1, "2024-01-01", "second")])
  })

  it("removes records one at a time, in bulk, and wholesale", async () => {
    const store = makeStore()
    await store.putMany([
      entry(1, "2024-01-01"),
      entry(2, "2024-01-02"),
      entry(3, "2024-01-03"),
    ])

    await store.remove(1)
    expect((await store.getAll()).map((e) => e.id)).toEqual([3, 2])

    await store.removeMany([2, 3])
    expect(await store.getAll()).toEqual([])

    await store.putMany([entry(4, "2024-01-04")])
    await store.clear()
    expect(await store.getAll()).toEqual([])
  })

  it("short-circuits empty bulk writes and deletes", async () => {
    const store = makeStore()
    await store.putMany([])
    await store.removeMany([])
    expect(sqlite.putRecords).not.toHaveBeenCalledWith(
      "entries",
      expect.arrayContaining([expect.anything()]),
    )
    expect(sqlite.deleteRecords).not.toHaveBeenCalled()
  })

  it("migrates a legacy JSON blob into the collection exactly once", async () => {
    kv.legacy_entries = JSON.stringify([entry(1, "2024-01-01")])
    const store = makeStore()

    await Promise.all([store.getAll(), store.getAll(), store.getOne(1)])

    expect(sqlite.putRecords).toHaveBeenCalledTimes(1)
    expect(kv.legacy_entries).toBeUndefined()
    expect(await store.getAll()).toEqual([entry(1, "2024-01-01")])
  })

  it("skips the bulk write when there is no legacy blob", async () => {
    await makeStore().getAll()
    expect(sqlite.putRecords).not.toHaveBeenCalled()
    expect(sqlite.removeStorageItem).toHaveBeenCalledWith("legacy_entries")
  })

  it("retries the migration after a transient failure instead of caching it", async () => {
    kv.legacy_entries = JSON.stringify([entry(1, "2024-01-01")])
    ;(sqlite.putRecords as jest.Mock).mockRejectedValueOnce(new Error("locked"))
    const store = makeStore()

    await expect(store.getAll()).rejects.toThrow("locked")
    expect(await store.getAll()).toEqual([entry(1, "2024-01-01")])
  })

  it("dedupes concurrent reads but not reads that straddle a write", async () => {
    const store = makeStore()
    await store.put(entry(1, "2024-01-01"))
    ;(sqlite.listRecords as jest.Mock).mockClear()

    await Promise.all([store.getAll(), store.getAll()])
    expect(sqlite.listRecords).toHaveBeenCalledTimes(1)

    await Promise.all([store.getRecent(5), store.getRecent(5), store.getRecent(1)])
    expect(sqlite.listRecords).toHaveBeenCalledTimes(3)

    const stale = store.getAll()
    await store.put(entry(2, "2024-02-01"))
    await stale
    expect((await store.getAll()).map((e) => e.id)).toEqual([2, 1])
  })

  describe("parsed-row cache", () => {
    const version = sqlite.getRecordsVersion as jest.Mock
    let current = 0
    beforeEach(() => version.mockImplementation(() => current))
    afterEach(() => version.mockImplementation(() => Math.random()))

    it("serves warm reads without touching SQLite until a write", async () => {
      const store = makeStore()
      await store.put(entry(1, "2024-01-01"))
      await store.getAll()
      ;(sqlite.listRecords as jest.Mock).mockClear()

      await store.getAll()
      expect((await store.getSince("2024-01-01")).map((e) => e.id)).toEqual([1])
      expect(sqlite.listRecords).not.toHaveBeenCalled()

      await store.put(entry(2, "2024-02-01"))
      expect((await store.getAll()).map((e) => e.id)).toEqual([2, 1])
    })

    it("drops the cache on a write made outside the store", async () => {
      const store = makeStore()
      await store.put(entry(1, "2024-01-01"))
      await store.getAll()

      collections.entries.push({ id: "9", sortKey: "2024-09-01", value: JSON.stringify(entry(9, "2024-09-01")) })
      current++
      expect((await store.getAll()).map((e) => e.id)).toEqual([9, 1])
    })

    it("hands each caller its own array", async () => {
      const store = makeStore()
      await store.put(entry(1, "2024-01-01"))
      await store.put(entry(2, "2024-02-01"))
      ;(await store.getAll()).reverse()
      expect((await store.getAll()).map((e) => e.id)).toEqual([2, 1])
    })
  })
})

describe("nextLocalId", () => {
  it("is monotonic and seeded above any plausible server id", () => {
    const a = nextLocalId()
    const b = nextLocalId()
    expect(b).toBe(a + 1)
    expect(a).toBeGreaterThan(1_600_000_000_000)
  })
})

describe("computeDailyStreak", () => {
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString()
  }

  it("is 0 with no timestamps", () => {
    expect(computeDailyStreak([])).toBe(0)
  })

  it("counts consecutive days back from today", () => {
    expect(computeDailyStreak([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3)
  })

  it("still counts a streak that ends yesterday", () => {
    expect(computeDailyStreak([daysAgo(1), daysAgo(2)])).toBe(2)
  })

  it("is 0 once two days have been missed", () => {
    expect(computeDailyStreak([daysAgo(2), daysAgo(3)])).toBe(0)
  })

  it("counts a day only once no matter how many entries it has", () => {
    expect(computeDailyStreak([daysAgo(0), daysAgo(0), daysAgo(1)])).toBe(2)
  })

  it("stops at the first gap", () => {
    expect(computeDailyStreak([daysAgo(0), daysAgo(1), daysAgo(5)])).toBe(2)
  })
})

describe("per-user record collections", () => {
  it("keeps one user's records out of another's and migrates pre-namespace rows", async () => {
    const store = makeStore("isolated", "legacy_isolated")

    await store.put(entry(1, "2024-01-01"))

    setRecordStoreUser("a")
    expect(await store.getAll()).toEqual([entry(1, "2024-01-01")])
    await store.put(entry(2, "2024-01-02"))

    setRecordStoreUser("b")
    expect(await store.getAll()).toEqual([])
    await store.put(entry(3, "2024-01-03"))

    setRecordStoreUser("a")
    expect((await store.getAll()).map((e) => e.id).sort()).toEqual([1, 2])
  })
})
