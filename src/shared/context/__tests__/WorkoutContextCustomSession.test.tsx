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

import { WorkoutProvider, useWorkout } from "../WorkoutContext"
import { saveToStorage, STORAGE_KEYS } from "@shared/services/storage"
import { CUSTOM_DAY } from "@utils/dayCarryOver"

const mockWorkoutApi = jest.requireMock("@features/workout/services").workoutApi as Record<string, jest.Mock>

const ctx: { current?: ReturnType<typeof useWorkout> } = {}
function Probe() {
  ctx.current = useWorkout()
  return null
}

const appStateHandlers: Array<(state: string) => void> = []
let root: ReactTestRenderer | undefined

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

describe("WorkoutProvider custom session", () => {
  it("logs exercises added to an empty workout on a session-only day, leaving the program untouched", async () => {
    mockWorkoutApi.startSession.mockResolvedValue(42)
    mockWorkoutApi.recordSet.mockResolvedValue(undefined)
    mockWorkoutApi.endSession.mockResolvedValue(undefined)

    await act(async () => {
      await ctx.current!.startCustomWorkout("Empty workout", [])
    })
    expect(mockWorkoutApi.startSession).toHaveBeenCalledWith("A", CUSTOM_DAY, "Empty workout", false, expect.any(String))
    expect(ctx.current!.currentDay).toBe(CUSTOM_DAY)

    await act(async () => {
      await ctx.current!.addNewExercise(CUSTOM_DAY, "A", { name: "Row", sets: 3 })
    })
    const day = ctx.current!.sessionWorkoutData!.days.find((d) => d.dayNumber === CUSTOM_DAY)
    expect(day?.split.A.exercises.map((e) => e.name)).toEqual(["Row"])
    expect(ctx.current!.workoutData).toEqual(program)

    await act(async () => {
      await ctx.current!.saveSetDetails(CUSTOM_DAY, 0, 0, 60, 10)
    })
    await act(async () => {
      await ctx.current!.endWorkout()
    })

    expect(ctx.current!.currentDay).toBe(1)
    expect(ctx.current!.lockedDays[CUSTOM_DAY]).toBeUndefined()
    expect(ctx.current!.completedDays[CUSTOM_DAY]).toBeUndefined()
    expect(ctx.current!.workoutData).toEqual(program)
  })

  it("resets one finished day so it can be run again, leaving the others", async () => {
    const set = { weight: 60, reps: 10 }
    await act(async () => {
      await ctx.current!.saveCompletedDays({ 1: { 0: { 0: set } }, 2: { 0: { 0: set } } } as never)
      await ctx.current!.saveLockedDays({ 1: true, 2: true })
    })

    await act(async () => {
      await ctx.current!.resetDay(1)
    })

    expect(ctx.current!.isDayLocked(1)).toBe(false)
    expect(ctx.current!.completedDays[1]).toBeUndefined()
    expect(ctx.current!.isDayLocked(2)).toBe(true)
    expect(ctx.current!.completedDays[2]).toBeDefined()
    expect(ctx.current!.unlockedOverrides[1]).toBe(true)
  })
})
