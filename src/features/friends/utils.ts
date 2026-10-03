import type { SetTiming } from "@shared/types";
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
