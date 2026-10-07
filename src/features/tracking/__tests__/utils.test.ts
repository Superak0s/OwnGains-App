import {
  buildLocalISOForDate,
  cycleLengthPoints,
  followUpStatus,
  needsFollowUp,
  toDailyTotalsChartData,
  toTrendChartData,
  computeUpcomingPredictedDays,
  daysSinceLocal,
  formatDateLabel,
  formatRange,
  getCycleDuration,
  getCyclePhaseInfo,
  getCyclePhaseLabel,
  isValidTime,
  isoToLocalDateStr,
  maskTimeInput,
  toNumberOrUndefined,
} from "../utils";
import type { MenstrualEntry } from "../services/types";
import { describeError } from "../helpers";

describe("daysSinceLocal", () => {
  it("counts calendar days, not 24h blocks", () => {
    const start = new Date(2026, 7, 24, 23, 30);
    const today = new Date(2026, 7, 25, 0, 30);
    expect(daysSinceLocal(start, today)).toBe(1);
  });

  it("returns 0 for the same local day", () => {
    expect(daysSinceLocal(new Date(2026, 7, 25, 0, 5), new Date(2026, 7, 25, 23, 55))).toBe(0);
  });

  it("returns a negative count for future starts", () => {
    expect(daysSinceLocal(new Date(2026, 7, 27), new Date(2026, 7, 25))).toBe(-2);
  });
});

describe("toNumberOrUndefined", () => {
  it.each(["", "abc", "-"])("rejects %p", (value) => {
    expect(toNumberOrUndefined(value)).toBeUndefined();
  });

  it("parses numbers", () => {
    expect(toNumberOrUndefined("12.5")).toBe(12.5);
    expect(toNumberOrUndefined("0")).toBe(0);
  });
});

describe("isoToLocalDateStr", () => {
  it("passes a bare date through untouched", () => {
    expect(isoToLocalDateStr("2026-08-25")).toBe("2026-08-25");
  });

  it("reads a timestamp in local time", () => {
    const local = new Date(2026, 7, 25, 13, 0);
    expect(isoToLocalDateStr(local.toISOString())).toBe("2026-08-25");
  });

  it("is empty for a missing or unparseable value", () => {
    expect(isoToLocalDateStr(null)).toBe("");
    expect(isoToLocalDateStr(undefined)).toBe("");
    expect(isoToLocalDateStr("")).toBe("");
    expect(isoToLocalDateStr("not a date")).toBe("");
  });
});

describe("formatDateLabel", () => {
  it("formats a real date and labels the rest as unknown", () => {
    const date = new Date(2026, 7, 25);
    // The label follows the device locale, so assert against that rather than
    // pinning en-US.
    expect(formatDateLabel(date.toISOString())).toBe(
      date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    );
    expect(formatDateLabel(null)).toBe("Unknown date");
    expect(formatDateLabel("nope")).toBe("Unknown date");
  });
});

describe("buildLocalISOForDate", () => {
  it("defaults to 09:00 local and accepts an explicit time", () => {
    const date = new Date(2026, 7, 25, 22, 30);
    expect(buildLocalISOForDate(date)).toBe("2026-08-25T09:00:00");
    expect(buildLocalISOForDate(date, "17:45")).toBe("2026-08-25T17:45:00");
  });
});

describe("getCycleDuration", () => {
  it("counts both end dates of a closed period", () => {
    expect(
      getCycleDuration({
        cycleStart: "2024-03-01",
        cycleEnd: "2024-03-04",
      } as MenstrualEntry),
    ).toBe(4);
  });

  it("falls back while the period is still open or the dates are unusable", () => {
    expect(getCycleDuration({ cycleStart: "2024-03-01" } as MenstrualEntry)).toBe(5);
    expect(getCycleDuration({} as MenstrualEntry, 7)).toBe(7);
    expect(
      getCycleDuration({
        cycleStart: "2024-03-01",
        cycleEnd: "nonsense",
      } as MenstrualEntry),
    ).toBe(5);
  });
});

describe("getCyclePhaseInfo", () => {
  it.each([
    [0, "Menstrual"],
    [4, "Menstrual"],
    [5, "Follicular"],
    [11, "Follicular"],
    [12, "Ovulation"],
    [14, "Ovulation"],
    [15, "Luteal"],
    [27, "Luteal"],
  ])("puts day-offset %i in %s on a 5/28 cycle", (offset, phase) => {
    expect(getCyclePhaseInfo(offset, 5, 28).phase).toBe(phase);
  });

  it("wraps around once the cycle length is passed", () => {
    expect(getCyclePhaseInfo(28, 5, 28)).toMatchObject({
      dayOfCycle: 1,
      phase: "Menstrual",
    });
  });

  it("substitutes the 5/28 defaults for zero-length input", () => {
    expect(getCyclePhaseInfo(0, 0, 0)).toMatchObject({
      cycleLength: 28,
      periodEnd: 5,
    });
  });

  it("never lets the period fill the whole cycle", () => {
    expect(getCyclePhaseInfo(0, 10, 6)).toMatchObject({
      periodEnd: 5,
      cycleLength: 6,
    });
  });

  it("keeps ovulation after the period on a short cycle", () => {
    expect(getCyclePhaseInfo(0, 5, 16)).toMatchObject({
      ovulationStart: 5,
      ovulationEnd: 7,
    });
  });
});

describe("getCyclePhaseLabel", () => {
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it("labels the phase of a past start", () => {
    expect(getCyclePhaseLabel(daysAgo(0), 5, 28)).toBe("Menstrual");
    expect(getCyclePhaseLabel(daysAgo(20), 5, 28)).toBe("Luteal");
  });

  it("is null for a missing, unparseable or future start", () => {
    expect(getCyclePhaseLabel(null, 5, 28)).toBeNull();
    expect(getCyclePhaseLabel("nope", 5, 28)).toBeNull();
    expect(getCyclePhaseLabel(daysAgo(-3), 5, 28)).toBeNull();
  });
});

describe("computeUpcomingPredictedDays", () => {
  const start = new Date(2026, 0, 1);

  it("is empty without a usable start", () => {
    expect(computeUpcomingPredictedDays(null, 28, 5).size).toBe(0);
    expect(computeUpcomingPredictedDays("nope", 28, 5).size).toBe(0);
  });

  it("predicts period days a year out, skipping the cycle already logged", () => {
    const days = computeUpcomingPredictedDays(start.toISOString(), 28, 5);
    expect(days.size).toBe(13 * 5);
    expect(days.has("2026-01-01")).toBe(false);
    expect(days.has("2026-01-29")).toBe(true);
    expect(days.has("2026-02-02")).toBe(true);
    expect(days.has("2026-02-03")).toBe(false);
  });

  it("substitutes the 5/28 defaults for zero-length input", () => {
    const days = computeUpcomingPredictedDays(start.toISOString(), 0, 0);
    expect(days.size).toBe(13 * 5);
  });
});

describe("maskTimeInput", () => {
  it("inserts the colon and drops non-digits and overflow", () => {
    expect(maskTimeInput("7")).toBe("7");
    expect(maskTimeInput("073")).toBe("07:3");
    expect(maskTimeInput("0730")).toBe("07:30");
    expect(maskTimeInput("07:30")).toBe("07:30");
    expect(maskTimeInput("a7b3c0d5")).toBe("73:05");
  });
});

describe("isValidTime", () => {
  it("accepts only complete 24-hour times", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("07:60")).toBe(false);
    expect(isValidTime("7:30")).toBe(false);
    expect(isValidTime("")).toBe(false);
  });
});

describe("describeError", () => {
  it("maps transport and status failures to plain language", () => {
    expect(describeError(new Error("Network request failed"))).toMatch(
      /connection/i,
    );
    expect(describeError(new Error("401 Unauthorized"))).toMatch(/expired/i);
    expect(describeError(new Error("404 Not Found"))).toMatch(/no longer/i);
    expect(describeError(new Error("503 Service Unavailable"))).toMatch(
      /server had a problem/i,
    );
  });

  it("uses the raw message, then a generic fallback", () => {
    expect(describeError(new Error("Goal must be positive"))).toBe(
      "Goal must be positive",
    );
    expect(describeError("")).toBe("Something went wrong. Please try again.");
  });
});

describe("toTrendChartData", () => {
  it("sorts oldest first, keeps the newest points and drops invalid ones", () => {
    const data = toTrendChartData(
      [
        { at: "2026-01-03T09:00:00", value: 81 },
        { at: "2026-01-01T09:00:00", value: 80 },
        { at: "2026-01-02T09:00:00", value: 82 },
        { at: null, value: 90 },
        { at: "2026-01-04T09:00:00", value: Number.NaN },
      ],
      2,
    );
    expect(data.datasets[0].data).toEqual([82, 81]);
    expect(data.labels).toHaveLength(2);
  });

  it("labels at most eight points", () => {
    const points = Array.from({ length: 30 }, (_, i) => ({
      at: new Date(2026, 0, i + 1).toISOString(),
      value: i,
    }));
    expect(toTrendChartData(points).labels.filter(Boolean)).toHaveLength(8);
  });
});

describe("toDailyTotalsChartData", () => {
  it("sums each day and fills empty days with 0, today last", () => {
    const today = new Date(2026, 0, 7, 12);
    const data = toDailyTotalsChartData(
      [
        { at: new Date(2026, 0, 7, 8).toISOString(), value: 250 },
        { at: new Date(2026, 0, 7, 9).toISOString(), value: 500 },
        { at: new Date(2026, 0, 5, 9).toISOString(), value: 300 },
        { at: new Date(2025, 11, 1, 9).toISOString(), value: 999 },
      ],
      3,
      today,
    );
    expect(data.datasets[0].data).toEqual([300, 0, 750]);
  });
});

describe("cycleLengthPoints", () => {
  it("measures days between consecutive starts in any input order", () => {
    const entry = (cycleStart: string) =>
      ({ id: 1, cycleStart, createdAt: "", updatedAt: "" });
    expect(
      cycleLengthPoints([
        entry("2026-03-01"),
        entry("2026-01-01"),
        entry("2026-01-29"),
      ]).map((p) => p.value),
    ).toEqual([28, 31]);
  });
});

describe("formatRange", () => {
  it("joins the rounded ends", () => {
    expect(formatRange(1455.4, 1544.6)).toBe("1455-1545");
  });

  it("is undefined when both ends round to the same number", () => {
    expect(formatRange(1500, 1500)).toBeUndefined();
    expect(formatRange(499.8, 500.2)).toBeUndefined();
  });
});

describe("followUpStatus", () => {
  it("derives the status from the intensity change", () => {
    expect(followUpStatus(6, 0)).toBe("recovered");
    expect(followUpStatus(6, 4)).toBe("better");
    expect(followUpStatus(6, 6)).toBe("still_sore");
    expect(followUpStatus(4, 6)).toBe("still_sore");
  });
});

describe("needsFollowUp", () => {
  const today = new Date(2026, 9, 7, 9, 0);
  const entry = (updatedAt: Date, status = "active") =>
    ({ status, updatedAt: updatedAt.toISOString() }) as never;

  it("is due once the last update is from an earlier day", () => {
    expect(needsFollowUp(entry(new Date(2026, 9, 6, 22, 0)), today)).toBe(true);
    expect(needsFollowUp(entry(new Date(2026, 9, 7, 7, 0)), today)).toBe(false);
  });

  it("is never due once recovered", () => {
    expect(
      needsFollowUp(entry(new Date(2026, 9, 1), "recovered"), today),
    ).toBe(false);
  });
});
