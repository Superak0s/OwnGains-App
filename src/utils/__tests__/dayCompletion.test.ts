import { shouldResetForMonday } from "../dayCompletion";
import { toDateString } from "../format";

const mondayOf = (d: Date) => {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  m.setHours(0, 0, 0, 0);
  return toDateString(m);
};

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
