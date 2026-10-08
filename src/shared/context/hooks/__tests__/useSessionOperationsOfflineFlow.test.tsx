import React, { useState } from "react"
import { create, act } from "react-test-renderer"
import { useSessionOperations } from "../useSessionOperations"
import { useSyncManager } from "../useSyncManager"
import { workoutApi } from "@features/workout/services/index"
import { STORAGE_KEYS } from "@shared/services/storage"
import { pendingSyncStore } from "@shared/services/pendingSyncStore"
import type { PendingSync } from "@shared/types"
import type { CompletedDays } from "@utils/dayCompletion"
import { program } from "test-utils/fixtures"

jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    startSession: jest.fn(),
    recordSet: jest.fn(),
    endSession: jest.fn(),
    deleteSet: jest.fn(),
    updateSessionDay: jest.fn(),
  },
}))

const api = workoutApi as unknown as Record<"startSession" | "recordSet" | "endSession", jest.Mock>
const offline = () => Promise.reject(new TypeError("Network request failed"))

type Control = {
  ops: ReturnType<typeof useSessionOperations>
  sync: ReturnType<typeof useSyncManager>
  state: { currentSessionId: string | null; completedDays: CompletedDays; pendingSyncs: PendingSync[] }
}

const stored = new Map<string, unknown>()

function Harness({ control }: { control: { current: Control | null } }) {
  const [workoutStartTime, setWorkoutStartTime] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [lastSetEndTime, setLastSetEndTime] = useState<string | null>(null)
  const [completedDays, setCompletedDays] = useState<CompletedDays>({})
  const [lockedDays, setLockedDays] = useState({})
  const [unlockedOverrides, setUnlockedOverrides] = useState({})
  const [pendingSyncs, setPendingSyncs] = useState<PendingSync[]>([])
  const [isSyncing, setIsSyncing] = useState(false)
  const saveToStorage = async (key: string, value: unknown) => {
    stored.set(key, value)
    return true
  }
  const removeFromStorage = async (key: string) => stored.delete(key)

  const sync = useSyncManager({
    pendingSyncs,
    setPendingSyncs,
    isSyncing,
    setIsSyncing,
    currentSessionId,
    setCurrentSessionId,
    userId: "u1",
    saveToStorage,
    STORAGE_KEYS,
    useManualTime: true,
  })
  const ops = useSessionOperations({
    workoutStartTime,
    setWorkoutStartTime,
    currentSessionId,
    setCurrentSessionId,
    lastSetEndTime,
    setLastSetEndTime,
    lastActivityTime: null,
    setLastActivityTime: () => {},
    currentDay: 1,
    selectedSplit: "A",
    workoutData: program,
    completedDays,
    setCompletedDays,
    lockedDays,
    setLockedDays,
    unlockedOverrides,
    setUnlockedOverrides,
    userId: "u1",
    saveToStorage,
    removeFromStorage,
    STORAGE_KEYS,
    addPendingSync: sync.addPendingSync,
    removePendingSyncs: sync.removePendingSyncs,
    useManualTime: true,
    pendingSyncs,
  })
  control.current = { ops, sync, state: { currentSessionId, completedDays, pendingSyncs } }
  return null
}

let root: ReturnType<typeof create> | undefined
async function mount() {
  const control: { current: Control | null } = { current: null }
  await act(async () => {
    root = create(<Harness control={control} />)
  })
  return () => control.current!
}

const allSessionIdsSent = (): string[] => [
  ...api.recordSet.mock.calls.map((c) => String(c[0])),
  ...api.endSession.mock.calls.map((c) => String(c[0])),
]

beforeEach(() => {
  jest.clearAllMocks()
  stored.clear()
  jest.spyOn(pendingSyncStore, "replace").mockResolvedValue(undefined)
  jest.spyOn(pendingSyncStore, "apply").mockResolvedValue(undefined)
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
  jest.spyOn(console, "info").mockImplementation(() => {})
  jest.spyOn(console, "debug").mockImplementation(() => {})
})

afterEach(() => {
  act(() => root?.unmount())
  jest.restoreAllMocks()
})

describe("offline workout replayed on reconnect", () => {
  it("remaps the local_ session ID so every set and the end reach the server under the real ID", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    api.endSession.mockImplementation(offline)
    const get = await mount()

    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 1, 80, 7)
    })
    const localId = get().state.currentSessionId
    expect(localId).toMatch(/^local_/)
    await act(async () => {
      await get().ops.endWorkout()
    })
    expect(get().state.pendingSyncs.map((s) => s.type)).toEqual([
      "startSession",
      "recordSet",
      "recordSet",
      "endSession",
    ])

    jest.clearAllMocks()
    api.startSession.mockResolvedValue(501)
    api.recordSet.mockResolvedValue(undefined)
    api.endSession.mockResolvedValue(undefined)
    await act(async () => {
      await get().sync.syncPendingData()
    })

    expect(api.recordSet).toHaveBeenCalledTimes(2)
    expect(api.endSession).toHaveBeenCalledTimes(1)
    expect(allSessionIdsSent()).toEqual(["501", "501", "501"])
    expect(get().state.pendingSyncs).toEqual([])
  })

  it("keeps queued sets back during replay until their session start has synced, rather than posting the local_ ID", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    const get = await mount()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })

    api.recordSet.mockClear()
    await act(async () => {
      await get().sync.syncPendingData()
    })

    expect(api.recordSet).not.toHaveBeenCalled()
    expect(get().state.pendingSyncs.map((s) => s.type)).toEqual(["startSession", "recordSet"])
  })

  it("does not post a set to /api/sessions/local_.../set when the network returns before the queue replays", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    const get = await mount()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })

    api.recordSet.mockReset().mockResolvedValue(undefined)
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 1, 80, 7)
    })

    expect(allSessionIdsSent().filter((id) => id.startsWith("local_"))).toEqual([])
  })

  it("drops a set deleted before its local_ session replayed without calling the server", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    const get = await mount()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })

    let deleted = false
    await act(async () => {
      deleted = await get().ops.deleteSetDetails(1, 0, 0)
    })

    expect(deleted).toBe(true)
    expect((workoutApi as unknown as Record<string, jest.Mock>).deleteSet).not.toHaveBeenCalled()
    expect(get().state.pendingSyncs.map((s) => s.type)).toEqual(["startSession"])
  })

  it("moves the live workout onto the server ID once its start replays, so later sets are sent under it", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    const get = await mount()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })

    api.startSession.mockResolvedValue(777)
    api.recordSet.mockResolvedValue(undefined)
    await act(async () => {
      await get().sync.syncPendingData()
    })
    expect(get().state.currentSessionId).toBe("777")
    expect(stored.get(STORAGE_KEYS.CURRENT_SESSION_ID)).toBe("777")

    api.recordSet.mockClear()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 1, 80, 6)
    })

    expect(api.recordSet).toHaveBeenCalledWith("777", expect.objectContaining({ setIndex: 1 }))
  })

  it("remaps a set queued after its local session already replayed instead of orphaning it", async () => {
    api.startSession.mockImplementation(offline)
    api.recordSet.mockImplementation(offline)
    const get = await mount()
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })
    const localId = get().state.currentSessionId!

    api.startSession.mockResolvedValue(900)
    api.recordSet.mockResolvedValue(undefined)
    await act(async () => {
      await get().sync.syncPendingData()
    })

    await act(async () => {
      await get().sync.addPendingSync({
        type: "recordSet",
        data: { sessionId: localId, setIndex: 3, startTime: "s", endTime: "e", weight: 50, reps: 5 },
        timestamp: "2026-10-07T10:30:00.000Z",
      })
    })

    expect((get().state.pendingSyncs.at(-1)?.data as { sessionId?: string } | undefined)?.sessionId).toBe("900")
  })
})

describe("ending a server session that fails to reach the server", () => {
  it("keeps the recorded sets and queues the end instead of losing the workout", async () => {
    api.startSession.mockResolvedValue(42)
    api.recordSet.mockResolvedValueOnce(undefined).mockImplementation(offline)
    api.endSession.mockImplementation(offline)
    const get = await mount()

    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 0, 80, 8)
    })
    await act(async () => {
      await get().ops.saveSetDetails(1, 0, 1, 80, 7)
    })
    let ended = false
    await act(async () => {
      ended = await get().ops.endWorkout()
    })

    expect(ended).toBe(true)
    const days = stored.get(STORAGE_KEYS.COMPLETED_DAYS) as CompletedDays
    expect(Object.keys(days[1][0])).toEqual(["0", "1"])
    expect(get().state.completedDays[1][0][1]).toMatchObject({ weight: 80, reps: 7 })
    expect(get().state.pendingSyncs.map((s) => [s.type, (s.data as { sessionId?: string }).sessionId])).toEqual([
      ["recordSet", "42"],
      ["endSession", "42"],
    ])
    expect(get().state.currentSessionId).toBeNull()
  })
})
