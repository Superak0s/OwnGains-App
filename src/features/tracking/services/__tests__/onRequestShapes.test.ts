jest.mock("@shared/services/authenticatedFetch", () => ({ authenticatedFetch: jest.fn() }))
jest.mock("@shared/services/config", () => ({
  ...jest.requireActual("@shared/services/config"),
  getServerUrl: () => "https://gym.example",
}))
jest.mock("@utils/compressImage", () => ({
  compressImageForUpload: jest.fn(async (uri: string) => uri),
}))
jest.mock("expo-file-system", () => ({
  File: class {
    constructor(public mockUri: string) {}
    delete() {}
  },
}))

import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { ApiError, ServerUnreachableError } from "@shared/services/apiError"
import { bodyTrackingApi, bodyFatApi, getCurrentBodyWeight } from "../on/bodyStats"
import { bodyMeasurementsApi } from "../on/bodyMeasurements"
import { customMeasurementsApi } from "../on/customMeasurements"
import { hydrationApi } from "../on/hydration"
import { injuryApi } from "../on/injury"
import { macrosTrackingApi } from "../on/macros"
import { menstrualApi } from "../on/menstrual"
import { personalNotesApi } from "../on/personalNotes"
import { progressPhotoApi } from "../on/progressPhoto"
import { sorenessApi } from "../on/soreness"

const mockFetch = authenticatedFetch as jest.Mock

const respond = (status: number, body: unknown = { success: true }, headers: Record<string, string> = {}) => {
  const res = {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (k: string) => headers[k] ?? null },
    clone: () => res,
  }
  return res as unknown as Response
}

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, { method?: string; body?: unknown; headers?: Record<string, string> } | undefined]
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
  return { url, method: init?.method ?? "GET", body, headers: init?.headers }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(respond(200, { success: true, data: [] }))
})

describe("write requests match the server contract", () => {
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ["weight in lbs is stored as kg", () => bodyTrackingApi.logWeight(100, "lbs", "am", "2026-10-01T08:00:00.000Z"),
      "POST", "/api/tracking/bodystats/weight", { weightKg: 45.3592, measuredAt: "2026-10-01T08:00:00.000Z", note: "am" }],
    ["weight delete", () => bodyTrackingApi.deleteWeightEntry(5), "DELETE", "/api/tracking/bodystats/weight/5", undefined],
    ["body fat with a full timestamp", () => bodyFatApi.logBodyFat(15, null, "male", "2026-10-01T08:00:00.000Z"),
      "POST", "/api/tracking/bodystats/bodyfat/log", { percentage: 15, measurements: null, bfFormulaSex: "male", measuredAt: "2026-10-01T08:00:00.000Z" }],
    ["body fat delete", () => bodyFatApi.deleteBodyFatEntry(3), "DELETE", "/api/tracking/bodystats/bodyfat/log/3", undefined],
    ["measurements send only the values given", () => bodyMeasurementsApi.logMeasurement(80, null, 35, undefined, "2026-10-01T08:00:00.000Z"),
      "POST", "/api/tracking/measurements", { values: { waist_cm: 80, arm_right_cm: 35 }, measuredAt: "2026-10-01T08:00:00.000Z", note: null }],
    ["measurement delete scoped to the built-in metrics", () => bodyMeasurementsApi.deleteMeasurementEntry(9),
      "DELETE", "/api/tracking/measurements/9?metrics=waist_cm,arm_left_cm,arm_right_cm,chest_cm", undefined],
    ["custom measurement type", () => customMeasurementsApi.createType("neck_cm", "Neck", "cm"),
      "POST", "/api/tracking/measurements/definitions", { keyName: "neck_cm", label: "Neck", unit: "cm" }],
    ["custom measurement value", () => customMeasurementsApi.logValue("neck_cm", 38),
      "POST", "/api/tracking/measurements", { values: { neck_cm: 38 }, measuredAt: null, note: null }],
    ["hydration delete", () => hydrationApi.deleteHydrationEntry(4), "DELETE", "/api/tracking/hydration/4", undefined],
    ["hydration settings only patch what changed", () => hydrationApi.setSettings(2500),
      "PATCH", "/api/settings", { hydrationGoalMl: 2500 }],
    ["injury log", () => injuryApi.logInjury({ muscleGroup: "chest", injuryType: "strain", painLevel: 4, startDate: "2026-10-01" } as never),
      "POST", "/api/tracking/injuries", { muscleGroup: "chest", injuryType: "strain", painLevel: 4, startDate: "2026-10-01" }],
    ["injury update", () => injuryApi.updateInjury(2, { status: "recovered" } as never), "PATCH", "/api/tracking/injuries/2", { status: "recovered" }],
    ["injury delete", () => injuryApi.deleteInjury(2), "DELETE", "/api/tracking/injuries/2", undefined],
    ["macros without optional fields send nulls", () => macrosTrackingApi.logMacros({ protein: 30 } as never),
      "POST", "/api/tracking/macros/log", expect.objectContaining({ name: null, protein: 30, carbs: null, fat: null, calories: null, errorMargin: 0, note: null })],
    ["macro goals only patch what is set", () => macrosTrackingApi.setMacrosGoals({ protein: 150, carbs: null, fat: null, calories: 2400 }),
      "PATCH", "/api/settings", { macroProteinGoal: 150, macroCaloriesGoal: 2400 }],
    ["macros delete", () => macrosTrackingApi.deleteMacrosEntry(8), "DELETE", "/api/tracking/macros/log/8", undefined],
    ["menstrual cycle from a Date", () => menstrualApi.logMenstrualCycle(new Date("2026-10-01T00:00:00.000Z")),
      "POST", "/api/tracking/menstrual", { cycleStart: "2026-10-01T00:00:00.000Z", symptoms: [] }],
    ["menstrual update", () => menstrualApi.updateMenstrualCycle(6, { cycleEnd: null }), "PATCH", "/api/tracking/menstrual/6", { cycleEnd: null }],
    ["menstrual delete", () => menstrualApi.deleteMenstrualEntry(6), "DELETE", "/api/tracking/menstrual/6", undefined],
    ["menstrual settings", () => menstrualApi.setSettings(undefined, 30), "PATCH", "/api/settings", { cycleLengthDays: 30 }],
    ["personal note", () => personalNotesApi.createNote({ muscleGroup: "chest" as never, content: "tight" }),
      "POST", "/api/tracking/personal-notes", { muscleGroup: "chest", content: "tight" }],
    ["personal note delete", () => personalNotesApi.deleteNote(1), "DELETE", "/api/tracking/personal-notes/1", undefined],
    ["soreness intensity is rounded", () => sorenessApi.logSoreness({ muscleGroup: "chest", intensity: 3.6, loggedAt: "2026-10-01T08:00:00.000Z" } as never),
      "POST", "/api/tracking/soreness", { muscleGroup: "chest", intensity: 4, loggedAt: "2026-10-01T08:00:00.000Z", note: null }],
    ["soreness follow-up goes through the batch route", () => sorenessApi.updateSoreness({ sorenessId: 3, intensity: 1.2, status: "resolved" } as never),
      "POST", "/api/tracking/soreness/follow-ups", { updates: [{ sorenessId: 3, intensity: 1, status: "resolved", note: null }] }],
    ["soreness delete", () => sorenessApi.deleteSorenessEntry(3), "DELETE", "/api/tracking/soreness/3", undefined],
    ["photo delete", () => progressPhotoApi.deletePhoto(12), "DELETE", "/api/tracking/photos/muscle/12", undefined],
  ]

  it.each(cases)("sends %s so the server stores what the user logged", async (_name, call, method, url, body) => {
    await call()
    const sent = lastCall()
    expect(sent.method).toBe(method)
    expect(sent.url).toBe(url)
    expect(sent.body).toEqual(body)
  })

  it("does not double-log a drink when the hydration request is resent", async () => {
    await hydrationApi.logHydration(250, undefined, "2026-10-01T08:00:00.000Z", "idem_1", 10)
    const sent = lastCall()
    expect(sent).toMatchObject({ url: "/api/tracking/hydration", method: "POST" })
    expect(sent.headers?.["Idempotency-Key"]).toBe("idem_1")
    expect(sent.body).toEqual({ amountMl: 250, measuredAt: "2026-10-01T08:00:00.000Z", note: null, errorMargin: 10 })
  })

  it("uploads a progress photo as multipart with its muscles and angle", async () => {
    await progressPhotoApi.uploadPhoto({ uri: "file:///a.jpg", muscleGroups: ["chest"], takenAt: "2026-10-01T08:00:00.000Z" } as never)
    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe("/api/tracking/photos/muscle")
    expect(init.method).toBe("POST")
    expect(init.body).toBeInstanceOf(FormData)
  })
})

describe("read responses are mapped to the app's shape", () => {
  it("reads weight history values as kg with the measured time", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: [{ id: 1, value: 80, measuredAt: "t1", note: null }] }))
    await expect(bodyTrackingApi.getWeightHistory(30)).resolves.toEqual({ entries: [{ id: 1, weightKg: 80, recordedAt: "t1" }] })
    expect(lastCall().url).toBe("/api/tracking/bodystats/weight?limit=30")
  })

  it("shows no current weight instead of crashing when none is logged", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: null }))
    await expect(getCurrentBodyWeight()).resolves.toBeNull()
  })

  it("maps measurement rows with missing metrics to null instead of undefined", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: [{ id: 2, measuredAt: "t", values: { waist_cm: 80 } }] }))
    const res = await bodyMeasurementsApi.getMeasurementHistory()
    expect(res.data?.[0]).toEqual({ id: 2, waistCm: 80, armLeftCm: null, armRightCm: null, chestCm: null, measuredAt: "t", note: null, createdAt: "t" })
  })

  it("maps hydration rows and defaults a missing error margin to 0", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: [{ id: 1, value: 300, measuredAt: "t", note: null, createdAt: "c" }] }))
    const res = await hydrationApi.getHydrationHistory(10)
    expect(res.data).toEqual([{ id: 1, amountMl: 300, loggedAt: "t", note: null, errorMargin: 0, createdAt: "c" }])
  })

  it("falls back to default goals when the server has no hydration or cycle settings", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: {} }))
    await expect(hydrationApi.getSettings()).resolves.toMatchObject({ success: true, data: { goalMl: expect.any(Number) } })
    await expect(menstrualApi.getSettings()).resolves.toEqual({ success: true, data: { periodDays: 5, cycleLengthDays: 28 } })
    await expect(macrosTrackingApi.getMacrosGoals()).resolves.toEqual({ protein: null, carbs: null, fat: null, calories: null })
  })

  it("exposes takenAt as loggedAt so macro history lists by day", async () => {
    mockFetch.mockResolvedValue(respond(200, { data: [{ id: 1, takenAt: "t" }] }))
    const { entries } = await macrosTrackingApi.getMacrosHistory(7)
    expect(entries[0]).toMatchObject({ loggedAt: "t" })
    expect(lastCall().url).toBe("/api/tracking/macros/log?days=7")
  })

  it("sends the cycle settings override only when given", async () => {
    await menstrualApi.getCycleStats()
    expect(lastCall().url).toBe("/api/tracking/menstrual/stats")
    await menstrualApi.getCycleStats({ periodDays: 4, cycleLengthDays: 30 })
    expect(lastCall().url).toBe("/api/tracking/menstrual/stats?periodDays=4&cycleLengthDays=30")
  })

  it("encodes a muscle name so it can't break the query", async () => {
    await injuryApi.getInjuriesByMuscle("lower back&x=1")
    expect(lastCall().url).toBe("/api/tracking/injuries?muscle=lower%20back%26x%3D1")
  })

  it("joins only rooted photo paths to the server, so a hostile path can't repoint the image", async () => {
    mockFetch.mockResolvedValue(respond(200, {
      success: true,
      data: [{ id: 1, uri: "/photos/1.jpg", thumbUri: "//evil.example/x.jpg" }],
    }))
    const page = await progressPhotoApi.getPhotoPage({ before: "2026-10-01", beforeId: "5" }, 20)
    expect(lastCall().url).toBe("/api/tracking/photos/muscle?limit=20&before=2026-10-01&beforeId=5")
    expect(page.data[0]).toMatchObject({ uri: "https://gym.example/photos/1.jpg", thumbUri: undefined })
  })

  it("ends the photo list when the server sends no next cursor, instead of looping on page one", async () => {
    mockFetch.mockResolvedValue(respond(200, { success: true, data: [] }))
    await expect(progressPhotoApi.getPhotoPage(null, 20)).resolves.toMatchObject({ nextCursor: null })
  })
})

describe("server errors reach the caller instead of looking like a save", () => {
  const writes: Array<[string, () => Promise<unknown>]> = [
    ["weight", () => bodyTrackingApi.logWeight(80, "kg")],
    ["body fat", () => bodyFatApi.logBodyFat(15, null, null)],
    ["measurement", () => bodyMeasurementsApi.logMeasurement(80)],
    ["hydration", () => hydrationApi.logHydration(250)],
    ["injury", () => injuryApi.logInjury({} as never)],
    ["macros", () => macrosTrackingApi.logMacros({} as never)],
    ["menstrual", () => menstrualApi.logMenstrualCycle("2026-10-01")],
    ["soreness", () => sorenessApi.logSoreness({ muscleGroup: "chest", intensity: 2 } as never)],
    ["weight history", () => bodyTrackingApi.getWeightHistory()],
  ]

  it.each(writes)("%s: a 401 surfaces as an ApiError with status 401", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(401, { error: "Unauthorized" }))
    await expect(call()).rejects.toMatchObject({ name: "ApiError", status: 401 })
  })

  it.each(writes)("%s: a 4xx validation error shows the server's message", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(400, { error: "Value out of range", code: "VALUE_OUT_OF_RANGE" }))
    await expect(call()).rejects.toMatchObject({ status: 400, message: "Value out of range", code: "VALUE_OUT_OF_RANGE" })
  })

  it.each(writes)("%s: a 429 keeps the Retry-After wait", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(429, { error: "Too many requests" }, { "Retry-After": "5" }))
    await expect(call()).rejects.toMatchObject({ status: 429, retryAfterMs: 5000 })
  })

  it.each(writes)("%s: a 5xx proxy page that isn't JSON is still an error", async (_n, call) => {
    mockFetch.mockResolvedValue({ ...respond(502), json: async () => { throw new SyntaxError("<html>") } } as unknown as Response)
    await expect(call()).rejects.toBeInstanceOf(ApiError)
  })

  it.each(writes)("%s: a network failure is not swallowed", async (_n, call) => {
    mockFetch.mockRejectedValue(new ServerUnreachableError())
    await expect(call()).rejects.toBeInstanceOf(ServerUnreachableError)
  })

  it("rejects a 200 whose body says success: false", async () => {
    mockFetch.mockResolvedValue(respond(200, { success: false, error: "Not stored" }))
    await expect(injuryApi.deleteInjury(1)).rejects.toMatchObject({ message: "Not stored" })
  })

  it("shows no current weight rather than failing the screen when the server is down", async () => {
    mockFetch.mockRejectedValue(new ServerUnreachableError())
    await expect(getCurrentBodyWeight()).resolves.toBeNull()
  })

  it("resends a photo once after a short UPLOAD_BUSY wait", async () => {
    jest.useFakeTimers()
    mockFetch
      .mockResolvedValueOnce(respond(503, { code: "UPLOAD_BUSY" }, { "Retry-After": "1" }))
      .mockResolvedValueOnce(respond(200, { success: true, data: { id: 1 } }))
    const upload = progressPhotoApi.uploadPhoto({ uri: "file:///a.jpg", muscleGroups: ["chest"] } as never)
    await jest.advanceTimersByTimeAsync(1000)
    await expect(upload).resolves.toMatchObject({ data: { id: 1 } })
    expect(mockFetch).toHaveBeenCalledTimes(2)
    jest.useRealTimers()
  })

  it("does not wait out a long UPLOAD_BUSY and shows the busy message instead", async () => {
    mockFetch.mockResolvedValue(respond(503, { code: "UPLOAD_BUSY" }, { "Retry-After": "60" }))
    await expect(progressPhotoApi.uploadPhoto({ uri: "file:///a.jpg", muscleGroups: [] } as never)).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("busy"),
    })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("tells the user the server is out of photo space", async () => {
    mockFetch.mockResolvedValue(respond(507, { code: "PHOTO_STORAGE_FULL" }))
    await expect(progressPhotoApi.uploadPhoto({ uri: "file:///a.jpg", muscleGroups: [] } as never)).rejects.toMatchObject({
      message: expect.stringContaining("out of space"),
    })
  })
})
