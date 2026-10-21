import type { ClientSummary } from "../../types"
import {
  clientStatus,
  expectedByToday,
  groupRoster,
  sessionOrigin,
  weeklyTarget,
} from "../roster"

const MON = new Date(2026, 9, 12, 9, 0)
const WED = new Date(2026, 9, 14, 9, 0)
const SUN = new Date(2026, 9, 18, 23, 0)
const daysBefore = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000).toISOString()

const client = (over: Partial<ClientSummary> = {}): ClientSummary => ({
  userId: "1",
  username: "maria",
  lastWorkoutAt: daysBefore(WED, 1),
  sessionsThisWeek: 0,
  activeProgramDayCount: 3,
  hasTrackingAccess: false,
  ...over,
})

describe("week boundaries", () => {
  it("caps the weekly target at 7 and has none without a program", () => {
    expect(weeklyTarget(3)).toBe(3)
    expect(weeklyTarget(10)).toBe(7)
    expect(weeklyTarget(null)).toBeNull()
    expect(weeklyTarget(0)).toBeNull()
  })

  it("expects nothing on Monday morning and the full target by Sunday", () => {
    expect(expectedByToday(3, MON)).toBe(0)
    expect(expectedByToday(3, WED)).toBe(1)
    expect(expectedByToday(3, SUN)).toBe(3)
  })
})

describe("clientStatus", () => {
  it("flags a client who never trained or hasn't in over a week as inactive", () => {
    expect(clientStatus(client({ lastWorkoutAt: null }), WED)).toBe("inactive")
    expect(clientStatus(client({ lastWorkoutAt: daysBefore(WED, 8) }), WED)).toBe("inactive")
  })

  it("flags a client below the pace for this week as behind", () => {
    expect(clientStatus(client({ lastWorkoutAt: daysBefore(WED, 6) }), WED)).toBe("behind")
  })

  it("never calls a client without a program behind", () => {
    expect(clientStatus(client({ lastWorkoutAt: daysBefore(WED, 6), activeProgramDayCount: null }), WED)).toBe("on_track")
  })

  it("keeps a client on pace on track", () => {
    expect(clientStatus(client({ sessionsThisWeek: 2 }), WED)).toBe("on_track")
  })

  it("doesn't flag anyone behind on Monday morning", () => {
    expect(clientStatus(client({ lastWorkoutAt: daysBefore(MON, 3) }), MON)).toBe("on_track")
  })
})

describe("groupRoster", () => {
  it("lists clients needing attention first, longest gap on top", () => {
    const never = client({ userId: "a", lastWorkoutAt: null })
    const old = client({ userId: "b", lastWorkoutAt: daysBefore(WED, 9) })
    const fine = client({ userId: "c", sessionsThisWeek: 2 })
    const { attention, onTrack } = groupRoster([fine, old, never], WED)
    expect(attention.map((c) => c.userId)).toEqual(["a", "b"])
    expect(onTrack.map((c) => c.userId)).toEqual(["c"])
  })

  it("handles an empty roster", () => {
    expect(groupRoster([], WED)).toEqual({ attention: [], onTrack: [] })
  })
})

describe("sessionOrigin", () => {
  it("tags sessions the trainer logged as with you", () => {
    expect(sessionOrigin({ id: 1, loggedByTrainerId: "t1" }, "t1")).toBe("with_you")
    expect(sessionOrigin({ id: 1, loggedByTrainerId: null }, "t1")).toBe("on_their_own")
    expect(sessionOrigin({ id: 1 }, "t1")).toBe("on_their_own")
  })
})
