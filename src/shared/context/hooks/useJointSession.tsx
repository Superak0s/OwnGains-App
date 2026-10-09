import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { sharingApi } from "@features/friends/services/index"
import { normalizeExerciseName } from "@utils/exerciseMatching"
import type { RealtimeSocket, WebSocketMessage } from "./useRealtimeSocket"
import { captureException, log, metric } from "../../services/crashReporting"
import { ApiError } from "../../services/apiError"

const SYNC_PULSE_MS = 1_500
const WATCH_POLL_MS = 10_000
// Servers that push `watch_progress` keep the poll only as a fallback. Their
// watch expires after 150s without a poll, so this must stay well under that.
const WATCH_PUSHED_POLL_MS = 60_000
// The socket closes on every AppState change, so an app switch must not be
// mistaken for the partner going away. Answering a message takes longer than
// a few seconds, and the cost of waiting is only a stale partner panel.
const SOCKET_DROP_GRACE_MS = 60_000
const MAX_PARTNER_COMPLETED_SETS = 500

export interface JointExerciseEntry {
  name: string
  sets: number
  split?: string
}

interface JointSessionParticipant {
  userId: string
  username: string
  exerciseNames?: Array<{ name: string; sets: number }>
}

export interface JointSession {
  id: string
  participants: JointSessionParticipant[]
}

export interface PartnerProgress {
  exerciseIndex: number | null
  setIndex: number | null
  exerciseName: string | null
  readyForNext: boolean
  lastUpdated: number
}

export interface PartnerCompletedSet {
  exerciseName: string
  setIndex: number
}

function hasCompletedSet(
  sets: PartnerCompletedSet[],
  candidate: PartnerCompletedSet,
): boolean {
  const key = normalizeExerciseName(candidate.exerciseName)
  return sets.some(
    (s) =>
      normalizeExerciseName(s.exerciseName) === key &&
      s.setIndex === candidate.setIndex,
  )
}

export interface WatchTarget {
  friendId: string
  friendUsername: string
  sessionId: string
}

export interface Watcher {
  id: string
  username: string
}

interface UseJointSessionOptions {
  userId: string | null
  currentSessionId: string | null
  workoutStartTime: string | null
  currentDayExercises?: JointExerciseEntry[]
  selectedSplit?: string | null
  socket: RealtimeSocket | null
}

interface UseJointSessionReturn {
  isInJointSession: boolean
  jointSession: JointSession | null
  partnerProgress: PartnerProgress | null
  myProgress: Record<string, unknown> | null
  pendingInvite: WebSocketMessage | null
  inviteStatus: string
  isPartnerReady: boolean
  syncPulse: boolean
  partnerExerciseList: Array<{ name: string; sets: number }>
  sendInvite: (toUserId: string) => Promise<boolean>
  acceptInvite: () => Promise<boolean>
  declineInvite: () => Promise<void>
  leaveJointSession: () => Promise<void>
  pushProgress: (args: {
    exerciseIndex: number | null
    setIndex: number | null
    exerciseName: string | null
    readyForNext?: boolean
  }) => Promise<void>
  partnerCompletedSets: PartnerCompletedSet[]
  isWatching: boolean
  watchTarget: WatchTarget | null
  watchSession: unknown
  watchLoading: boolean
  watchError: string | null
  startWatching: (
    friendId: string,
    friendUsername: string,
    sessionId: string,
  ) => Promise<boolean>
  stopWatching: () => void
  watchers: Watcher[]
  blockWatcher: (watcherId: string) => Promise<void>
  handleSocketMessage: (msg: WebSocketMessage) => void
}

interface JointProgressPayload {
  exerciseIndex?: number | null
  setIndex?: number | null
  exerciseName?: string | null
  readyForNext?: boolean
  exerciseNames?: Array<{ name: string; sets: number }>
  fromUserId?: string
}

interface JointInviteMessage extends WebSocketMessage {
  inviteId?: number | string
}

interface InviteStatusMessage extends WebSocketMessage {
  status: string
  jointSession?: JointSession
}

interface AcceptInviteResponse {
  jointSession?: JointSession
  inviteId?: string
}

export const useJointSession = ({
  userId,
  currentSessionId,
  workoutStartTime,
  currentDayExercises = [],
  selectedSplit = null,
  socket,
}: UseJointSessionOptions): UseJointSessionReturn => {
  const [jointSession, setJointSession] = useState<JointSession | null>(null)
  const [partnerProgress, setPartnerProgress] =
    useState<PartnerProgress | null>(null)
  const [myProgress, setMyProgress] = useState<Record<string, unknown> | null>(
    null,
  )
  const [pendingInvite, setPendingInvite] = useState<WebSocketMessage | null>(
    null,
  )
  const [inviteStatus, setInviteStatus] = useState<string>("idle")
  const [isPartnerReady, setIsPartnerReady] = useState(false)
  const [syncPulse, setSyncPulse] = useState(false)
  const [partnerCompletedSets, setPartnerCompletedSets] = useState<
    PartnerCompletedSet[]
  >([])

  const [watchTarget, setWatchTarget] = useState<WatchTarget | null>(null)
  const [watchSession, setWatchSession] = useState<unknown>(null)
  const [watchLoading, setWatchLoading] = useState(false)
  const [watchError, setWatchError] = useState<string | null>(null)
  const [watchers, setWatchers] = useState<Watcher[]>([])
  const [watchPushed, setWatchPushed] = useState(false)

  const syncPulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const jointSessionIdRef = useRef<string | null>(null)
  const acceptInviteInFlightRef = useRef(false)
  const declineInviteInFlightRef = useRef(false)
  const leaveSessionInFlightRef = useRef(false)
  const watchTargetRef = useRef<WatchTarget | null>(null)
  const partnerProgressRef = useRef<PartnerProgress | null>(null)
  const lastPushedKeyRef = useRef<string | null>(null)

  const isInJointSession = inviteStatus === "active" && !!jointSession
  const isWatching = !!watchTarget
  const jointSessionId = jointSession?.id ?? null

  useEffect(() => {
    jointSessionIdRef.current = jointSessionId
  }, [jointSessionId])
  useEffect(() => {
    watchTargetRef.current = watchTarget
  }, [watchTarget])

  const myExerciseNames = useMemo(() => {
    return currentDayExercises
      .filter((e) => e.split === selectedSplit)
      .map((e) => ({ name: e.name, sets: e.sets }))
      .filter((e) => e.name)
  }, [currentDayExercises, selectedSplit])

  const myExerciseNamesKey = useMemo(
    () => myExerciseNames.map((e) => e.name).join("||"),
    [myExerciseNames],
  )

  const partnerExerciseList = useMemo(() => {
    if (!isInJointSession || !currentDayExercises.length) return []
    const otherSplitExercises = currentDayExercises.filter(
      (e) => e.split && e.split !== selectedSplit,
    )
    const source =
      otherSplitExercises.length > 0
        ? otherSplitExercises
        : currentDayExercises
    const seen = new Set<string>()
    const result: Array<{ name: string; sets: number }> = []
    for (const e of source) {
      const key = normalizeExerciseName(e.name ?? "")
      if (key && !seen.has(key)) {
        seen.add(key)
        result.push({ name: e.name, sets: e.sets })
      }
    }
    return result
  }, [isInJointSession, currentDayExercises, selectedSplit])

  const triggerSyncPulse = useCallback(() => {
    setSyncPulse(true)
    if (syncPulseTimer.current) clearTimeout(syncPulseTimer.current)
    syncPulseTimer.current = setTimeout(
      () => setSyncPulse(false),
      SYNC_PULSE_MS,
    )
  }, [])

  const resetJointState = useCallback(() => {
    setJointSession(null)
    partnerProgressRef.current = null
    setPartnerProgress(null)
    setInviteStatus("idle")
    setIsPartnerReady(false)
    setMyProgress(null)
    setPartnerCompletedSets([])
  }, [])

  const applyJointProgress = useCallback(
    (progress: JointProgressPayload) => {
      // The server broadcasts to every participant, so our own push comes
      // straight back and would be applied as the partner's progress.
      if (
        progress.fromUserId &&
        userId &&
        String(progress.fromUserId) === String(userId)
      )
        return

      if (progress.exerciseNames && progress.fromUserId) {
        setJointSession((prevSession) => {
          if (!prevSession?.participants?.length) return prevSession
          return {
            ...prevSession,
            participants: prevSession.participants.map((p) =>
              p.userId === progress.fromUserId
                ? { ...p, exerciseNames: progress.exerciseNames }
                : p,
            ),
          }
        })
      }

      // Compared against a ref, not inside a setState updater: React may
      // run an updater more than once, which would fire the pulse twice.
      const prev = partnerProgressRef.current
      const changed =
        prev?.exerciseIndex !== progress.exerciseIndex ||
        prev?.setIndex !== progress.setIndex

      const next: PartnerProgress = {
        exerciseIndex: progress.exerciseIndex ?? null,
        setIndex: progress.setIndex ?? null,
        exerciseName: progress.exerciseName ?? null,
        readyForNext: progress.readyForNext ?? false,
        lastUpdated: Date.now(),
      }
      partnerProgressRef.current = next
      setPartnerProgress(next)

      if (changed && progress.readyForNext) {
        triggerSyncPulse()
      }

      if (
        changed &&
        progress.exerciseName != null &&
        progress.setIndex != null
      ) {
        const completed = {
          exerciseName: progress.exerciseName,
          setIndex: progress.setIndex,
        }
        setPartnerCompletedSets((prevSets) =>
          hasCompletedSet(prevSets, completed)
            ? prevSets
            : [...prevSets, completed].slice(-MAX_PARTNER_COMPLETED_SETS),
        )
      }

      setIsPartnerReady(progress.readyForNext ?? false)
    },
    [userId, triggerSyncPulse],
  )

  const applyWatchSnapshot = useCallback((live: unknown) => {
    if (!live) {
      setWatchError("session_ended")
      setWatchTarget(null)
      setWatchSession(null)
      return
    }
    setWatchSession(live)
  }, [])

  const handleSocketMessage = useCallback(
    (msg: WebSocketMessage) => {
      console.debug("[WS_MESSAGE]", msg.type, msg)

      switch (msg.type) {
        case "joint_progress": {
          const progress = (
            msg as WebSocketMessage & { progress?: JointProgressPayload }
          ).progress
          if (!progress) break
          applyJointProgress(progress)
          break
        }

        case "joint_invite": {
          if (isInJointSession) {
            const inviteId = (msg as JointInviteMessage).inviteId
            if (inviteId) void sharingApi.declineJointInvite(inviteId)
          } else setPendingInvite(msg)
          break
        }

        case "invite_status": {
          // Cast through unknown first to narrow to InviteStatusMessage
          const statusMsg = msg as unknown as InviteStatusMessage
          if (statusMsg.status === "accepted" && statusMsg.jointSession) {
            setInviteStatus("active")
            setJointSession(statusMsg.jointSession)
            jointSessionIdRef.current = statusMsg.jointSession.id
          } else if (statusMsg.status === "declined") {
            setInviteStatus("declined")
          } else if (statusMsg.status === "session_ended") {
            resetJointState()
          }
          break
        }

        case "joint_session_ended": {
          resetJointState()
          break
        }

        case "watch_progress": {
          const target = watchTargetRef.current
          if (
            !target ||
            String(msg.friendId) !== target.friendId ||
            String(msg.sessionId) !== target.sessionId
          )
            break
          setWatchPushed(true)
          applyWatchSnapshot(msg.liveSession ?? null)
          break
        }

        case "watch_started":
        case "watch_stopped": {
          const id = String(msg.watcherId)
          const username = String(msg.watcherUsername ?? "A friend")
          setWatchers((prev) => {
            const rest = prev.filter((w) => w.id !== id)
            return msg.type === "watch_started" ? [...rest, { id, username }] : rest
          })
          break
        }

        default:
          break
      }
    },
    [isInJointSession, applyJointProgress, resetJointState, applyWatchSnapshot],
  )

  // Nothing else clears these, so the invite UI would stay in its failed state
  // until a fresh invite happened to arrive.
  useEffect(() => {
    if (inviteStatus !== "declined" && inviteStatus !== "error") return
    const timer = setTimeout(() => setInviteStatus("idle"), 5_000)
    return () => clearTimeout(timer)
  }, [inviteStatus])

  const sendInvite = useCallback(
    async (toUserId: string): Promise<boolean> => {
      if (!currentSessionId) return false
      setInviteStatus("sending")
      try {
        const res = await sharingApi.sendJointInvite({ toUserId })
        if (!(res as AcceptInviteResponse)?.inviteId) {
          captureException(new Error("Joint invite sent without an inviteId"), {
            stage: "sendJointInvite",
          })
          setInviteStatus("error")
          return false
        }
        setInviteStatus("waiting")
        metric.count("joint.invite_sent", 1, { attributes: { outcome: "ok" } })
        return true
      } catch (err) {
        console.error("Failed to send joint invite:", err)
        metric.count("joint.invite_sent", 1, { attributes: { outcome: "failed" } })
        captureException(err, { stage: "sendJointInvite" })
        setInviteStatus("error")
        return false
      }
    },
    [currentSessionId],
  )

  const acceptInvite = useCallback(async (): Promise<boolean> => {
    if (!pendingInvite || acceptInviteInFlightRef.current) return false
    const inviteId = (pendingInvite as JointInviteMessage).inviteId
    if (!inviteId) {
      console.warn("Joint invite arrived without an inviteId, discarding")
      setPendingInvite(null)
      return false
    }
    acceptInviteInFlightRef.current = true
    try {
      const res = (await sharingApi.acceptJointInvite(
        inviteId,
      )) as AcceptInviteResponse
      if (!res?.jointSession) {
        captureException(new Error("Joint invite accepted without a session"), {
          stage: "acceptJointInvite",
        })
        setInviteStatus("error")
        return false
      }
      setPendingInvite(null)
      setInviteStatus("active")
      setJointSession(res.jointSession)
      jointSessionIdRef.current = res.jointSession.id
      metric.count("joint.invite_accepted", 1, { attributes: { outcome: "ok" } })
      return true
    } catch (err) {
      // The server answers an expired or withdrawn invite with 404. Clear it so
      // the button stops looking live.
      if (err instanceof ApiError && err.status === 404) {
        setPendingInvite(null)
        setInviteStatus("declined")
        return false
      }
      console.error("Failed to accept joint invite:", err)
      metric.count("joint.invite_accepted", 1, {
        attributes: { outcome: "failed" },
      })
      captureException(err, { stage: "acceptJointInvite" })
      setInviteStatus("error")
      return false
    } finally {
      acceptInviteInFlightRef.current = false
    }
  }, [pendingInvite])

  const declineInvite = useCallback(async (): Promise<void> => {
    if (!pendingInvite || declineInviteInFlightRef.current) return
    declineInviteInFlightRef.current = true
    try {
      await sharingApi.declineJointInvite(pendingInvite.inviteId as string)
    } catch (error) {
      // The invite is dropped locally either way.
      captureException(error, { stage: "declineJointInvite" })
    }
    setPendingInvite(null)
    declineInviteInFlightRef.current = false
  }, [pendingInvite])

  const leaveJointSession = useCallback(async (): Promise<void> => {
    if (leaveSessionInFlightRef.current) return
    leaveSessionInFlightRef.current = true
    const id = jointSessionIdRef.current
    if (id) {
      socket?.send({ type: "leave_joint_session", jointSessionId: id })
      try {
        await sharingApi.leaveJointSession(id)
      } catch (error) {
        // The socket leave already went out, so local teardown proceeds regardless.
        captureException(error, { stage: "leaveJointSession" })
      }
    }
    leaveSessionInFlightRef.current = false
    resetJointState()
  }, [socket, resetJointState])

  const pushProgress = useCallback(
    async ({
      exerciseIndex,
      setIndex,
      exerciseName,
      readyForNext = false,
    }: {
      exerciseIndex: number | null
      setIndex: number | null
      exerciseName: string | null
      readyForNext?: boolean
    }): Promise<void> => {
      const id = jointSessionIdRef.current
      if (!id) return

      const progress = {
        exerciseIndex,
        setIndex,
        exerciseName,
        readyForNext,
        exerciseNames: myExerciseNames,
      }
      setMyProgress(progress)

      const sent = socket?.send({
        type: "push_joint_progress",
        jointSessionId: id,
        progress,
      })
      if (!sent) {
        try {
          await sharingApi.pushJointProgress(id, progress)
        } catch (err) {
          console.warn("Failed to push joint progress:", err)
          metric.count("joint.progress_push_failed")
          log.warn("joint.progress_push_failed", {
            reason: (err as Error).message,
          })
        }
      }
    },
    [socket, myExerciseNames],
  )

  useEffect(() => {
    if (!isInJointSession || !myExerciseNamesKey) return
    if (lastPushedKeyRef.current === myExerciseNamesKey) return
    lastPushedKeyRef.current = myExerciseNamesKey

    const id = jointSessionIdRef.current
    if (!id) return

    const progress = {
      exerciseIndex: null,
      setIndex: null,
      exerciseName: null,
      readyForNext: false,
      exerciseNames: myExerciseNames,
    }

    if (socket?.connected) {
      socket.send({ type: "push_joint_progress", jointSessionId: id, progress })
    } else {
      sharingApi.pushJointProgress(id, progress).catch((error) =>
        captureException(error, { stage: "pushJointProgress" }),
      )
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one push per exercise-name change, guarded by lastPushedKeyRef
  }, [isInJointSession, myExerciseNamesKey])

  useEffect(() => {
    if (!isInJointSession) lastPushedKeyRef.current = null
  }, [isInJointSession])

  const watchRequestRef = useRef(0)
  const startWatching = useCallback(
    async (
      friendId: string,
      friendUsername: string,
      sessionId: string,
    ): Promise<boolean> => {
      // Tapping a second friend before the first response arrives would
      // otherwise show the first friend's session under the second's name.
      const requestId = ++watchRequestRef.current
      const isCurrent = (): boolean => watchRequestRef.current === requestId
      setWatchTarget({ friendId, friendUsername, sessionId })
      setWatchSession(null)
      setWatchPushed(false)
      setWatchError(null)
      setWatchLoading(true)
      try {
        const live = await sharingApi.getFriendLiveSession(friendId, sessionId)
        if (!isCurrent()) return false
        if (!live) {
          metric.count("watch.started", 1, { attributes: { outcome: "ended" } })
          setWatchError("session_ended")
          setWatchTarget(null)
          setWatchLoading(false)
          return false
        }
        setWatchSession(live)
        setWatchLoading(false)
        metric.count("watch.started", 1, { attributes: { outcome: "ok" } })
        return true
      } catch (err) {
        console.error("Failed to start watching:", err)
        metric.count("watch.started", 1, { attributes: { outcome: "failed" } })
        captureException(err, { stage: "startWatching" })
        if (!isCurrent()) return false
        setWatchError("poll_error")
        setWatchTarget(null)
        setWatchLoading(false)
        return false
      }
    },
    [],
  )

  // Older servers never push `watch_progress`, so the fast poll stays until the
  // first push proves this one does. A revoked grant only shows up as a failed
  // fetch, which is what ends the watch.
  const socketConnected = !!socket?.connected
  const refreshWatch = useCallback(
    (target: WatchTarget, stage: string) => {
      void sharingApi
        .getFriendLiveSession(target.friendId, target.sessionId)
        .then((live) => {
          if (watchTargetRef.current === target) applyWatchSnapshot(live)
        })
        .catch((error) => captureException(error, { stage }))
    },
    [applyWatchSnapshot],
  )

  useEffect(() => {
    if (!watchTarget) return
    const timer = setInterval(
      () => refreshWatch(watchTarget, "pollWatch"),
      socketConnected && watchPushed ? WATCH_PUSHED_POLL_MS : WATCH_POLL_MS,
    )
    return () => clearInterval(timer)
  }, [watchTarget, socketConnected, watchPushed, refreshWatch])

  const onSocketReconnect = socket?.onReconnect
  useEffect(() => {
    if (!watchTarget || !onSocketReconnect) return
    return onSocketReconnect(() => refreshWatch(watchTarget, "reconnectWatch"))
  }, [watchTarget, onSocketReconnect, refreshWatch])

  const stopWatching = useCallback(() => {
    setWatchTarget(null)
    setWatchSession(null)
    setWatchPushed(false)
    setWatchError(null)
    setWatchLoading(false)
  }, [])

  // Revoking the grant makes the watcher's next poll fail, and the server then
  // drops the watch on its own.
  const blockWatcher = useCallback(async (watcherId: string): Promise<void> => {
    const grants = await sharingApi.getGrantedPermissions()
    await Promise.all(
      grants
        .filter(
          (g) =>
            String(g.toUserId) === watcherId && g.permissionType === "watch_session",
        )
        .map((g) => sharingApi.revokePermission(g.id)),
    )
    setWatchers((prev) => prev.filter((w) => w.id !== watcherId))
  }, [])

  useEffect(() => {
    if (!workoutStartTime) setWatchers([])
    if (!workoutStartTime && isInJointSession) void leaveJointSession()
  }, [workoutStartTime, isInJointSession, leaveJointSession])

  // Joint state only ever advances through socket messages, so a closed socket
  // means the partner view is frozen on whatever it last saw. Nothing re-fetches
  // it on reconnect either, so tear it down rather than show a live partner
  // who may be gone.
  const wasConnectedRef = useRef(false)
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    const connected = !!socket?.connected
    if (connected && dropTimerRef.current) {
      clearTimeout(dropTimerRef.current)
      dropTimerRef.current = null
    }
    if (wasConnectedRef.current && !connected && !dropTimerRef.current) {
      dropTimerRef.current = setTimeout(() => {
        dropTimerRef.current = null
        if (isInJointSession || inviteStatus !== "idle") {
          void leaveJointSession()
          resetJointState()
        }
        if (watchTargetRef.current) stopWatching()
      }, SOCKET_DROP_GRACE_MS)
    }
    wasConnectedRef.current = connected
  }, [
    socket?.connected,
    isInJointSession,
    inviteStatus,
    resetJointState,
    stopWatching,
    leaveJointSession,
  ])

  useEffect(
    () => () => {
      if (dropTimerRef.current) clearTimeout(dropTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (syncPulseTimer.current) clearTimeout(syncPulseTimer.current)
    }
  }, [])

  return {
    isInJointSession,
    jointSession,
    partnerProgress,
    myProgress,
    pendingInvite,
    inviteStatus,
    isPartnerReady,
    syncPulse,
    partnerExerciseList,
    sendInvite,
    acceptInvite,
    declineInvite,
    leaveJointSession,
    pushProgress,
    partnerCompletedSets,
    isWatching,
    watchTarget,
    watchSession,
    watchLoading,
    watchError,
    startWatching,
    stopWatching,
    watchers,
    blockWatcher,
    handleSocketMessage,
  }
}
