import { useState } from "react"
import { create, act } from "react-test-renderer"
import { program } from "test-utils/fixtures"
import { resetMemorySqlite } from "test-utils/memorySqlite"
import { useProgramOperations } from "../useProgramOperations"
import { useServerSync } from "../useServerSync"
import { saveToStorage, STORAGE_KEYS } from "@shared/services/storage"
import { isProgramDirty } from "@shared/services/programDirty"
import type { WorkoutData } from "../../../types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

const offline = () => Promise.reject(new TypeError("Network request failed"))

const programApi = {
  renameExercise: jest.fn(),
  saveProgram: jest.fn(),
  fetchSavedProgram: jest.fn(),
}
const workoutApi = { getSessionHistory: jest.fn(async () => []) }

const hooks: {
  ops?: ReturnType<typeof useProgramOperations>
  sync?: ReturnType<typeof useServerSync>
  data?: WorkoutData | null
} = {}

function Harness() {
  const [workoutData, setWorkoutData] = useState<WorkoutData | null>(program)
  hooks.data = workoutData
  hooks.ops = useProgramOperations({
    workoutData,
    setWorkoutData,
    userId: "u1",
    saveToStorage,
    STORAGE_KEYS,
    programApi: programApi as never,
  })
  hooks.sync = useServerSync({
    userId: "u1",
    selectedSplit: "A",
    workoutData,
    setWorkoutData,
    completedDays: {},
    lockedDays: {},
    setCompletedDays: jest.fn(),
    setLockedDays: jest.fn(),
    currentSessionId: null,
    unlockedOverrides: {},
    saveToStorage,
    STORAGE_KEYS,
    clearActiveWorkout: jest.fn(),
    workoutApi: workoutApi as never,
    programApi: programApi as never,
  })
  return null
}

const firstExercise = (d: WorkoutData | null | undefined) => d!.days[0].split.A.exercises[0].name

beforeAll(() => {
  for (const m of ["error", "warn", "info", "debug"] as const) jest.spyOn(console, m).mockImplementation(() => {})
})

beforeEach(async () => {
  resetMemorySqlite()
  jest.clearAllMocks()
  programApi.fetchSavedProgram.mockResolvedValue(program)
  await act(async () => {
    create(<Harness />)
  })
  programApi.renameExercise.mockImplementation(offline)
  await act(async () => {
    await hooks.ops!.updateExerciseName(1, "A", 0, "Dumbbell Press")
  })
})

describe("program edited while the server was unreachable", () => {
  it("pushes the local edit up instead of letting the server's older copy rename the exercise back", async () => {
    expect(await isProgramDirty("u1")).toBe(true)
    programApi.saveProgram.mockResolvedValue(undefined)

    await act(async () => {
      await hooks.sync!.syncFromServer()
    })

    expect(programApi.saveProgram).toHaveBeenCalledWith(
      expect.objectContaining({ days: expect.any(Array) }),
    )
    expect(firstExercise(programApi.saveProgram.mock.calls[0][0])).toBe("Dumbbell Press")
    expect(programApi.fetchSavedProgram).not.toHaveBeenCalled()
    expect(firstExercise(hooks.data)).toBe("Dumbbell Press")
    expect(await isProgramDirty("u1")).toBe(false)
  })

  it("keeps the edit and retries the push on the next sync when the push itself fails", async () => {
    programApi.saveProgram.mockImplementation(offline)
    await act(async () => {
      await hooks.sync!.syncFromServer()
    })
    expect(programApi.fetchSavedProgram).not.toHaveBeenCalled()
    expect(firstExercise(hooks.data)).toBe("Dumbbell Press")
    expect(await isProgramDirty("u1")).toBe(true)

    programApi.saveProgram.mockResolvedValue(undefined)
    await act(async () => {
      await hooks.sync!.syncFromServer()
    })
    expect(programApi.saveProgram).toHaveBeenCalledTimes(2)
    expect(await isProgramDirty("u1")).toBe(false)
  })

  it("merges the server copy again once the push has succeeded, so edits from another device still arrive", async () => {
    programApi.saveProgram.mockResolvedValue(undefined)
    await act(async () => {
      await hooks.sync!.syncFromServer()
    })

    const fromOtherDevice = structuredClone(program)
    fromOtherDevice.days[0].split.A.exercises[0].name = "Machine Press"
    programApi.fetchSavedProgram.mockResolvedValue(fromOtherDevice)
    await act(async () => {
      await hooks.sync!.syncFromServer()
    })

    expect(firstExercise(hooks.data)).toBe("Machine Press")
  })
})
