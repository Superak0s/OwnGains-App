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
