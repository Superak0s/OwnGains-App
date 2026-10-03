import { combineToIso } from "../EditWorkoutHistoryModal";

// The free-text time field is the only unguarded input on the set editor. A
// rolled-over Date moves the set to another day instead of erroring.
describe("combineToIso", () => {
  it("builds a local timestamp for a valid date and time", () => {
    const iso = combineToIso("2024-05-05", "09:30");
    expect(iso).not.toBeNull();
    const d = new Date(iso as string);
    expect(d.getFullYear()).toBe(2024);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(30);
  });

  it("refuses an out-of-range time rather than rolling it over", () => {
    expect(combineToIso("2024-05-05", "25:00")).toBeNull();
    expect(combineToIso("2024-05-05", "99:99")).toBeNull();
    expect(combineToIso("2024-05-05", "12:60")).toBeNull();
  });

  it("refuses a date that does not exist", () => {
    expect(combineToIso("2024-02-31", "09:00")).toBeNull();
    expect(combineToIso("2024-13-01", "09:00")).toBeNull();
  });

  it("refuses malformed input", () => {
    expect(combineToIso("", "09:00")).toBeNull();
    expect(combineToIso("2024-05-05", "nine")).toBeNull();
  });
});
