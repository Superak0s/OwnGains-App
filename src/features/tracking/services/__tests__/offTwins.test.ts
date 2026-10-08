jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

import type * as Sqlite from "test-utils/memorySqlite"
import type { macrosTrackingApi as MacrosApi } from "../off/macros"
import type { injuryApi as InjuryApi } from "../off/injury"
import type * as BodyStats from "../off/bodyStats"

let macrosTrackingApi: typeof MacrosApi
let injuryApi: typeof InjuryApi
let bodyStats: typeof BodyStats
let sqlite: typeof Sqlite

beforeEach(() => {
  jest.resetModules()
  sqlite = require("test-utils/memorySqlite")
  sqlite.resetMemorySqlite()
  jest.spyOn(console, "error").mockImplementation(() => {})
  macrosTrackingApi = require("../off/macros").macrosTrackingApi
  injuryApi = require("../off/injury").injuryApi
  bodyStats = require("../off/bodyStats")
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

const failStorage = () => {
  const boom = new Error("disk full")
  for (const fn of [sqlite.putRecord, sqlite.listRecords, sqlite.deleteRecord, sqlite.getRecord, sqlite.listRecordsBefore, sqlite.listRecordsWhere, sqlite.setStorageItem])
    (fn as jest.Mock).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom)
}

describe("offline macros", () => {
  it("keeps a logged meal with its macros and lists it in history", async () => {
    await macrosTrackingApi.logMacros({ name: "Oats", protein: 10, carbs: 60, fat: 5, calories: 330, errorMargin: 10, note: "am" } as never)
    const { entries } = await macrosTrackingApi.getMacrosHistory()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ name: "Oats", protein: 10, carbs: 60, fat: 5, calories: 330, errorMargin: 10, note: "am" })
  })

  it("stores missing macros as null rather than undefined, like the server does", async () => {
    await macrosTrackingApi.logMacros({ protein: 30 } as never)
    const [entry] = (await macrosTrackingApi.getMacrosHistory()).entries
    expect(entry).toMatchObject({ protein: 30, carbs: null, fat: null, calories: null, errorMargin: 0 })
  })

  it("files a backdated meal under the day the user picked", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00.000Z"))
    await macrosTrackingApi.logMacros({ protein: 20, date: "2026-10-05", time: "08:30" } as never)
    const [entry] = (await macrosTrackingApi.getMacrosHistory()).entries
    expect(entry).toMatchObject({ date: "2026-10-05" })
  })

  it("leaves meals older than the history window out of the list", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-10-07T12:00:00.000Z"))
    await macrosTrackingApi.logMacros({ protein: 1, date: "2026-08-01" } as never)
    await macrosTrackingApi.logMacros({ protein: 2 } as never)
    const { entries } = await macrosTrackingApi.getMacrosHistory(30)
    expect(entries.map((e) => e.protein)).toEqual([2])
  })

  it("deletes only the chosen meal", async () => {
    const kept = (await macrosTrackingApi.logMacros({ protein: 1 } as never)) as { entry: { id: string } }
    const gone = (await macrosTrackingApi.logMacros({ protein: 2 } as never)) as { entry: { id: string } }
    await macrosTrackingApi.deleteMacrosEntry(gone.entry.id)
    const { entries } = await macrosTrackingApi.getMacrosHistory()
    expect(entries.map((e) => e.id)).toEqual([kept.entry.id])
  })

  it("starts with no goals and keeps goals the user saved", async () => {
    await expect(macrosTrackingApi.getMacrosGoals()).resolves.toEqual({ protein: null, carbs: null, fat: null, calories: null })
    await macrosTrackingApi.setMacrosGoals({ protein: 150, carbs: 250, fat: 70, calories: 2400 })
    await expect(macrosTrackingApi.getMacrosGoals()).resolves.toEqual({ protein: 150, carbs: 250, fat: 70, calories: 2400 })
  })

  it("reports a failed write instead of pretending the meal was saved", async () => {
    failStorage()
    await expect(macrosTrackingApi.logMacros({ protein: 1 } as never)).rejects.toThrow("disk full")
  })
})

describe("offline injuries", () => {
  const log = () =>
    injuryApi.logInjury({ muscleGroup: "chest", injuryType: "strain", painLevel: 6, startDate: "2026-10-01" } as never)

  it("marks an injury recovered while keeping its other details", async () => {
    const { data } = await log()
    const { data: updated } = await injuryApi.updateInjury(data!.id, { status: "recovered", recoveryDate: "2026-10-06" } as never)
    expect(updated).toMatchObject({ status: "recovered", recoveryDate: "2026-10-06", painLevel: 6, injuryType: "strain" })
    expect((await injuryApi.getAllInjuries()).data).toEqual([updated])
  })

  it("lowers the pain level without touching the status", async () => {
    const { data } = await log()
    const { data: updated } = await injuryApi.updateInjury(data!.id, { painLevel: 2 })
    expect(updated).toMatchObject({ painLevel: 2, status: "active" })
  })

  it("fails loudly when updating an injury that was already deleted", async () => {
    const { data } = await log()
    await injuryApi.deleteInjury(data!.id)
    await expect(injuryApi.updateInjury(data!.id, { painLevel: 1 })).rejects.toThrow("Injury not found")
    expect((await injuryApi.getAllInjuries()).data).toEqual([])
  })
})

describe("offline body stats", () => {
  it("reports a failed weight log instead of pretending it was saved", async () => {
    failStorage()
    await expect(bodyStats.bodyTrackingApi.logWeight(80, "kg")).rejects.toThrow("disk full")
  })

  it("shows no current weight instead of crashing analytics when storage fails, like the online twin", async () => {
    failStorage()
    await expect(bodyStats.getCurrentBodyWeight()).resolves.toBeNull()
  })

  it("reports a failed body fat delete instead of hiding the entry", async () => {
    failStorage()
    await expect(bodyStats.bodyFatApi.deleteBodyFatEntry("x")).rejects.toThrow("disk full")
  })

  it("reports a failed history read so the tab can offer a retry", async () => {
    failStorage()
    await expect(bodyStats.bodyFatApi.getBodyFatHistory()).rejects.toThrow("disk full")
  })
})
