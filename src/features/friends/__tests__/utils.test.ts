import type { SetTiming } from "@shared/types";
import type { LiveData, PermissionType, ReceivedProgram } from "../types";
import { friendTabLocks, mergeLiveSet } from "../utils";

const set = (id: number, reps = 5) => ({ id, reps }) as unknown as SetTiming;

describe("mergeLiveSet", () => {
  const live: LiveData = { dayNumber: 1, setTimings: [set(1), set(2)] };

  it("appends a set from the watched session", () => {
    const next = mergeLiveSet(live, set(3), 10, "10");
    expect(next!.setTimings!.map((t) => t.id)).toEqual([1, 2, 3]);
  });

  it("replaces a redelivered set instead of counting it twice", () => {
    const next = mergeLiveSet(live, set(2, 8), "10", "10");
    expect(next!.setTimings).toHaveLength(2);
    expect(next!.setTimings!.find((t) => t.id === 2)).toMatchObject({ reps: 8 });
  });

  it("ignores a set from another session", () => {
    expect(mergeLiveSet(live, set(3), 11, "10")).toBe(live);
    expect(mergeLiveSet(live, set(3), undefined, "10")).toBe(live);
  });

  it("ignores sets before a session is being watched", () => {
    expect(mergeLiveSet(null, set(3), 10, "10")).toBeNull();
    expect(mergeLiveSet(live, set(3), 10, null)).toBe(live);
  });

  it("starts the list when the live data has no sets yet", () => {
    const next = mergeLiveSet({ dayNumber: 1 }, set(1), 10, "10");
    expect(next!.setTimings).toHaveLength(1);
  });
});

describe("friendTabLocks", () => {
  const granting =
    (...granted: PermissionType[]) =>
    (_id: unknown, type: PermissionType) =>
      granted.includes(type);
  const program = { senderId: 5 } as ReceivedProgram;

  it("locks everything but Actions without any grant", () => {
    expect(friendTabLocks(5, [], granting())).toEqual({
      history: true,
      analytics: true,
      program: true,
      live: true,
      actions: false,
    });
  });

  it("needs History as well as Analytics to open Analytics", () => {
    expect(friendTabLocks(5, [], granting("analytics")).analytics).toBe(true);
    expect(friendTabLocks(5, [], granting("history")).analytics).toBe(true);
    expect(friendTabLocks(5, [], granting("history", "analytics")).analytics).toBe(false);
  });

  it("opens History and Live on their own grants", () => {
    const locks = friendTabLocks(5, [], granting("history", "watch_session"));
    expect(locks.history).toBe(false);
    expect(locks.live).toBe(false);
  });

  it("opens Program only for a program this friend shared", () => {
    expect(friendTabLocks(5, [program], granting()).program).toBe(false);
    expect(friendTabLocks(6, [program], granting()).program).toBe(true);
  });
});
