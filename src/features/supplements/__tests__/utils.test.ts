import {
  quickAmountsFor,
  parseTimeOfDay,
  nextDoseAt,
  allDosesTaken,
  formatCountdown,
} from "../utils";

describe("quickAmountsFor", () => {
  it("gives half, default and double", () => {
    expect(quickAmountsFor(5)).toEqual([2.5, 5, 10]);
  });

  it("dedupes when rounding collapses values", () => {
    expect(quickAmountsFor(1)).toEqual([0.5, 1, 2]);
    expect(quickAmountsFor(0.02)).toEqual([0.01, 0.02, 0.04]);
  });

  it("drops non-positive amounts", () => {
    expect(quickAmountsFor(0)).toEqual([]);
    expect(quickAmountsFor(0.001)).toEqual([]);
  });
});

describe("parseTimeOfDay", () => {
  it("applies a HH:mm string to today", () => {
    const d = parseTimeOfDay("08:30");
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([8, 30, 0]);
  });

  it("falls back to now for missing or malformed input", () => {
    for (const bad of [null, undefined, "", "nope", "8"]) {
      expect(Number.isNaN(parseTimeOfDay(bad).getTime())).toBe(false);
    }
  });
});

describe("nextDoseAt", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const base = {
    dosesPerDay: 3,
    doseIntervalMinutes: 240,
    dosesToday: 1,
    lastTakenAt: "2026-09-26T10:00:00Z",
  };

  it("is the last dose plus the interval while it is still ahead", () => {
    expect(nextDoseAt(base, now)?.toISOString()).toBe("2026-09-26T14:00:00.000Z");
  });

  it("is null once the interval has elapsed", () => {
    expect(nextDoseAt({ ...base, lastTakenAt: "2026-09-26T07:00:00Z" }, now)).toBeNull();
  });

  it("is null when every dose for the day is taken", () => {
    expect(nextDoseAt({ ...base, dosesToday: 3 }, now)).toBeNull();
    expect(allDosesTaken({ ...base, dosesToday: 3 })).toBe(true);
  });

  it("is null without an interval or a previous dose", () => {
    expect(nextDoseAt({ ...base, doseIntervalMinutes: null }, now)).toBeNull();
    expect(nextDoseAt({ ...base, lastTakenAt: null }, now)).toBeNull();
  });
});

describe("formatCountdown", () => {
  it("rounds up to whole minutes and pads under an hour", () => {
    expect(formatCountdown(30_000)).toBe("1m");
    expect(formatCountdown(45 * 60_000)).toBe("45m");
    expect(formatCountdown(125 * 60_000)).toBe("2h 05m");
    expect(formatCountdown(120 * 60_000)).toBe("2h");
  });
});
