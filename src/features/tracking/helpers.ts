import type { UseAlertReturn } from "@shared/components/CustomAlert";
import type { DayModalState } from "./types";

function filterDayModalEntry(prev: DayModalState | null, entryId: string | number) {
  if (!prev) return null;
  const remaining = (prev.existingEntries ?? []).filter((e) => e.id !== entryId);
  return {
    ...prev,
    existingEntries: remaining.length > 0 ? remaining : null,
  };
}

/**
 * Server errors the user can act on. Keyed by the `code` the API sends, so the
 * copy here is ours. The sniffing below is a fallback for everything that
 * has no code, and for a server too old to send one.
 */
const ERROR_COPY: Record<string, string> = {
  VALUE_OUT_OF_RANGE: "That number is too large for this field.",
  FUTURE_TIMESTAMP: "That date is in the future. Check the day and time.",
  METRIC_UNKNOWN: "That measurement isn't set up yet. Add it first, then log it.",
  DUPLICATE_METRIC: "You already track a measurement with that name.",
};

export function describeError(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code && ERROR_COPY[code]) return ERROR_COPY[code];

  const raw = err instanceof Error ? err.message : String(err);
  if (/network|fetch|timeout|offline/i.test(raw))
    return "Couldn't reach the server. Check your connection and try again.";
  if (/401|403|unauthor|forbidden/i.test(raw))
    return "Your session has expired. Sign in again to continue.";
  if (/404|not found/i.test(raw))
    return "That entry no longer exists. It may already have been deleted.";
  if (/50\d/.test(raw)) return "The server had a problem. Try again in a moment.";
  return raw || "Something went wrong. Please try again.";
}

export function withConfirm<T>(
  onAlert: UseAlertReturn["alert"],
  message: (entry: T) => string,
  onDelete: (entry: T) => void,
  title = "Delete Entry",
) {
  return (entry: T) =>
    onAlert(
      title,
      message(entry),
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete(entry) },
      ],
      "warning",
    );
}

// createDeleteHandler is called in a hook body, so a per-call Set would be a
// fresh (empty) one on every render and let a double-tap through. The guard has
// to persist across renders, so it is module scope, keyed per collection.
const inFlightDeletes = new Map<string, Set<string | number>>();

export function createDeleteHandler<T extends { id: string | number }>(
  collection: string,
  apiDelete: (id: T["id"]) => Promise<unknown>,
  setHistory: (updater: (prev: T[]) => T[]) => void,
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void,
  onAlert: UseAlertReturn["alert"],
  extraCleanup?: (entry: T) => void,
) {
  let inFlightIds = inFlightDeletes.get(collection);
  if (!inFlightIds) {
    inFlightIds = new Set<string | number>();
    inFlightDeletes.set(collection, inFlightIds);
  }
  const run = async (entry: T) => {
    const entryId = entry.id;
    if (inFlightIds.has(entryId)) return;
    inFlightIds.add(entryId);
    try {
      await apiDelete(entryId);
      setHistory((prev) => prev.filter((e) => e.id !== entryId));
      setDayModal((prev) => filterDayModalEntry(prev, entryId));
      extraCleanup?.(entry);
    } catch (err) {
      onAlert(
        "Couldn't delete entry",
        describeError(err),
        [
          { text: "Cancel", style: "cancel" },
          { text: "Retry", onPress: () => void run(entry) },
        ],
        "error",
      );
    } finally {
      inFlightIds.delete(entryId);
    }
  };
  return run;
}
