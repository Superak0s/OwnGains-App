import { act, renderHook } from "@testing-library/react-native"
import { useJointSession } from "../useJointSession"
import type { RealtimeSocket, WebSocketMessage } from "../useRealtimeSocket"
import { ApiError } from "@shared/services/apiError"
import { sharingApi } from "@features/friends/services/index"

jest.mock("@features/friends/services/index", () => ({
  sharingApi: {
    sendJointInvite: jest.fn(),
    acceptJointInvite: jest.fn(),
    declineJointInvite: jest.fn(),
    leaveJointSession: jest.fn(),
    pushJointProgress: jest.fn(),
    getFriendLiveSession: jest.fn(),
    getGrantedPermissions: jest.fn(),
    revokePermission: jest.fn(),
  },
}))

jest.mock("@shared/services/crashReporting", () => ({
  captureException: jest.fn(),
  log: { warn: jest.fn(), info: jest.fn() },
  metric: { count: jest.fn() },
}))

const api = sharingApi as jest.Mocked<typeof sharingApi>

const session = {
  id: "js1",
  participants: [
    { userId: "u1", username: "me" },
    { userId: "u2", username: "buddy" },
  ],
}

const invite: WebSocketMessage = { type: "joint_invite", inviteId: 9, fromUsername: "buddy" }

const makeSocket = (connected: boolean): RealtimeSocket => ({
  connected,
  send: jest.fn(() => connected),
  subscribe: jest.fn(() => () => {}),
  onReconnect: jest.fn(() => () => {}),
  authError: false,
  connectionFailed: false,
})

type Props = { socket: RealtimeSocket | null; workoutStartTime: string | null }

async function setup(initial: Partial<Props> = {}) {
  return renderHook(
    (props: Props) =>
      useJointSession({
        userId: "u1",
        currentSessionId: "s1",
        workoutStartTime: props.workoutStartTime,
        socket: props.socket,
      }),
    {
      initialProps: {
        socket: makeSocket(true),
        workoutStartTime: "2026-10-07T10:00:00.000Z",
        ...initial,
      },
    },
  )
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, "debug").mockImplementation(() => {})
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  jest.useRealTimers()
})

describe("useJointSession invites", () => {
  it("joins the partner's session when an invite is accepted", async () => {
    api.acceptJointInvite.mockResolvedValue({ jointSession: session } as never)
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    let ok = false
    await act(async () => {
      ok = await result.current.acceptInvite()
    })

    expect(api.acceptJointInvite).toHaveBeenCalledWith(9)
    expect(ok).toBe(true)
    expect(result.current.isInJointSession).toBe(true)
    expect(result.current.pendingInvite).toBeNull()
  })

  it("removes an expired invite from screen instead of leaving a dead accept button", async () => {
    api.acceptJointInvite.mockRejectedValue(new ApiError("Invite not found", 404))
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    await act(async () => {
      await result.current.acceptInvite()
    })

    expect(result.current.pendingInvite).toBeNull()
    expect(result.current.inviteStatus).toBe("declined")
    expect(result.current.isInJointSession).toBe(false)
  })

  it("keeps the invite so the user can retry when accepting fails for a reason other than expiry", async () => {
    api.acceptJointInvite.mockRejectedValue(new ApiError("Server error", 500))
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    await act(async () => {
      await result.current.acceptInvite()
    })

    expect(result.current.pendingInvite).toEqual(invite)
    expect(result.current.inviteStatus).toBe("error")
  })

  it("returns the invite UI to idle after a failure instead of freezing on the error state", async () => {
    jest.useFakeTimers()
    api.acceptJointInvite.mockRejectedValue(new ApiError("Server error", 500))
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    await act(async () => {
      await result.current.acceptInvite()
    })
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })

    expect(result.current.inviteStatus).toBe("idle")
  })

  it("drops a declined invite locally even when the decline request fails", async () => {
    api.declineJointInvite.mockRejectedValue(new Error("Network request failed"))
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    await act(async () => {
      await result.current.declineInvite()
    })

    expect(api.declineJointInvite).toHaveBeenCalledWith(9)
    expect(result.current.pendingInvite).toBeNull()
  })

  it("auto-declines a second invite while already in a joint session instead of hijacking it", async () => {
    api.acceptJointInvite.mockResolvedValue({ jointSession: session } as never)
    api.declineJointInvite.mockResolvedValue(undefined as never)
    const { result } = await setup()

    await act(async () => result.current.handleSocketMessage(invite))
    await act(async () => {
      await result.current.acceptInvite()
    })
    await act(async () =>
      result.current.handleSocketMessage({ type: "joint_invite", inviteId: 10 }),
    )

    expect(api.declineJointInvite).toHaveBeenCalledWith(10)
    expect(result.current.pendingInvite).toBeNull()
    expect(result.current.jointSession?.id).toBe("js1")
  })

  it("does not show a live joint session when an invite is accepted while the server is unreachable", async () => {
    api.acceptJointInvite.mockRejectedValue(new TypeError("Network request failed"))
    const { result } = await setup({ socket: makeSocket(false) })

    await act(async () => result.current.handleSocketMessage(invite))
    let ok = true
    await act(async () => {
      ok = await result.current.acceptInvite()
    })

    expect(ok).toBe(false)
    expect(result.current.isInJointSession).toBe(false)
    expect(result.current.inviteStatus).toBe("error")
  })
})

describe("useJointSession partner state", () => {
  async function joined(props: Partial<Props> = {}) {
    api.acceptJointInvite.mockResolvedValue({ jointSession: session } as never)
    const hook = await setup(props)
    await act(async () => hook.result.current.handleSocketMessage(invite))
    await act(async () => {
      await hook.result.current.acceptInvite()
    })
    return hook
  }

  it("clears the partner panel when the partner ends the session", async () => {
    const { result } = await joined()
    await act(async () =>
      result.current.handleSocketMessage({
        type: "joint_progress",
        progress: { fromUserId: "u2", exerciseIndex: 0, setIndex: 1, exerciseName: "Bench Press" },
      }),
    )
    expect(result.current.partnerProgress?.setIndex).toBe(1)

    await act(async () => result.current.handleSocketMessage({ type: "joint_session_ended" }))

    expect(result.current.isInJointSession).toBe(false)
    expect(result.current.partnerProgress).toBeNull()
    expect(result.current.partnerCompletedSets).toEqual([])
  })

  it("ignores its own progress echoed back by the server so it is not shown as the partner's", async () => {
    const { result } = await joined()

    await act(async () =>
      result.current.handleSocketMessage({
        type: "joint_progress",
        progress: { fromUserId: "u1", exerciseIndex: 2, setIndex: 0, exerciseName: "Row" },
      }),
    )

    expect(result.current.partnerProgress).toBeNull()
  })

  it("tears down the joint session after the socket stays down past the grace period", async () => {
    jest.useFakeTimers()
    api.leaveJointSession.mockResolvedValue(undefined as never)
    const { result, rerender } = await joined()

    await rerender({ socket: makeSocket(false), workoutStartTime: "2026-10-07T10:00:00.000Z" })
    await act(async () => {
      jest.advanceTimersByTime(59_000)
    })
    expect(result.current.isInJointSession).toBe(true)

    await act(async () => {
      jest.advanceTimersByTime(1_000)
    })
    expect(result.current.isInJointSession).toBe(false)
    expect(api.leaveJointSession).toHaveBeenCalledWith("js1")
  })

  it("keeps the joint session when the socket reconnects within the grace period (app switch)", async () => {
    jest.useFakeTimers()
    const { result, rerender } = await joined()

    await rerender({ socket: makeSocket(false), workoutStartTime: "2026-10-07T10:00:00.000Z" })
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    await rerender({ socket: makeSocket(true), workoutStartTime: "2026-10-07T10:00:00.000Z" })
    await act(async () => {
      jest.advanceTimersByTime(60_000)
    })

    expect(result.current.isInJointSession).toBe(true)
    expect(api.leaveJointSession).not.toHaveBeenCalled()
  })

  it("leaves the joint session when the workout ends so the partner is not left waiting", async () => {
    api.leaveJointSession.mockResolvedValue(undefined as never)
    const socket = makeSocket(true)
    const { result, rerender } = await joined({ socket })

    await rerender({ socket, workoutStartTime: null })

    expect(socket.send).toHaveBeenCalledWith({ type: "leave_joint_session", jointSessionId: "js1" })
    expect(result.current.isInJointSession).toBe(false)
  })

  it("falls back to HTTP for progress when the socket is down so the partner still sees the set", async () => {
    api.pushJointProgress.mockResolvedValue(undefined as never)
    const { result, rerender } = await joined()
    await rerender({ socket: makeSocket(false), workoutStartTime: "2026-10-07T10:00:00.000Z" })

    await act(async () => {
      await result.current.pushProgress({ exerciseIndex: 0, setIndex: 2, exerciseName: "Bench Press" })
    })

    expect(api.pushJointProgress).toHaveBeenCalledWith(
      "js1",
      expect.objectContaining({ setIndex: 2, exerciseName: "Bench Press" }),
    )
  })
})

describe("useJointSession sending an invite", () => {
  it("waits for the partner once the server returns an invite id", async () => {
    api.sendJointInvite.mockResolvedValue({ inviteId: "i1" } as never)
    const { result } = await setup()
    let ok = false
    await act(async () => {
      ok = await result.current.sendInvite("u2")
    })
    expect(ok).toBe(true)
    expect(result.current.inviteStatus).toBe("waiting")
  })

  it("shows an error instead of waiting forever when the server answers without an invite id", async () => {
    api.sendJointInvite.mockResolvedValue({} as never)
    const { result } = await setup()
    let ok = true
    await act(async () => {
      ok = await result.current.sendInvite("u2")
    })
    expect(ok).toBe(false)
    expect(result.current.inviteStatus).toBe("error")
  })

  it("shows an error when the invite request fails", async () => {
    api.sendJointInvite.mockRejectedValue(new Error("Network request failed"))
    const { result } = await setup()
    await act(async () => {
      await result.current.sendInvite("u2")
    })
    expect(result.current.inviteStatus).toBe("error")
  })

  it("joins the session when the partner accepts, and goes back to idle when they decline", async () => {
    const { result } = await setup()
    await act(async () =>
      result.current.handleSocketMessage({ type: "invite_status", status: "accepted", jointSession: session }),
    )
    expect(result.current.isInJointSession).toBe(true)

    await act(async () => result.current.handleSocketMessage({ type: "invite_status", status: "session_ended" }))
    expect(result.current.isInJointSession).toBe(false)

    await act(async () => result.current.handleSocketMessage({ type: "invite_status", status: "declined" }))
    expect(result.current.inviteStatus).toBe("declined")
  })

  it("discards an invite with no id instead of sending an accept the server can't match", async () => {
    const { result } = await setup()
    await act(async () => result.current.handleSocketMessage({ type: "joint_invite", fromUsername: "buddy" }))
    let ok = true
    await act(async () => {
      ok = await result.current.acceptInvite()
    })
    expect(ok).toBe(false)
    expect(api.acceptJointInvite).not.toHaveBeenCalled()
    expect(result.current.pendingInvite).toBeNull()
  })
})

describe("useJointSession shared exercises", () => {
  const exercises = [
    { name: "Bench Press", sets: 3, split: "A" },
    { name: "Squat", sets: 4, split: "B" },
    { name: "squat ", sets: 4, split: "B" },
  ]

  async function joinedWith(socket: RealtimeSocket) {
    api.acceptJointInvite.mockResolvedValue({ jointSession: session } as never)
    api.pushJointProgress.mockResolvedValue(undefined as never)
    const hook = await renderHook(() =>
      useJointSession({
        userId: "u1",
        currentSessionId: "s1",
        workoutStartTime: "2026-10-07T10:00:00.000Z",
        currentDayExercises: exercises,
        selectedSplit: "A",
        socket,
      }),
    )
    await act(async () => hook.result.current.handleSocketMessage(invite))
    await act(async () => {
      await hook.result.current.acceptInvite()
    })
    return hook
  }

  it("sends the partner this split's exercise list over the socket on joining", async () => {
    const socket = makeSocket(true)
    await joinedWith(socket)
    expect(socket.send).toHaveBeenCalledWith({
      type: "push_joint_progress",
      jointSessionId: "js1",
      progress: expect.objectContaining({ exerciseNames: [{ name: "Bench Press", sets: 3 }] }),
    })
  })

  it("sends the exercise list over HTTP when the socket is down", async () => {
    await joinedWith(makeSocket(false))
    expect(api.pushJointProgress).toHaveBeenCalledWith(
      "js1",
      expect.objectContaining({ exerciseNames: [{ name: "Bench Press", sets: 3 }] }),
    )
  })

  it("lists the other split's exercises for the partner once, ignoring case and spacing", async () => {
    const { result } = await joinedWith(makeSocket(true))
    expect(result.current.partnerExerciseList).toEqual([{ name: "Squat", sets: 4 }])
  })

  it("records each partner set once and pulses when the partner is ready for the next", async () => {
    const { result } = await joinedWith(makeSocket(true))
    const progress = { fromUserId: "u2", exerciseIndex: 0, setIndex: 0, exerciseName: "Squat", readyForNext: true }

    await act(async () => result.current.handleSocketMessage({ type: "joint_progress", progress }))
    await act(async () =>
      result.current.handleSocketMessage({
        type: "joint_progress",
        progress: { ...progress, exerciseIndex: 1, exerciseName: "squat" },
      }),
    )

    expect(result.current.partnerCompletedSets).toEqual([{ exerciseName: "Squat", setIndex: 0 }])
    expect(result.current.isPartnerReady).toBe(true)
    expect(result.current.syncPulse).toBe(true)
  })

  it("shows the partner's updated exercise list when they change their plan mid-session", async () => {
    const { result } = await joinedWith(makeSocket(true))
    await act(async () =>
      result.current.handleSocketMessage({
        type: "joint_progress",
        progress: { fromUserId: "u2", exerciseNames: [{ name: "Deadlift", sets: 5 }] },
      }),
    )
    expect(result.current.jointSession?.participants.find((p) => p.userId === "u2")).toMatchObject({
      exerciseNames: [{ name: "Deadlift", sets: 5 }],
    })
  })
})

describe("useJointSession watching", () => {
  it("shows the friend's live session", async () => {
    api.getFriendLiveSession.mockResolvedValue({ id: "live" } as never)
    const { result } = await setup()
    let ok = false
    await act(async () => {
      ok = await result.current.startWatching("u2", "buddy", "s9")
    })
    expect(ok).toBe(true)
    expect(result.current.watchSession).toEqual({ id: "live" })
    expect(result.current.isWatching).toBe(true)
  })

  it("tells the user the session has ended instead of showing an empty watch screen", async () => {
    api.getFriendLiveSession.mockResolvedValue(null as never)
    const { result } = await setup()
    await act(async () => {
      await result.current.startWatching("u2", "buddy", "s9")
    })
    expect(result.current.watchError).toBe("session_ended")
    expect(result.current.isWatching).toBe(false)
  })

  it("reports a load failure and stops watching", async () => {
    api.getFriendLiveSession.mockRejectedValue(new Error("Network request failed"))
    const { result } = await setup()
    await act(async () => {
      await result.current.startWatching("u2", "buddy", "s9")
    })
    expect(result.current.watchError).toBe("poll_error")
    expect(result.current.watchLoading).toBe(false)
  })

  it("doesn't show the first friend's session under the second friend's name after a quick switch", async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    api.getFriendLiveSession
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)) as never)
      .mockResolvedValueOnce({ id: "second" } as never)
    const { result } = await setup()

    let first: Promise<boolean> = Promise.resolve(true)
    await act(async () => {
      first = result.current.startWatching("u2", "buddy", "s1")
      await result.current.startWatching("u3", "other", "s2")
    })
    let firstOk = true
    await act(async () => {
      resolveFirst({ id: "first" })
      firstOk = await first
    })

    expect(firstOk).toBe(false)
    expect(result.current.watchTarget?.friendUsername).toBe("other")
    expect(result.current.watchSession).toEqual({ id: "second" })
  })

  it("leaves the watch screen when a later poll finds the session ended", async () => {
    jest.useFakeTimers()
    api.getFriendLiveSession.mockResolvedValueOnce({ id: "live" } as never).mockResolvedValue(null as never)
    const { result } = await setup()
    await act(async () => {
      await result.current.startWatching("u2", "buddy", "s9")
    })

    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })

    expect(result.current.isWatching).toBe(false)
    expect(result.current.watchError).toBe("session_ended")
  })

  it("clears everything on stop", async () => {
    api.getFriendLiveSession.mockResolvedValue({ id: "live" } as never)
    const { result } = await setup()
    await act(async () => {
      await result.current.startWatching("u2", "buddy", "s9")
    })
    await act(async () => result.current.stopWatching())
    expect(result.current.isWatching).toBe(false)
    expect(result.current.watchSession).toBeNull()
  })
})

describe("useJointSession watch pushes", () => {
  const progress = (liveSession: unknown, friendId = "u2", sessionId = 9): WebSocketMessage => ({
    type: "watch_progress",
    friendId,
    sessionId,
    liveSession,
  })

  async function watching(socket: RealtimeSocket = makeSocket(true)) {
    jest.useFakeTimers()
    api.getFriendLiveSession.mockResolvedValue({ id: "live" } as never)
    const hook = await setup({ socket })
    await act(async () => {
      await hook.result.current.startWatching("u2", "buddy", "9")
    })
    api.getFriendLiveSession.mockClear()
    return hook
  }

  it("shows a pushed snapshot right away", async () => {
    const { result } = await watching()
    await act(async () => result.current.handleSocketMessage(progress({ id: "pushed" })))
    expect(result.current.watchSession).toEqual({ id: "pushed" })
  })

  it("ignores a push for another friend's session", async () => {
    const { result } = await watching()
    await act(async () => result.current.handleSocketMessage(progress({ id: "other" }, "u3")))
    expect(result.current.watchSession).toEqual({ id: "live" })
  })

  it("leaves the watch screen when a push says the session ended", async () => {
    const { result } = await watching()
    await act(async () => result.current.handleSocketMessage(progress(null)))
    expect(result.current.isWatching).toBe(false)
    expect(result.current.watchError).toBe("session_ended")
  })

  it("polls every 60s instead of 10s once pushes arrive over a connected socket", async () => {
    const { result } = await watching()
    await act(async () => result.current.handleSocketMessage(progress({ id: "pushed" })))
    await act(async () => {
      jest.advanceTimersByTime(50_000)
    })
    expect(api.getFriendLiveSession).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })
    expect(api.getFriendLiveSession).toHaveBeenCalledTimes(1)
  })

  it("goes back to the 10s poll while the socket is down", async () => {
    const { result, rerender } = await watching()
    await act(async () => result.current.handleSocketMessage(progress({ id: "pushed" })))
    await rerender({ socket: makeSocket(false), workoutStartTime: "2026-10-07T10:00:00.000Z" })
    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })
    expect(api.getFriendLiveSession).toHaveBeenCalledTimes(1)
  })

  it("keeps updating every 10s from a server that never pushes", async () => {
    const { result } = await watching()
    api.getFriendLiveSession.mockResolvedValue({ id: "polled" } as never)
    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })
    expect(api.getFriendLiveSession).toHaveBeenCalledTimes(1)
    expect(result.current.watchSession).toEqual({ id: "polled" })
  })

  it("refetches the live session when the socket reconnects, to fill in missed pushes", async () => {
    let reconnect = () => {}
    const socket = makeSocket(true)
    socket.onReconnect = jest.fn((handler: () => void) => {
      reconnect = handler
      return () => {}
    })
    const { result } = await watching(socket)
    api.getFriendLiveSession.mockResolvedValue({ id: "fresh" } as never)
    await act(async () => reconnect())
    expect(api.getFriendLiveSession).toHaveBeenCalledWith("u2", "9")
    expect(result.current.watchSession).toEqual({ id: "fresh" })
  })

  it("ends the watch when the fast poll is refused after access is revoked", async () => {
    const { result } = await watching()
    await act(async () => result.current.handleSocketMessage(progress({ id: "pushed" })))
    api.getFriendLiveSession.mockResolvedValue(null as never)
    await act(async () => {
      jest.advanceTimersByTime(60_000)
    })
    expect(result.current.isWatching).toBe(false)
    expect(result.current.watchError).toBe("session_ended")
  })
})

describe("useJointSession watchers", () => {
  const watchStarted: WebSocketMessage = { type: "watch_started", watcherId: 7, watcherUsername: "alex" }

  it("lists each friend watching this workout once and drops them when they stop", async () => {
    const { result } = await setup()
    await act(async () => result.current.handleSocketMessage(watchStarted))
    await act(async () => result.current.handleSocketMessage(watchStarted))
    expect(result.current.watchers).toEqual([{ id: "7", username: "alex" }])

    await act(async () => result.current.handleSocketMessage({ type: "watch_stopped", watcherId: 7 }))
    expect(result.current.watchers).toEqual([])
  })

  it("blocks a watcher by revoking only their watch grant", async () => {
    api.getGrantedPermissions.mockResolvedValue([
      { id: 1, toUserId: 7, permissionType: "watch_session" },
      { id: 2, toUserId: 7, permissionType: "history" },
      { id: 3, toUserId: 8, permissionType: "watch_session" },
    ] as never)
    api.revokePermission.mockResolvedValue(undefined as never)
    const { result } = await setup()
    await act(async () => result.current.handleSocketMessage(watchStarted))

    await act(async () => {
      await result.current.blockWatcher("7")
    })

    expect(api.revokePermission).toHaveBeenCalledTimes(1)
    expect(api.revokePermission).toHaveBeenCalledWith(1)
    expect(result.current.watchers).toEqual([])
  })

  it("forgets the watcher list when the workout ends", async () => {
    const { result, rerender } = await setup()
    await act(async () => result.current.handleSocketMessage(watchStarted))
    await rerender({ socket: makeSocket(true), workoutStartTime: null })
    expect(result.current.watchers).toEqual([])
  })
})
