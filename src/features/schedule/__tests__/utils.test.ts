import { dayStatus, formatTime, notInPast, splitReminder } from "../utils";
import type { ScheduledWorkout } from "../types";

describe("notInPast", () => {
  const now = new Date(2026, 9, 19, 14, 32, 10).getTime();

  it("keeps a future time", () => {
    const later = new Date(2026, 9, 19, 18, 0);
    expect(notInPast(later, now)).toBe(later);
  });

  it("moves a past time to the next 5-minute slot", () => {
    expect(formatTime(notInPast(new Date(2026, 9, 19, 9, 0), now))).toBe("14:35");
  });

  it("moves a time equal to now forward", () => {
    const exact = new Date(2026, 9, 19, 14, 35).getTime();
    expect(formatTime(notInPast(new Date(exact), exact))).toBe("14:40");
  });
});

describe("formatTime", () => {
  it("uses a 24-hour clock", () => {
    expect(formatTime(new Date(2026, 0, 1, 21, 5))).toBe("21:05");
    expect(formatTime(new Date(2026, 0, 1, 0, 0))).toBe("00:00");
  });
});

describe("splitReminder", () => {
  it("picks the largest unit that divides evenly", () => {
    expect(splitReminder(2880)).toEqual({ amount: 2, unit: 1440 });
    expect(splitReminder(180)).toEqual({ amount: 3, unit: 60 });
    expect(splitReminder(45)).toEqual({ amount: 45, unit: 1 });
  });

  it("keeps zero in minutes", () => {
    expect(splitReminder(0)).toEqual({ amount: 0, unit: 1 });
  });
});

describe("dayStatus", () => {
  const day = new Date(2026, 9, 22);
  const entry = (status: ScheduledWorkout["status"], hour = 18): ScheduledWorkout => ({
    id: hour,
    title: "Push",
    programDay: null,
    startAt: new Date(2026, 9, 22, hour).toISOString(),
    durationMin: 60,
    reminderMinutes: null,
    alarm: false,
    status,
    scheduledBy: null,
  });

  it("is null for an empty or accepted day", () => {
    expect(dayStatus([], day)).toBeNull();
    expect(dayStatus([entry("accepted")], day)).toBeNull();
  });

  it("is pending when any entry is pending", () => {
    expect(dayStatus([entry("accepted", 9), entry("pending"), entry("cancelled", 20)], day)).toBe("pending");
  });

  it("is cancelled only when every entry is", () => {
    expect(dayStatus([entry("cancelled", 9), entry("cancelled")], day)).toBe("cancelled");
    expect(dayStatus([entry("cancelled", 9), entry("accepted")], day)).toBeNull();
  });
});
