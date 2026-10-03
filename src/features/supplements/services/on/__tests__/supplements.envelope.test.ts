// The server answers { success, data } and still emits the old per-feature key
// beside it. These adapters have to read either, because a self-hosted box is
// updated independently of the app build talking to it.

import { supplementsApi } from "../supplements"
import { apiCall } from "@shared/services/apiClient"

jest.mock("@shared/services/apiClient", () => ({ apiCall: jest.fn() }))

const apiCallMock = apiCall as jest.Mock
const summary = { id: 1, name: "Creatine" }
const normalized = {
  ...summary,
  dosesPerDay: 1,
  doseIntervalMinutes: null,
  dosesToday: 0,
  lastTakenAt: null,
}

describe("supplements online adapter unwraps either envelope", () => {
  beforeEach(() => apiCallMock.mockReset())

  it("reads data", async () => {
    apiCallMock.mockResolvedValue({ success: true, data: [summary] })
    expect((await supplementsApi.list()).supplements).toEqual([normalized])

    apiCallMock.mockResolvedValue({ success: true, data: summary })
    expect((await supplementsApi.create({ name: "Creatine" } as never)).supplement).toEqual(normalized)

    apiCallMock.mockResolvedValue({ success: true, data: { id: 9, streak: 3 } })
    expect(await supplementsApi.log(1)).toEqual({ success: true, id: 9, streak: 3 })

    apiCallMock.mockResolvedValue({
      success: true,
      data: { entries: [], streak: 2, takenToday: true, todayEntry: null },
    })
    expect(await supplementsApi.getLog(1)).toEqual({
      success: true, entries: [], streak: 2, takenToday: true, todayEntry: null,
    })
  })

  it("falls back to the legacy key of an older server", async () => {
    apiCallMock.mockResolvedValue({ success: true, supplements: [summary] })
    expect((await supplementsApi.list()).supplements).toEqual([normalized])

    apiCallMock.mockResolvedValue({ success: true, id: 9, streak: 3 })
    expect(await supplementsApi.log(1)).toEqual({ success: true, id: 9, streak: 3 })

    apiCallMock.mockResolvedValue({ success: true, entries: [], streak: 2, takenToday: false })
    expect(await supplementsApi.getLog(1)).toEqual({
      success: true, entries: [], streak: 2, takenToday: false, todayEntry: null,
    })
  })

  it("handles a response with neither key", async () => {
    apiCallMock.mockResolvedValue({ success: true })
    expect((await supplementsApi.list()).supplements).toEqual([])
  })

  it("defaults dose fields a server without multi-dose support omits", async () => {
    apiCallMock.mockResolvedValue({ success: true, data: [{ ...summary, takenToday: true }] })
    expect((await supplementsApi.list()).supplements[0]).toMatchObject({
      dosesPerDay: 1,
      dosesToday: 1,
    })

    const multi = { ...summary, dosesPerDay: 3, doseIntervalMinutes: 240, dosesToday: 2, lastTakenAt: "2026-09-26T10:00:00Z" }
    apiCallMock.mockResolvedValue({ success: true, data: [multi] })
    expect((await supplementsApi.list()).supplements[0]).toEqual(multi)
  })
})
