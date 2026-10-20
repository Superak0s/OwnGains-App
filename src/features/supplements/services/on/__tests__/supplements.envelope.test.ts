// The server answers { success, data }. These adapters unwrap it.

import { supplementsApi } from "../supplements"
import { apiCall } from "@shared/services/apiClient"

jest.mock("@shared/services/apiClient", () => ({ apiCall: jest.fn() }))

const apiCallMock = apiCall as jest.Mock
const summary = { id: 1, name: "Creatine", dosesPerDay: 3, doseIntervalMinutes: 240, dosesToday: 2, lastTakenAt: null }

describe("supplements online adapter unwraps the envelope", () => {
  beforeEach(() => apiCallMock.mockReset())

  it("reads data", async () => {
    apiCallMock.mockResolvedValue({ success: true, data: [summary] })
    expect((await supplementsApi.list()).supplements).toEqual([summary])

    apiCallMock.mockResolvedValue({ success: true, data: summary })
    expect((await supplementsApi.create({ name: "Creatine" } as never)).supplement).toEqual(summary)

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

  it("handles a response with neither key", async () => {
    apiCallMock.mockResolvedValue({ success: true })
    expect((await supplementsApi.list()).supplements).toEqual([])
  })
})
