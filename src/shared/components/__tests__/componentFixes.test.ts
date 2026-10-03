import { getDayLabelAndTitle } from "../ProgramDayCardBase"

// Stepping months off a day-31 anchor used to overflow (Jan 31 -> Mar 3),
// silently skipping a month.
const stepMonth = (d: Date, direction: -1 | 1) =>
  new Date(d.getFullYear(), d.getMonth() + direction, 1)

describe("calendar month navigation", () => {
  it("lands on the adjacent month from a 31st anchor", () => {
    expect(stepMonth(new Date(2026, 0, 31), 1).getMonth()).toBe(1)
    expect(stepMonth(new Date(2026, 2, 31), -1).getMonth()).toBe(1)
  })
})

describe("getDayLabelAndTitle", () => {
  it("keeps everything after the first em dash", () => {
    expect(
      getDayLabelAndTitle({ dayTitle: "Day 1 — Push — Heavy" }, 0).dayTitle,
    ).toBe("Push — Heavy")
  })

  it("passes through a title with no em dash", () => {
    expect(getDayLabelAndTitle({ dayTitle: "Push" }, 0).dayTitle).toBe("Push")
  })
})
