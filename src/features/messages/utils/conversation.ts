import type { Conversation, Message } from "../types"
import { daysSinceLocal } from "@utils/format"

/** Merges messages into a newest-first thread, dropping ids it already holds. */
export function mergeMessages(thread: readonly Message[], incoming: readonly Message[]): Message[] {
  const seen = new Set(thread.map((m) => m.id))
  const fresh = incoming.filter((m) => !seen.has(m.id) && seen.add(m.id))
  if (fresh.length === 0) return thread as Message[]
  return [...thread, ...fresh].sort((a, b) => b.id - a.id)
}

/** How long after sending a message its author can still edit it. The server enforces the same window. */
export const EDIT_WINDOW_MS = 15 * 60_000

export const canEdit = (message: Message, now = Date.now()): boolean =>
  message.fromMe && now - Date.parse(message.createdAt) < EDIT_WINDOW_MS

/** Stamps every unread message the reader sent, once the other side has read the thread. */
export const markMineRead = (thread: readonly Message[], readAt: string): Message[] =>
  thread.map((m) => (m.fromMe && !m.readAt ? { ...m, readAt } : m))

/**
 * Moves the thread a message belongs to to the top of the list, creating it if needed.
 *
 * @param viewing - The reader has that thread open, so it doesn't count as unread.
 */
export function applyToConversations(
  list: readonly Conversation[],
  peer: { userUuid: string; username: string },
  message: Message,
  viewing: boolean,
): Conversation[] {
  const existing = list.find((c) => c.userUuid === peer.userUuid)
  const unreadBump = !message.fromMe && !viewing ? 1 : 0
  const updated: Conversation = {
    userUuid: peer.userUuid,
    username: existing?.username ?? peer.username,
    relation: existing?.relation ?? null,
    lastMessage: { body: message.body, createdAt: message.createdAt, fromMe: message.fromMe },
    unreadCount: viewing ? 0 : (existing?.unreadCount ?? 0) + unreadBump,
  }
  return [updated, ...list.filter((c) => c.userUuid !== peer.userUuid)]
}

export const markConversationRead = (list: readonly Conversation[], userUuid: string): Conversation[] =>
  list.map((c) => (c.userUuid === userUuid && c.unreadCount > 0 ? { ...c, unreadCount: 0 } : c))

export const totalUnread = (list: readonly Conversation[]): number =>
  list.reduce((sum, c) => sum + c.unreadCount, 0)

const RUN_GAP_MS = 5 * 60_000

/** Whether two messages are drawn as one run of bubbles: same sender, same day, minutes apart. */
export const sameRun = (a: Message, b: Message | undefined): boolean =>
  b !== undefined &&
  a.fromMe === b.fromMe &&
  daysSinceLocal(new Date(a.createdAt), new Date(b.createdAt)) === 0 &&
  Math.abs(Date.parse(a.createdAt) - Date.parse(b.createdAt)) < RUN_GAP_MS

export const clockLabel = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })

/** The date chip above a day's first message. */
export function dayLabel(iso: string, now = Date.now()): string {
  const days = daysSinceLocal(new Date(iso), new Date(now))
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  const date = new Date(iso)
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" })
  const sameYear = date.getFullYear() === new Date(now).getFullYear()
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", ...(!sameYear && { year: "numeric" }) })
}

/** The time beside a conversation in the list: a clock today, then a weekday, then a date. */
export function listTimeLabel(iso: string, now = Date.now()): string {
  const days = daysSinceLocal(new Date(iso), new Date(now))
  if (days === 0) return clockLabel(iso)
  if (days === 1) return "Yesterday"
  if (days < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "short" })
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "numeric", year: "2-digit" })
}
