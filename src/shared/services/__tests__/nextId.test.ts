const store: Record<string, string> = {}

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(
    (k: string) => new Promise((r) => setTimeout(() => r(store[k] ?? null), 0)),
  ),
  getStorageItems: jest.fn(async () => ({})),
  setStorageItem: jest.fn(
    (k: string, v: string) =>
      new Promise<void>((r) =>
        setTimeout(() => {
          store[k] = v
          r()
        }, 0),
      ),
  ),
  removeStorageItem: jest.fn(async () => {}),
  removeStorageItems: jest.fn(async () => {}),
  getRecord: jest.fn(),
  listRecords: jest.fn(),
  listRecordsSince: jest.fn(),
  putRecord: jest.fn(),
  putRecords: jest.fn(),
  deleteRecord: jest.fn(),
  deleteRecords: jest.fn(),
  clearCollection: jest.fn(),
}))

import { nextId } from "@shared/services/offlineHelpers"

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k]
})

it("never hands the same id to concurrent callers", async () => {
  const ids = await Promise.all(
    Array.from({ length: 10 }, () => nextId("counter")),
  )
  expect([...new Set(ids)].sort((a, b) => a - b)).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  ])
})

it("keeps separate counters independent", async () => {
  const [a, b] = await Promise.all([nextId("a"), nextId("b")])
  expect([a, b]).toEqual([1, 1])
})
