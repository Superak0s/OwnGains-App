import type { SetTiming } from "@shared/types";
import type { LiveData, PermissionType, ReceivedProgram } from "../types";
import { friendTabLocks, groupSessionExercises, mergeLiveSet, programPayload } from "../utils";

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

describe("groupSessionExercises", () => {
  const timing = (exerciseName: string | undefined, setIndex: number, exerciseId = 4) =>
    ({ id: `${exerciseName}-${setIndex}`, exerciseName, exerciseId, setIndex }) as unknown as SetTiming;

  it("groups sets by exercise in set order", () => {
    const groups = groupSessionExercises([timing("Squat", 1), timing("Bench", 0), timing("Squat", 0)]);
    expect(groups.map((g) => [g.exerciseName, g.sets.map((s) => s.setIndex)])).toEqual([
      ["Squat", [0, 1]],
      ["Bench", [0]],
    ]);
  });

  it("names an exercise with no name by its id", () => {
    expect(groupSessionExercises([timing(undefined, 0, 9)])[0].exerciseName).toBe("Exercise 9");
  });

  it("returns no groups for a session without set timings", () => {
    expect(groupSessionExercises(undefined)).toEqual([]);
  });
});

describe("programPayload", () => {
  const ex = (name: string) => ({ name, sets: 3, primaryMuscles: [], secondaryMuscles: [] });
  const wd = {
    totalDays: 2,
    split: ["A", "B"],
    days: [
      { dayNumber: 1, dayTitle: "Push", split: { A: { exercises: [ex("Bench")], totalSets: 3 }, B: { exercises: [ex("Dip")], totalSets: 3 } } },
      { dayNumber: 2, dayTitle: "Pull", split: { B: { exercises: [ex("Row")], totalSets: 3 } } },
    ],
  } as unknown as Parameters<typeof programPayload>[0];

  it("sends only the chosen splits and drops days left empty", () => {
    const { programData } = programPayload(wd, ["A"]) as {
      programData: { split: string[]; totalDays: number; days: { dayNumber: number; split: object }[]; name: string };
    };
    expect(programData.split).toEqual(["A"]);
    expect(programData.days.map((d) => d.dayNumber)).toEqual([1]);
    expect(Object.keys(programData.days[0].split)).toEqual(["A"]);
    expect(programData.totalDays).toBe(1);
    expect(programData.name).toBe("A Program, 1 Days");
  });

  it("sends the whole program when no splits are chosen", () => {
    const { programData } = programPayload(wd) as { programData: { days: unknown[] } };
    expect(programData.days).toHaveLength(2);
  });
});
