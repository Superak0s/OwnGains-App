import {
  computeWeeklyStreak,
  dateStrPlusDays,
  mondayOfWeek,
  sessionDateKey,
} from "../streak";

describe("mondayOfWeek", () => {
  it("maps every day of a week to the same Monday", () => {
    // 2026-08-10 is a Monday, 2026-08-16 the Sunday that closes that week.
    const week = [
      "2026-08-10",
      "2026-08-12",
      "2026-08-15",
      "2026-08-16",
    ].map(mondayOfWeek);
    expect(week).toEqual([
      "2026-08-10",
      "2026-08-10",
      "2026-08-10",
      "2026-08-10",
    ]);
  });

  it("crosses a month boundary", () => {
    expect(mondayOfWeek("2026-09-02")).toBe("2026-08-31");
  });
});

describe("dateStrPlusDays", () => {
  it("steps across a DST-shifted month boundary", () => {
    expect(dateStrPlusDays("2026-11-02", -7)).toBe("2026-10-26");
    expect(dateStrPlusDays("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("sessionDateKey", () => {
  it("buckets by local calendar day, not the raw UTC date", () => {
    const local = new Date(2026, 7, 12, 22, 30);
    expect(sessionDateKey(local.toISOString())).toBe("2026-08-12");
  });

  it("returns null for a missing or unparseable stamp", () => {
    expect(sessionDateKey(null)).toBeNull();
    expect(sessionDateKey("")).toBeNull();
    expect(sessionDateKey("not a date")).toBeNull();
  });
});

describe("computeWeeklyStreak", () => {
  const today = new Date(2026, 7, 12); // Wednesday, week of Mon 2026-08-10

  it("counts back over fully elapsed weeks only", () => {
    const streak = computeWeeklyStreak(
      ["2026-08-11", "2026-08-05", "2026-07-30", "2026-07-21"],
      today,
    );
    expect(streak).toEqual({ count: 3, currentWeekLogged: true });
  });

  it("stops at the first missed week", () => {
    const streak = computeWeeklyStreak(
      ["2026-08-05", "2026-07-22"],
      today,
    );
    expect(streak).toEqual({ count: 1, currentWeekLogged: false });
  });

  it("is zero with no history", () => {
    expect(computeWeeklyStreak([], today)).toEqual({
      count: 0,
      currentWeekLogged: false,
    });
  });

  it("does not count the current week toward the streak", () => {
    expect(computeWeeklyStreak(["2026-08-12"], today)).toEqual({
      count: 0,
      currentWeekLogged: true,
    });
  });
});
