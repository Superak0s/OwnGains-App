import {
  applyToConversations,
  markConversationRead,
  markMineRead,
  mergeMessages,
  dayLabel,
  listTimeLabel,
  sameRun,
  totalUnread,
} from "../conversation"
import type { Conversation, Message } from "../../types"

const msg = (id: number, fromMe = false, readAt: string | null = null): Message => ({
  id,
  fromMe,
  body: `m${id}`,
  createdAt: `2026-10-18T10:00:0${id}.000Z`,
  readAt,
})

const convo = (userUuid: string, unreadCount: number): Conversation => ({
  userUuid,
  username: userUuid,
  lastMessage: { body: "x", createdAt: "2026-10-18T09:00:00.000Z", fromMe: false },
  unreadCount,
  relation: null,
})

describe("mergeMessages", () => {
  it("appends newer and older pages newest first", () => {
    expect(mergeMessages([msg(3), msg(2)], [msg(4), msg(1)]).map((m) => m.id)).toEqual([4, 3, 2, 1])
  })

  it("drops ids it already has, including a socket echo of a sent message", () => {
    const thread = [msg(2, true), msg(1)]
    expect(mergeMessages(thread, [msg(2, true)])).toBe(thread)
    expect(mergeMessages([], [msg(5), msg(5)]).map((m) => m.id)).toEqual([5])
  })
})

describe("markMineRead", () => {
  it("stamps only my unread messages", () => {
    const out = markMineRead([msg(3, true), msg(2, false), msg(1, true, "earlier")], "now")
    expect(out.map((m) => m.readAt)).toEqual(["now", null, "earlier"])
  })
})

describe("applyToConversations", () => {
  it("moves the thread to the top and counts an unread incoming message", () => {
    const out = applyToConversations([convo("a", 0), convo("b", 2)], { userUuid: "b", username: "b" }, msg(9), false)
    expect(out.map((c) => c.userUuid)).toEqual(["b", "a"])
    expect(out[0]).toMatchObject({ unreadCount: 3, lastMessage: { body: "m9", fromMe: false } })
  })

  it("starts a new thread and keeps it read while open or sent by me", () => {
    expect(applyToConversations([], { userUuid: "c", username: "cee" }, msg(1), true)[0]).toMatchObject({
      username: "cee",
      unreadCount: 0,
    })
    expect(applyToConversations([convo("c", 1)], { userUuid: "c", username: "c" }, msg(2, true), false)[0].unreadCount).toBe(1)
  })
})

describe("unread totals", () => {
  it("sums and clears per thread", () => {
    const list = [convo("a", 2), convo("b", 3)]
    expect(totalUnread(list)).toBe(5)
    expect(totalUnread(markConversationRead(list, "b"))).toBe(2)
  })
})

describe("chat time helpers", () => {
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString()
  const now = Date.parse(at(18, 12))
  const sent = (createdAt: string, fromMe = true): Message => ({ id: 1, fromMe, body: "x", createdAt, readAt: null })

  it("labels today and yesterday by name and older days otherwise", () => {
    expect(dayLabel(at(18, 0, 5), now)).toBe("Today")
    expect(dayLabel(at(17, 23, 59), now)).toBe("Yesterday")
    expect(dayLabel(at(14, 9), now)).not.toMatch(/Today|Yesterday/)
    expect(dayLabel(at(14, 9), now)).not.toBe(dayLabel(at(15, 9), now))
  })

  it("shows a clock time for today and Yesterday for the day before in the inbox", () => {
    expect(listTimeLabel(at(18, 9), now)).not.toBe("Yesterday")
    expect(listTimeLabel(at(17, 9), now)).toBe("Yesterday")
  })

  it("groups messages from the same sender within five minutes on the same day", () => {
    expect(sameRun(sent(at(18, 9)), sent(at(18, 9, 4)))).toBe(true)
    expect(sameRun(sent(at(18, 9)), sent(at(18, 9, 6)))).toBe(false)
    expect(sameRun(sent(at(18, 9)), sent(at(18, 9, 1), false))).toBe(false)
    expect(sameRun(sent(at(17, 23, 59)), sent(at(18, 0, 1)))).toBe(false)
    expect(sameRun(sent(at(18, 9)), undefined)).toBe(false)
  })
})
