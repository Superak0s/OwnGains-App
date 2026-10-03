import { parseDecimal, toDateString } from "../format";

// A decimal-pad keyboard emits the device locale's separator, and parseFloat("12,5")
// returns 12 with no error, logging a 12.5 kg set as 12.
describe("parseDecimal", () => {
  it("accepts either decimal separator", () => {
    expect(parseDecimal("12.5")).toBe(12.5);
    expect(parseDecimal("12,5")).toBe(12.5);
    expect(parseDecimal(" 0,25 ")).toBe(0.25);
    expect(parseDecimal(".5")).toBe(0.5);
    expect(parseDecimal("-3,5")).toBe(-3.5);
  });

  it("rejects anything that is not a plain number", () => {
    for (const bad of ["", "abc", "1.2.3", "1,2,3", "5kg", "1e5", " "]) {
      expect(Number.isNaN(parseDecimal(bad))).toBe(true);
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
