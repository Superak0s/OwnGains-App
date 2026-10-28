import { apiCall, fetchIdempotent, parseApiResponse } from "@shared/services/apiClient"
import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { generateId } from "@utils/format"
import type { Conversation, Message, Thread } from "../../types"

export const messagesApi = {
  listConversations: async (): Promise<Conversation[]> =>
    (await apiCall<{ conversations?: Conversation[] }>("/api/messages")).conversations ?? [],

  getThread: async (userUuid: string, before?: number): Promise<Thread> => {
    const query = before ? `?before=${before}` : ""
    const data = await apiCall<{ messages?: Message[]; canSend?: boolean }>(
      `/api/messages/${encodeURIComponent(userUuid)}${query}`,
    )
    return { messages: data.messages ?? [], canSend: data.canSend ?? false }
  },

  sendMessage: async (
    userUuid: string,
    body: string,
    idempotencyKey: string = generateId("idem"),
  ): Promise<Message> => {
    const res = await fetchIdempotent(
      authenticatedFetch,
      `/api/messages/${encodeURIComponent(userUuid)}`,
      { method: "POST", body: JSON.stringify({ body }) },
      idempotencyKey,
    )
    return (await parseApiResponse<{ message: Message }>(res)).message
  },

  editMessage: async (userUuid: string, messageId: number, body: string): Promise<Message> =>
    (
      await apiCall<{ message: Message }>(`/api/messages/${encodeURIComponent(userUuid)}/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      })
    ).message,

  deleteMessage: async (userUuid: string, messageId: number): Promise<void> => {
    await apiCall(`/api/messages/${encodeURIComponent(userUuid)}/${messageId}`, { method: "DELETE" })
  },

  markRead: async (userUuid: string): Promise<void> => {
    await apiCall(`/api/messages/${encodeURIComponent(userUuid)}/read`, { method: "POST" })
  },

  registerPushToken: async (token: string): Promise<boolean> =>
    (await apiCall<{ enabled?: boolean }>("/api/push/token", { method: "PUT", body: JSON.stringify({ token }) }))
      .enabled === true,

  /** Unauthenticated, so it works after the session was revoked, and sent to the server the token was registered with. */
  unregisterPushToken: async (serverUrl: string, token: string): Promise<void> => {
    await fetch(`${serverUrl}/api/push/token`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10_000),
    })
  },
}
