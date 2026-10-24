import { daysSinceLocal, normalizeServerDates, parseDate, parseDecimal, sortableStamp, toDateString, toTimeString } from "../format";

// A decimal-pad keyboard emits the device locale's separator, and parseFloat("12,5")
// returns 12 with no error, logging a 12.5 kg set as 12.
describe("parseDecimal", () => {
  it("accepts either decimal separator", () => {
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 0,25 ")).toBe(0.25);
    expect(parseDecimal(".5")).toBe(0.5);
  });

  it("rejects anything that is not a plain number", () => {
    for (const bad of ["", "abc", "1.2.3", "1,2,3", "5kg", "1e5", " ", ".", "-3,5"]) {
      expect(parseDecimal(bad)).toBeNull();
    }
  });
});

describe("toDateString", () => {
  it("is a local YYYY-MM-DD day", () => {
    expect(toDateString(new Date(2024, 4, 5, 13, 0, 0))).toBe("2024-05-05");
  });

  // "NaN-NaN-NaN" never matches any day, so a corrupt timestamp would silently
  // zero a streak instead of being visible as bad data.
  it("does not produce NaN parts for a corrupt stamp", () => {
    expect(toDateString("not a date")).toBe("—");
  });
});

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

describe("toTimeString", () => {
  it("uses a 24-hour clock", () => {
    expect(toTimeString(new Date(2026, 0, 1, 21, 5))).toBe("21:05");
    expect(toTimeString(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
  });
});

// The server sends MySQL DATETIMEs as zone-less UTC. Read as local time, a
// friend's 00:30 workout in Athens showed on the previous day.
describe("parseDate", () => {
  it("reads a zone-less server datetime as UTC", () => {
    expect(parseDate("2026-10-01 22:30:00")?.toISOString()).toBe("2026-10-01T22:30:00.000Z");
  });

  it("keeps a local ISO stamp local", () => {
    expect(parseDate("2026-10-01T22:30:00")?.getHours()).toBe(22);
  });
});

describe("normalizeServerDates", () => {
  it("rewrites only whole zone-less server datetimes", () => {
    expect(
      normalizeServerDates({
        a: "2026-10-22 23:30:00",
        b: ["2026-10-22 23:30:00.123"],
        c: { d: "2026-10-25", e: "Leg day 2026-10-22 23:30:00" },
        f: 5,
        g: null,
      }),
    ).toEqual({
      a: "2026-10-22T23:30:00Z",
      b: ["2026-10-22T23:30:00.123Z"],
      c: { d: "2026-10-25", e: "Leg day 2026-10-22 23:30:00" },
      f: 5,
      g: null,
    });
  });
});

describe("sortableStamp", () => {
  it("puts every timestamp form on UTC", () => {
    expect(sortableStamp("2026-10-25T03:50:00.000+03:00")).toBe("2026-10-25T00:50:00.000Z");
    expect(sortableStamp("2026-10-23 07:00:00")).toBe("2026-10-23T07:00:00.000Z");
    expect(sortableStamp("2026-10-23T08:00:00")).toBe(new Date(2026, 9, 23, 8).toISOString());
    expect(sortableStamp("2026-10-23T05:00:00.000Z")).toBe("2026-10-23T05:00:00.000Z");
    expect(sortableStamp("2026-10-23")).toBe("2026-10-23T00:00:00.000Z");
    for (const v of ["", "5", "sync_abc"]) expect(sortableStamp(v)).toBe(v);
  });
});
