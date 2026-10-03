import { apiCall } from "@shared/services/apiClient"
import type {
  Friend,
  PendingFriendRequest,
  SentFriendRequest,
  UserSearchResult,
  BlockedUser,
  ReportReason,
} from "../../types"

/**
 * Every field here is an unchecked cast of whatever the server sent. A row with
 * no id yields duplicate React keys and calls like DELETE /api/friends/undefined,
 * so drop those rather than render them.
 */
const withId = <T extends { id: string | number }>(rows: T[]): T[] =>
  rows.filter((row) => row.id !== undefined && row.id !== null)

export const friendsApi = {
  searchUsers: async (
    query: string,
    limit: number = 10,
  ): Promise<UserSearchResult[]> => {
    const params = new URLSearchParams({ q: query, limit: limit.toString() })
    const data = await apiCall<{ users: UserSearchResult[] }>(
      `/api/friends/search?${params.toString()}`,
    )
    return data.users
  },

  getFriends: async (): Promise<Friend[]> => {
    const data = await apiCall<{ friends: Record<string, unknown>[] }>(
      `/api/friends`,
    )
    return withId(
      (data.friends || []).map((friend) => ({
        id: friend.friendUserId as string | number,
        username: friend.username as string,
        createdAt: friend.friendsSince as string,
      })),
    )
  },

  sendFriendRequest: async (username: string): Promise<unknown> =>
    apiCall(`/api/friends/request`, {
      method: "POST",
      body: JSON.stringify({ username }),
    }),

  getPendingRequests: async (): Promise<PendingFriendRequest[]> => {
    const data = await apiCall<{ requests: Record<string, unknown>[] }>(
      `/api/friends/requests/pending`,
    )
    return withId(
      (data.requests || []).map((request) => ({
        id: request.friendshipId as string | number,
        senderId: request.userId as string | number,
        senderUsername: request.username as string,
        senderName: request.name as string,
        createdAt: request.createdAt as string,
      })),
    )
  },

  getSentRequests: async (): Promise<SentFriendRequest[]> => {
    const data = await apiCall<{ requests: Record<string, unknown>[] }>(
      `/api/friends/requests/sent`,
    )
    return withId(
      (data.requests || []).map((request) => ({
        id: request.friendshipId as string | number,
        receiverId: request.friendId as string | number,
        receiverUsername: request.username as string,
        receiverName: request.name as string,
        createdAt: request.createdAt as string,
      })),
    )
  },

  acceptFriendRequest: async (friendshipId: number | string): Promise<unknown> =>
    apiCall(`/api/friends/request/${friendshipId}/accept`, { method: "POST" }),

  rejectFriendRequest: async (friendshipId: number | string): Promise<unknown> =>
    apiCall(`/api/friends/request/${friendshipId}/reject`, { method: "POST" }),

  removeFriend: async (friendId: number | string): Promise<unknown> =>
    apiCall(`/api/friends/${friendId}`, { method: "DELETE" }),

  blockUser: async (userId: number | string): Promise<unknown> =>
    apiCall(`/api/friends/block/${userId}`, { method: "POST" }),

  unblockUser: async (userId: number | string): Promise<unknown> =>
    apiCall(`/api/friends/block/${userId}`, { method: "DELETE" }),

  getBlockedUsers: async (): Promise<BlockedUser[]> => {
    const data = await apiCall<{ blocked: Record<string, unknown>[] }>(
      `/api/friends/blocked`,
    )
    return withId(
      (data.blocked || []).map((entry) => ({
        id: entry.id as string | number,
        username: entry.username as string,
        name: entry.name as string,
        blockedAt: entry.blockedAt as string,
      })),
    )
  },

  reportUser: async (
    userId: number | string,
    reason: ReportReason,
    details?: string,
  ): Promise<unknown> =>
    apiCall(`/api/friends/report`, {
      method: "POST",
      body: JSON.stringify({ userId, reason, details }),
    }),
}
