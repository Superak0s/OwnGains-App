import { doMigrateOffline } from "@features/settings/utils/offlineMigration"
import { workoutApi } from "@features/workout/services/index"
import { authService } from "@features/auth/services/index"
import { setAppMode } from "@shared/services/appMode"
import { STORAGE_KEYS } from "@shared/services/storage"
import { kv, resetMemorySqlite, setStorageItem } from "test-utils/memorySqlite"
import type { User, WorkoutSession } from "@shared/types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/services/appMode", () => ({ setAppMode: jest.fn(async () => {}) }))
jest.mock("@features/workout/services/index", () => ({
  workoutApi: { getSessionHistoryPage: jest.fn() },
}))
jest.mock("@features/auth/services/index", () => ({
  authService: { recordConsent: jest.fn(async () => {}) },
}))

const getPage = workoutApi.getSessionHistoryPage as jest.Mock
const recordConsent = authService.recordConsent as jest.Mock
const setAppModeMock = setAppMode as jest.Mock

const user: User = {
  id: "u1",
  username: "tester",
  name: "Tester",
  email: "t@example.com",
  heightCm: 180,
  bfFormulaSex: "female",
}

const session = (id: string, split: string | undefined): WorkoutSession =>
  ({
    id,
    split,
    dayNumber: 1,
    dayTitle: "Push",
    startTime: "2026-01-01T10:00:00.000Z",
    endTime: "2026-01-01T11:00:00.000Z",
    setTimings: [],
  }) as unknown as WorkoutSession

const migrate = (withdrawHealthConsent = false) =>
  doMigrateOffline({
    user,
    selectedSplit: "ppl",
    profileAvatarUri: null,
    withdrawHealthConsent,
  })

const copiedSessions = () =>
  JSON.parse(kv["@offline:workout:sessions"] ?? "[]") as { id: string; split: string }[]

beforeEach(() => {
  resetMemorySqlite()
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

describe("doMigrateOffline", () => {
  it("copies history from every page and every split, not only the current split", async () => {
    getPage
      .mockResolvedValueOnce({ sessions: [session("a", "ppl"), session("b", "upper-lower")], nextCursor: "c1" })
      .mockResolvedValueOnce({ sessions: [session("c", "full-body")], nextCursor: "c2" })
      .mockResolvedValueOnce({ sessions: [], nextCursor: "c3" })

    await expect(migrate()).resolves.toBe(true)

    expect(getPage.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [null, null],
      [null, "c1"],
      [null, "c2"],
    ])
    expect(copiedSessions().map((s) => [s.id, s.split])).toEqual([
      ["a", "ppl"],
      ["b", "upper-lower"],
      ["c", "full-body"],
    ])
  })

  it("files a legacy session with no split under the selected split instead of dropping it", async () => {
    getPage.mockResolvedValueOnce({ sessions: [session("old", undefined)], nextCursor: null })

    await migrate()

    expect(copiedSessions()[0].split).toBe("ppl")
  })

  it("copies plain-string settings without losing them to a JSON parse", async () => {
    await setStorageItem(`${STORAGE_KEYS.WEIGHT_UNIT}_user_u1`, "lbs")
    getPage.mockResolvedValueOnce({ sessions: [], nextCursor: null })

    await migrate()

    expect(kv[`${STORAGE_KEYS.WEIGHT_UNIT}_user_local`]).toBe("lbs")
  })

  it("stops before the server deletes anything when a history page fails", async () => {
    getPage
      .mockResolvedValueOnce({ sessions: [session("a", "ppl")], nextCursor: "c1" })
      .mockRejectedValueOnce(new Error("Network request failed"))

    await expect(migrate(true)).resolves.toBe(false)

    expect(recordConsent).not.toHaveBeenCalled()
    expect(setAppModeMock).not.toHaveBeenCalled()
  })

  it("stays online when the server refuses to record the withdrawal", async () => {
    getPage.mockResolvedValueOnce({ sessions: [], nextCursor: null })
    recordConsent.mockRejectedValueOnce(new Error("HTTP 404"))

    await expect(migrate(true)).resolves.toBe(false)

    expect(recordConsent).toHaveBeenCalledWith(expect.any(String), false, true)
    expect(setAppModeMock).not.toHaveBeenCalled()
    expect(kv["@offline_user"]).toBeUndefined()
  })

  it("writes the offline profile with name, height and body-fat sex before switching mode", async () => {
    getPage.mockResolvedValueOnce({ sessions: [], nextCursor: null })
    let profileAtSwitch: string | undefined
    setAppModeMock.mockImplementationOnce(async () => {
      profileAtSwitch = kv["@offline_user"]
    })

    await migrate(true)

    expect(setAppModeMock).toHaveBeenCalledWith("offline")
    expect(JSON.parse(profileAtSwitch ?? "null")).toEqual({
      id: "local",
      username: "tester",
      name: "Tester",
      email: "t@example.com",
      heightCm: 180,
      bfFormulaSex: "female",
    })
  })
})
