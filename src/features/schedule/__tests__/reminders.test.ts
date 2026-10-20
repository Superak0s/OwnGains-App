jest.mock("@shared/services/notifications", () => ({}))
jest.mock("@shared/services/supplementReminders", () => ({}))
jest.mock("@shared/services/supplementAlarms", () => ({}))

import { plannedReminders } from "../reminders"
import { upcomingEntries } from "../utils"
import type { ScheduledWorkout } from "../types"

const entry = (id: number, startAt: string, extra: Partial<ScheduledWorkout> = {}): ScheduledWorkout => ({
  id,
  title: "Legs",
  programDay: null,
  startAt,
  durationMin: 60,
  reminderMinutes: 30,
  alarm: false,
  status: "accepted",
  scheduledBy: null,
  ...extra,
})

const now = Date.parse("2030-05-01T12:00:00Z")

describe("plannedReminders", () => {
  it("fires reminderMinutes before the start, nearest first", () => {
    const planned = plannedReminders(
      [entry(1, "2030-05-02T18:00:00Z"), entry(2, "2030-05-01T18:00:00Z", { reminderMinutes: 1440 })],
      now,
    )
    expect(planned.map((p) => [p.id, p.at.toISOString()])).toEqual([
      ["scheduled-workout-1", "2030-05-02T17:30:00.000Z"],
    ])
  })

  it("skips pending suggestions, entries with no reminder and times already past", () => {
    expect(
      plannedReminders(
        [
          entry(1, "2030-05-03T18:00:00Z", { status: "pending" }),
          entry(2, "2030-05-03T18:00:00Z", { reminderMinutes: null }),
          entry(3, "2030-05-01T12:20:00Z"),
          entry(4, "2030-05-01T12:40:00Z", { reminderMinutes: 0 }),
        ],
        now,
      ).map((p) => p.entry.id),
    ).toEqual([4])
  })
})

describe("upcomingEntries", () => {
  it("keeps a workout that is still running and drops finished ones", () => {
    const list = [entry(1, "2030-05-01T11:30:00Z"), entry(2, "2030-05-01T10:00:00Z"), entry(3, "2030-05-01T11:00:00.001Z")]
    expect(upcomingEntries(list, now).map((e) => e.id)).toEqual([3, 1])
  })
})
