jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

import type { scheduleApi as Api } from "../schedule"

let scheduleApi: typeof Api

beforeEach(() => {
  jest.resetModules()
  scheduleApi = require("../schedule").scheduleApi
})

const year = [new Date("2030-01-01T00:00:00Z"), new Date("2031-01-01T00:00:00Z")] as const

describe("offline schedule", () => {
  it("creates accepted entries with defaults and lists them by start time in range", async () => {
    const late = await scheduleApi.create({ title: " Legs ", startAt: "2030-05-02T10:00:00Z" })
    const early = await scheduleApi.create({ title: "Push", startAt: "2030-05-01T10:00:00Z", reminderMinutes: 30 })
    await scheduleApi.create({ title: "Old", startAt: "2029-05-01T10:00:00Z" })

    expect(late).toMatchObject({ title: "Legs", durationMin: 60, reminderMinutes: null, alarm: false, status: "accepted", scheduledBy: null })
    expect((await scheduleApi.list(...year)).map((e) => e.id)).toEqual([early.id, late.id])
  })

  it("edits, cancels and removes", async () => {
    const a = await scheduleApi.create({ title: "A", startAt: "2030-05-01T10:00:00Z" })
    const b = await scheduleApi.create({ title: "B", startAt: "2030-05-02T10:00:00Z" })

    expect(await scheduleApi.update(a.id, { startAt: "2030-05-03T10:00:00+02:00", alarm: true })).toMatchObject({
      startAt: "2030-05-03T08:00:00.000Z",
      alarm: true,
    })
    await scheduleApi.cancel(a.id)
    await scheduleApi.remove(b.id)
    expect(await scheduleApi.list(...year)).toEqual([])
    await expect(scheduleApi.update(a.id, { title: "x" })).rejects.toThrow()
  })
})
