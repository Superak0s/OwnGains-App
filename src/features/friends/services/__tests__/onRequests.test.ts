jest.mock("@shared/services/authenticatedFetch", () => ({ authenticatedFetch: jest.fn() }))
jest.mock("@shared/services/appMode", () => ({ isServerless: jest.fn(async () => false) }))

import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { isServerless } from "@shared/services/appMode"
import { ServerUnreachableError } from "@shared/services/apiError"
import { OFFLINE_UNAVAILABLE_MESSAGE } from "@shared/services/dispatchProxy"
import { friendsApi as friendsOn } from "../on/friends"
import { sharingApi as sharingOn } from "../on/sharing"
import { friendsApi, sharingApi } from "../index"

const mockFetch = authenticatedFetch as jest.Mock

const respond = (status: number, body: unknown = { success: true }, headers: Record<string, string> = {}) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: (k: string) => headers[k] ?? null },
  }) as unknown as Response

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, { method?: string; body?: string } | undefined]
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(respond(200, { success: true }))
  ;(isServerless as jest.Mock).mockResolvedValue(false)
})

describe("friend and sharing writes match the server contract", () => {
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ["a friend request by username", () => friendsOn.sendFriendRequest("buddy"), "POST", "/api/friends/request", { username: "buddy" }],
    ["accepting a request", () => friendsOn.acceptFriendRequest(11), "POST", "/api/friends/request/11/accept", undefined],
    ["rejecting a request", () => friendsOn.rejectFriendRequest(11), "POST", "/api/friends/request/11/reject", undefined],
    ["removing a friend", () => friendsOn.removeFriend(7), "DELETE", "/api/friends/7", undefined],
    ["blocking a user", () => friendsOn.blockUser(7), "POST", "/api/friends/block/7", undefined],
    ["unblocking a user", () => friendsOn.unblockUser(7), "DELETE", "/api/friends/block/7", undefined],
    ["reporting a user", () => friendsOn.reportUser(7, "spam" as never, "ads"), "POST", "/api/friends/report", { userId: 7, reason: "spam", details: "ads" }],
    ["sharing a program with its payload", () => sharingOn.grantPermission(7, "program", { programData: { name: "P" } }),
      "POST", "/api/sharing/permissions", { friendId: 7, permissionType: "program", payload: { programData: { name: "P" } } }],
    ["sharing history with no payload", () => sharingOn.grantPermission(7, "history"),
      "POST", "/api/sharing/permissions", { friendId: 7, permissionType: "history", payload: null }],
    ["revoking a share", () => sharingOn.revokePermission(3), "DELETE", "/api/sharing/permissions/3", undefined],
    ["a joint session invite", () => sharingOn.sendJointInvite({ toUserId: 7 } as never), "POST", "/api/sharing/joint-sessions/invite", { toUserId: 7 }],
    ["leaving a joint session", () => sharingOn.leaveJointSession("j1"), "DELETE", "/api/sharing/joint-sessions/j1/leave", undefined],
  ]

  it.each(cases)("sends %s to the route the server answers", async (_name, call, method, url, body) => {
    await call()
    expect(lastCall()).toEqual({ url, method, body })
  })

  it("encodes a search so a username with & can't inject query params", async () => {
    mockFetch.mockResolvedValue(respond(200, { users: [] }))
    await friendsOn.searchUsers("a&limit=999", 5)
    expect(lastCall().url).toBe("/api/friends/search?q=a%26limit%3D999&limit=5")
  })
})

describe("friend lists from the server", () => {
  it("maps the server's friend fields to the app's", async () => {
    mockFetch.mockResolvedValue(respond(200, { friends: [{ friendUserId: 7, username: "buddy", friendsSince: "t" }] }))
    await expect(friendsOn.getFriends()).resolves.toEqual([{ id: 7, username: "buddy", createdAt: "t" }])
  })

  it("drops a friend row with no id so removing it can't call DELETE /api/friends/undefined", async () => {
    mockFetch.mockResolvedValue(respond(200, { friends: [{ username: "ghost" }, { friendUserId: 0, username: "zero" }] }))
    await expect(friendsOn.getFriends()).resolves.toEqual([{ id: 0, username: "zero", createdAt: undefined }])
  })

  it("shows no friends instead of crashing when the server omits the list", async () => {
    mockFetch.mockResolvedValue(respond(200, {}))
    await expect(friendsOn.getFriends()).resolves.toEqual([])
    await expect(friendsOn.getPendingRequests()).resolves.toEqual([])
    await expect(friendsOn.getSentRequests()).resolves.toEqual([])
    await expect(friendsOn.getBlockedUsers()).resolves.toEqual([])
  })

  it("uses the friendship id, not the sender's user id, to accept a pending request", async () => {
    mockFetch.mockResolvedValue(respond(200, { requests: [{ friendshipId: 11, userId: 7, username: "buddy", name: "B", createdAt: "t" }] }))
    const [request] = await friendsOn.getPendingRequests()
    expect(request).toEqual({ id: 11, senderId: 7, senderUsername: "buddy", senderName: "B", createdAt: "t" })
  })

  it("keys a sent request by friendship id so cancelling targets the right one", async () => {
    mockFetch.mockResolvedValue(respond(200, { requests: [{ friendshipId: 12, friendId: 8, username: "pal" }] }))
    const [request] = await friendsOn.getSentRequests()
    expect(request).toMatchObject({ id: 12, receiverId: 8, receiverUsername: "pal" })
  })

  it("counts a granted share as having a payload when an older server inlines it", async () => {
    mockFetch.mockResolvedValue(respond(200, { permissions: [
      { id: 1, toUserId: 7, permissionType: "program", payload: { programData: {} } },
      { id: null, toUserId: 8, permissionType: "history" },
      { id: 2, toUserId: 7, permissionType: "history", hasPayload: false },
    ] }))
    const granted = await sharingOn.getGrantedPermissions()
    expect(granted.map((p) => [p.id, p.hasPayload])).toEqual([[1, true], [2, false]])
  })
})

describe("watching and session details", () => {
  it("treats a friend who stopped sharing (403) as having no live session", async () => {
    mockFetch.mockResolvedValue(respond(403, { error: "Forbidden" }))
    await expect(sharingOn.getFriendActiveSession(7)).resolves.toBeNull()
    await expect(sharingOn.getFriendLiveSession(7, 1)).resolves.toBeNull()
  })

  it("treats a finished session (404) as no live session", async () => {
    mockFetch.mockResolvedValue(respond(404, { error: "Not found" }))
    await expect(sharingOn.getFriendActiveSession(7)).resolves.toBeNull()
  })

  it("still reports a 5xx while watching instead of showing the friend as idle", async () => {
    mockFetch.mockResolvedValue(respond(500, { error: "boom" }))
    await expect(sharingOn.getFriendActiveSession(7)).rejects.toMatchObject({ status: 500 })
  })

  it("returns null for a session the server has no details for", async () => {
    mockFetch.mockResolvedValue(respond(200, { session: null }))
    await expect(sharingOn.getFriendSessionDetails(7, 99)).resolves.toBeNull()
    expect(lastCall().url).toBe("/api/sharing/sessions/friend/7/99")
  })

  it("returns an empty history for a friend with no shared sessions", async () => {
    mockFetch.mockResolvedValue(respond(200, {}))
    await expect(sharingOn.getFriendSessions(7)).resolves.toEqual([])
  })
})

describe("errors reach the friends screen", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ["send request", () => friendsOn.sendFriendRequest("x")],
    ["accept", () => friendsOn.acceptFriendRequest(1)],
    ["remove", () => friendsOn.removeFriend(1)],
    ["list friends", () => friendsOn.getFriends()],
    ["share", () => sharingOn.grantPermission(1, "program")],
    ["revoke", () => sharingOn.revokePermission(1)],
  ]

  it.each(calls)("%s: a 401 is an ApiError, not a silent success", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(401, { error: "Unauthorized" }))
    await expect(call()).rejects.toMatchObject({ name: "ApiError", status: 401 })
  })

  it.each(calls)("%s: a 4xx keeps the server's message for the alert", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(409, { error: "Already friends" }))
    await expect(call()).rejects.toMatchObject({ status: 409, message: "Already friends" })
  })

  it.each(calls)("%s: a 429 keeps the Retry-After wait", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(429, { error: "Slow down" }, { "Retry-After": "3" }))
    await expect(call()).rejects.toMatchObject({ status: 429, retryAfterMs: 3000 })
  })

  it.each(calls)("%s: a 5xx is an error", async (_n, call) => {
    mockFetch.mockResolvedValue(respond(503, { error: "Down" }))
    await expect(call()).rejects.toMatchObject({ status: 503 })
  })

  it.each(calls)("%s: a network failure is not swallowed", async (_n, call) => {
    mockFetch.mockRejectedValue(new ServerUnreachableError())
    await expect(call()).rejects.toBeInstanceOf(ServerUnreachableError)
  })

  it("explains the pending-request limit instead of showing a raw 429", async () => {
    mockFetch.mockResolvedValue(respond(429, { code: "TOO_MANY_PENDING_REQUESTS" }))
    await expect(friendsOn.sendFriendRequest("x")).rejects.toMatchObject({ message: expect.stringContaining("too many pending") })
  })

  it("explains the share limit instead of a generic failure", async () => {
    mockFetch.mockResolvedValue(respond(400, { code: "TOO_MANY_GRANTS" }))
    await expect(sharingOn.grantPermission(1, "program")).rejects.toMatchObject({ message: expect.stringContaining("too many friends") })
  })
})

describe("offline mode", () => {
  it("never reaches the network for friends or sharing and says a server is needed", async () => {
    ;(isServerless as jest.Mock).mockResolvedValue(true)
    await expect(friendsApi.sendFriendRequest("buddy")).rejects.toThrow(OFFLINE_UNAVAILABLE_MESSAGE)
    await expect(friendsApi.getFriends()).rejects.toThrow(OFFLINE_UNAVAILABLE_MESSAGE)
    await expect(sharingApi.grantPermission(7, "program")).rejects.toThrow(OFFLINE_UNAVAILABLE_MESSAGE)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("passes calls through to the server in online mode", async () => {
    await friendsApi.removeFriend(7)
    expect(lastCall()).toMatchObject({ url: "/api/friends/7", method: "DELETE" })
  })
})
