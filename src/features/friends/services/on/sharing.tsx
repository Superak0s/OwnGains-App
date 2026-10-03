import { apiCall, parseApiResponse } from "@shared/services/apiClient"
import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import type {
  PermissionType,
  GrantedPermission,
  ReceivedPermission,
  JointInviteParams,
  LiveData,
} from "../../types"

interface FriendActiveSession {
  sessionId: string
}

export const sharingApi = {
  grantPermission: async (
    friendId: number | string,
    permissionType: PermissionType,
    payload: Record<string, unknown> | null = null,
  ): Promise<unknown> =>
    apiCall(`/api/sharing/permissions`, {
      method: "POST",
      body: JSON.stringify({ friendId, permissionType, payload }),
    }),

  revokePermission: async (permissionId: number | string): Promise<unknown> =>
    apiCall(`/api/sharing/permissions/${permissionId}`, { method: "DELETE" }),

  getPermissionPayload: async (
    permissionId: number | string,
  ): Promise<Record<string, unknown> | null> => {
    const data = await apiCall<{ payload?: Record<string, unknown> | null }>(
      `/api/sharing/permissions/${permissionId}/payload`,
    )
    return data.payload ?? null
  },

  getGrantedPermissions: async (): Promise<GrantedPermission[]> => {
    const data = await apiCall<{ permissions: Record<string, unknown>[] }>(
      `/api/sharing/permissions/granted`,
    )
    return (data.permissions || [])
      .filter((p) => p.id !== undefined && p.id !== null)
      .map((p) => ({
        id: p.id as string | number,
        toUserId: p.toUserId as string | number,
        toUsername: p.toUsername as string,
        permissionType: p.permissionType as PermissionType,
        payload: p.payload ?? null,
        hasPayload: p.hasPayload === true || (p.payload ?? null) !== null,
        createdAt: p.createdAt as string,
      })) as GrantedPermission[]
  },

  getReceivedPermissions: async (): Promise<ReceivedPermission[]> => {
    const data = await apiCall<{ permissions: Record<string, unknown>[] }>(
      `/api/sharing/permissions/received?includePayload=true`,
    )
    const permissions = (data.permissions || [])
      .filter((p) => p.id !== undefined && p.id !== null)
      .map((p) => ({
        id: p.id as string | number,
        fromUserId: p.fromUserId as string | number,
        fromUsername: p.fromUsername as string,
        permissionType: p.permissionType as PermissionType,
        payload: (p.payload ?? null) as Record<string, unknown> | null,
        hasPayload: p.hasPayload === true || (p.payload ?? null) !== null,
        createdAt: p.createdAt as string,
      })) as ReceivedPermission[]
    // The server inlines at most 10 payloads. The rest come back as null and are fetched one by one.
    await Promise.all(
      permissions
        .filter((p) => p.hasPayload && p.payload === null)
        .map(async (p) => {
          p.payload = await sharingApi
            .getPermissionPayload(p.id)
            .catch(() => null)
        }),
    )
    return permissions
  },

  getFriendSessions: async (
    friendId: number | string,
    limit: number = 60,
  ): Promise<unknown[]> => {
    const data = await apiCall<{ sessions: unknown[] }>(
      `/api/sharing/sessions/friend/${friendId}?limit=${limit}`,
    )
    return data.sessions || []
  },

  /**
   * The history list with each session's set timings, in one request. Null
   * when the server ignores `includeTimings` (older servers return sessions
   * without a `setTimings` field), so the caller falls back to per-session
   * detail calls.
   */
  getFriendSessionsWithTimings: async (
    friendId: number | string,
    limit: number = 60,
  ): Promise<LiveData[] | null> => {
    const data = await apiCall<{ sessions: LiveData[] }>(
      `/api/sharing/sessions/friend/${friendId}?limit=${limit}&includeTimings=true`,
    )
    const sessions = data.sessions || []
    if (sessions.some((s) => !Array.isArray((s as { setTimings?: unknown }).setTimings)))
      return null
    return sessions
  },

  getFriendSessionDetails: async (
    friendId: number | string,
    sessionId: number | string,
  ): Promise<LiveData | null> => {
    const data = await apiCall<{ session: unknown }>(
      `/api/sharing/sessions/friend/${friendId}/${sessionId}`,
    )
    return data.session || null
  },

  // Needs raw response for 404 check
  getFriendSessionStatus: async (
    friendId: number | string,
  ): Promise<{ hasActiveSession: boolean }> => {
    const response = await authenticatedFetch(
      `/api/sharing/joint-sessions/friend/${friendId}/status`,
    )
    if (response.status === 404) return { hasActiveSession: false }
    return parseApiResponse(response)
  },

  /** Null on a server without the batch route. Ask per friend instead. */
  getFriendSessionStatuses: async (
    friendIds: (number | string)[],
  ): Promise<Record<string, boolean> | null> => {
    const response = await authenticatedFetch(
      `/api/sharing/joint-sessions/status?friendIds=${friendIds.map(encodeURIComponent).join(",")}`,
    )
    if (response.status === 404) return null
    const data = await parseApiResponse<{
      statuses: Record<string, { hasActiveSession: boolean }>
    }>(response)
    const map: Record<string, boolean> = {}
    for (const id of friendIds)
      map[String(id)] = !!data.statuses?.[String(id)]?.hasActiveSession
    return map
  },

  sendJointInvite: async ({
    toUserId,
  }: JointInviteParams): Promise<unknown> =>
    apiCall(`/api/sharing/joint-sessions/invite`, {
      method: "POST",
      body: JSON.stringify({ toUserId }),
    }),

  acceptJointInvite: async (inviteId: number | string): Promise<unknown> =>
    apiCall(`/api/sharing/joint-sessions/invites/${inviteId}/accept`, {
      method: "POST",
    }),

  declineJointInvite: async (inviteId: number | string): Promise<unknown> =>
    apiCall(`/api/sharing/joint-sessions/invites/${inviteId}/decline`, {
      method: "POST",
    }),

  pushJointProgress: async (
    jointSessionId: string,
    progress: unknown,
  ): Promise<unknown> =>
    apiCall(`/api/sharing/joint-sessions/${jointSessionId}/progress`, {
      method: "PATCH",
      body: JSON.stringify(progress),
    }),

  leaveJointSession: async (jointSessionId: string): Promise<unknown> =>
    apiCall(`/api/sharing/joint-sessions/${jointSessionId}/leave`, {
      method: "DELETE",
    }),

  getFriendActiveSession: async (
    friendId: number | string,
  ): Promise<FriendActiveSession | null> => {
    const response = await authenticatedFetch(
      `/api/sharing/watch/friend/${friendId}/active`,
    )
    if (response.status === 404 || response.status === 403) return null
    const data = await parseApiResponse<{ session?: FriendActiveSession }>(response)
    return data.session ?? null
  },

  getFriendLiveSession: async (
    friendId: number | string,
    sessionId: number | string,
  ): Promise<LiveData | null> => {
    const response = await authenticatedFetch(
      `/api/sharing/watch/friend/${friendId}/session/${sessionId}/live`,
    )
    if (response.status === 404 || response.status === 403) return null
    const data = await parseApiResponse<{ liveSession?: LiveData }>(response)
    return data.liveSession ?? null
  },
}
