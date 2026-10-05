import { captureException } from "@shared/services/crashReporting";
import type { PendingSync } from "../types";
import {
  applyRecordChanges,
  listRecords,
  replaceCollection,
} from "./sqliteStorage";
import { getUserKey, STORAGE_KEYS } from "./storage";

export interface PendingSyncRow {
  id: string;
  sortKey: string;
  value: string;
}

const collectionOf = (userId: string | null) =>
  getUserKey(STORAGE_KEYS.PENDING_SYNCS, userId);

export const toPendingSyncRow = (
  sync: PendingSync & { syncId: string },
): PendingSyncRow => ({
  id: sync.syncId,
  // The sync id breaks ties between ops logged with the same timestamp.
  sortKey: `${sync.timestamp ?? ""}|${sync.syncId}`,
  value: JSON.stringify(sync),
});

export const loadPendingSyncs = async (
  userId: string | null,
): Promise<PendingSync[]> => {
  const values = await listRecords(collectionOf(userId));
  const syncs: PendingSync[] = [];
  for (const value of values) {
    try {
      syncs.push(JSON.parse(value) as PendingSync);
    } catch (error) {
      // One unreadable op shouldn't hold back the rest of the queue.
      captureException(error, { stage: "readPendingSync" });
    }
  }
  return syncs.reverse();
};

export const pendingSyncStore = {
  replace: (userId: string | null, rows: PendingSyncRow[]) =>
    replaceCollection(collectionOf(userId), rows),
  apply: (userId: string | null, puts: PendingSyncRow[], deleteIds: string[]) =>
    applyRecordChanges(collectionOf(userId), puts, deleteIds),
};
