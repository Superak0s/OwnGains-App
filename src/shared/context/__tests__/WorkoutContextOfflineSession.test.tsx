import { create, act, type ReactTestRenderer } from "react-test-renderer"
import { AppState } from "react-native"
import { program } from "test-utils/fixtures"
import { resetMemorySqlite } from "test-utils/memorySqlite"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

jest.mock("../AuthContext", () => ({
  useAuthToken: () => "token",
  useAuth: () => ({ user: { id: "u1", username: "tester" }, logout: jest.fn(), consented: true }),
}))

const mockSend = jest.fn((_msg: { type: string; sessionId?: string }) => true)
const mockReconnectHandlers = new Set<() => void>()
jest.mock("../hooks/useRealtimeSocket", () => ({
  useRealtimeSocket: () => ({
    send: mockSend,
    connected: true,
    subscribe: () => () => {},
    onReconnect: (handler: () => void) => {
      mockReconnectHandlers.add(handler)
      return () => mockReconnectHandlers.delete(handler)
    },
    authError: false,
    connectionFailed: false,
  }),
}))

jest.mock("@shared/services/appMode", () => ({
  isServerless: jest.fn().mockResolvedValue(false),
  getAppMode: jest.fn().mockResolvedValue("online"),
  onAppModeChange: { subscribe: () => () => {} },
}))

jest.mock("../hooks/useServerSync", () => ({
  useServerSync: () => ({ fetchSessionHistory: jest.fn(), syncFromServer: jest.fn(async () => ({})) }),
}))

jest.mock("@features/workout/services", () => ({
  workoutApi: {
    startSession: jest.fn(),
    recordSet: jest.fn(),
    endSession: jest.fn(),
    deleteSet: jest.fn(),
    updateSessionDay: jest.fn(),
    getAnalytics: jest.fn(async () => null),
    getSessionHistory: jest.fn(async () => []),
  },
}))
jest.mock("@features/plan/services", () => ({
  programApi: { fetchSavedProgram: jest.fn(async () => null), setCurrentDay: jest.fn(async () => undefined) },
}))

import { WorkoutProvider, useWorkout, useWorkoutSyncStatus } from "../WorkoutContext"
import { saveToStorage, STORAGE_KEYS } from "@shared/services/storage"

const mockWorkoutApi = jest.requireMock("@features/workout/services").workoutApi as Record<string, jest.Mock>
const offline = () => Promise.reject(new TypeError("Network request failed"))

const ctx: { current?: ReturnType<typeof useWorkout> } = {}
const queue: { current?: ReturnType<typeof useWorkoutSyncStatus> } = {}
function Probe() {
  ctx.current = useWorkout()
  queue.current = useWorkoutSyncStatus()
  return null
}

const appStateHandlers: Array<(state: string) => void> = []
let root: ReactTestRenderer | undefined

const sessionIdsAnnounced = () =>
  mockSend.mock.calls.map(([m]) => m).filter((m) => m.type === "session_started").map((m) => m.sessionId)

for (const m of ["error", "warn", "info", "debug", "log"] as const) console[m] = jest.fn()

beforeEach(async () => {
  resetMemorySqlite()
  jest.clearAllMocks()
  appStateHandlers.length = 0
  jest.spyOn(AppState, "addEventListener").mockImplementation((_e, handler) => {
    appStateHandlers.push(handler as (state: string) => void)
    return { remove: () => {} } as ReturnType<typeof AppState.addEventListener>
  })
  await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, program, "u1")
  await saveToStorage(STORAGE_KEYS.SELECTED_SPLIT, "A", "u1")
  await saveToStorage(STORAGE_KEYS.CURRENT_DAY, "1", "u1")
  await act(async () => {
    root = create(
      <WorkoutProvider>
        <Probe />
      </WorkoutProvider>,
    )
  })
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
    await new Promise((r) => setTimeout(r, 0))
  })
  jest.restoreAllMocks()
})

describe("WorkoutProvider workout started without a connection", () => {
  it("does not announce the workout to friends under its local_ ID, then announces the server ID once foregrounding replays the queue", async () => {
    mockWorkoutApi.startSession.mockImplementation(offline)
    mockWorkoutApi.recordSet.mockImplementation(offline)

    await act(async () => {
      await ctx.current!.saveSetDetails(1, 0, 0, 80, 8)
    })
    expect(ctx.current!.currentSessionId).toMatch(/^local_/)
    expect(ctx.current!.completedDays[1][0][0]).toMatchObject({ weight: 80, reps: 8 })
    expect(sessionIdsAnnounced()).toEqual([])

    mockWorkoutApi.startSession.mockResolvedValue(314)
    mockWorkoutApi.recordSet.mockResolvedValue(undefined)
    await act(async () => {
      appStateHandlers.forEach((h) => h("active"))
    })

    expect(mockWorkoutApi.recordSet).toHaveBeenLastCalledWith("314", expect.anything(), expect.any(String))
    expect(ctx.current!.currentSessionId).toBe("314")
    expect(queue.current!.pendingSyncs).toEqual([])
    expect(sessionIdsAnnounced()).toEqual(["314"])
  })

  it("keeps the logged sets on the device when the workout is ended with the server unreachable", async () => {
    mockWorkoutApi.startSession.mockResolvedValue(42)
    mockWorkoutApi.recordSet.mockImplementation(offline)
    mockWorkoutApi.endSession.mockImplementation(offline)

    await act(async () => {
      await ctx.current!.saveSetDetails(1, 0, 0, 80, 8)
    })
    await act(async () => {
      await ctx.current!.endWorkout()
    })

    expect(ctx.current!.completedDays[1][0][0]).toMatchObject({ weight: 80, reps: 8 })
    expect(queue.current!.pendingSyncs.map((s) => s.type)).toEqual(["recordSet", "endSession"])
    expect(ctx.current!.currentSessionId).toBeNull()
  })
})

describe("WorkoutProvider socket reconnect", () => {
  async function queueOfflineSet() {
    mockWorkoutApi.startSession.mockResolvedValue(42)
    mockWorkoutApi.recordSet.mockImplementation(offline)
    await act(async () => {
      await ctx.current!.saveSetDetails(1, 0, 0, 80, 8)
    })
    expect(queue.current!.pendingSyncs.map((s) => s.type)).toEqual(["recordSet"])
    mockWorkoutApi.recordSet.mockResolvedValue(undefined)
  }

  it("drains the offline queue as soon as the socket reconnects, without waiting for the poll", async () => {
    await queueOfflineSet()
    await act(async () => {
      mockReconnectHandlers.forEach((h) => h())
    })
    expect(mockWorkoutApi.recordSet).toHaveBeenLastCalledWith("42", expect.anything(), expect.any(String))
    expect(queue.current!.pendingSyncs).toEqual([])
  })

  it("does not drain on reconnect in trainer mode", async () => {
    await act(async () => {
      root?.unmount()
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      )
    })
    expect(mockReconnectHandlers.size).toBe(0)
  })
})
