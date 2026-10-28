import type { GroupedExercise, SetTiming, WorkoutData } from "@shared/types";
import type { FriendId, LiveData, PermissionType, ReceivedProgram } from "./types";

// The server sends only the new set, so merge rather than replace. Dropping any
// row with the same id first keeps a redelivered message (WS reconnect) from
// double-counting it. A set from another session (a second friend training at
// the same time) is ignored.
export function mergeLiveSet(
  prev: LiveData | null,
  incoming: SetTiming,
  incomingSessionId: number | string | undefined,
  watchedSessionId: string | null,
): LiveData | null {
  if (!prev || String(incomingSessionId) !== watchedSessionId) return prev;
  const kept = (prev.setTimings ?? []).filter((t) => t.id !== incoming.id);
  return { ...prev, setTimings: [...kept, incoming] };
}

// The server matches usernames by prefix and refuses shorter queries.
export const MIN_USER_SEARCH_LENGTH = 3;

export type FriendTabKey = "history" | "analytics" | "program" | "live" | "actions";

export function friendTabLocks(
  friendId: FriendId,
  receivedPrograms: ReceivedProgram[],
  hasReceivedPermission: (friendId: FriendId, type: PermissionType) => boolean,
): Record<FriendTabKey, boolean> {
  const hasHistory = hasReceivedPermission(friendId, "history");
  // Friend analytics are computed from the history endpoints, which the server
  // checks `history` alone.
  const hasAnalytics = hasHistory && hasReceivedPermission(friendId, "analytics");
  return {
    history: !hasHistory,
    analytics: !hasAnalytics,
    program: !receivedPrograms.some((p) => p.senderId === friendId),
    live: !hasReceivedPermission(friendId, "watch_session"),
    actions: false,
  };
}

export function groupSessionExercises(setTimings: SetTiming[] | undefined): GroupedExercise[] {
  const groups = new Map<string, GroupedExercise>();
  for (const t of setTimings ?? []) {
    const name = t.exerciseName || `Exercise ${t.exerciseId ?? "?"}`;
    if (!groups.has(name)) groups.set(name, { exerciseName: name, sets: [] });
    groups.get(name)!.sets.push(t);
  }
  for (const g of groups.values()) g.sets.sort((a, b) => a.setIndex - b.setIndex);
  return Array.from(groups.values());
}

/** Every split name in a program, in its listed order first. */
export const programSplits = (wd: WorkoutData & { people?: string[] }): string[] => [
  ...new Set([...(wd.split ?? wd.people ?? []), ...wd.days.flatMap((d) => Object.keys(d.split))]),
];

/** @param splits - Only these splits are sent, and days left with none are dropped. */
export const programPayload = (
  wd: WorkoutData & { people?: string[] },
  splits?: readonly string[],
): Record<string, unknown> => {
  if (!splits) {
    const split = wd.split ?? wd.people;
    return {
      programData: {
        name: `${split?.join("/")} Program, ${wd.totalDays} Days`,
        totalDays: wd.totalDays,
        split,
        days: wd.days,
      },
      message: null,
    };
  }
  const days = wd.days
    .map((d) => ({
      ...d,
      split: Object.fromEntries(Object.entries(d.split).filter(([name]) => splits.includes(name))),
    }))
    .filter((d) => Object.values(d.split).some((s) => (s.exercises?.length ?? 0) > 0));
  const split = programSplits(wd).filter((name) => splits.includes(name));
  return {
    programData: {
      name: `${split.join("/")} Program, ${days.length} Days`,
      totalDays: days.length,
      split,
      days,
    },
    message: null,
  };
};
