import { shouldResetForMonday, weekStart } from "../dayCompletion";
import { toDateString } from "../format";

const mondayOf = (d: Date) => toDateString(weekStart(d));

describe("weekStart", () => {
  it("goes back to the previous Monday from a Sunday", () => {
    expect(weekStart(new Date(2026, 9, 18, 23, 59))).toEqual(new Date(2026, 9, 12));
  });

  it("is the same day's midnight on a Monday", () => {
    expect(weekStart(new Date(2026, 9, 12, 8, 30))).toEqual(new Date(2026, 9, 12));
  });
});

describe("shouldResetForMonday", () => {
  const thisMonday = mondayOf(new Date());

  it("returns this week's Monday when the last reset was an earlier week", () => {
    expect(shouldResetForMonday("2020-01-06")).toBe(thisMonday);
  });

  it("returns null when already reset this week", () => {
    expect(shouldResetForMonday(thisMonday)).toBeNull();
  });

  it("returns null for a reset stamped later in the current week", () => {
    const today = toDateString(new Date());
    expect(shouldResetForMonday(today)).toBeNull();
  });
});
