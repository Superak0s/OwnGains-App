import { captureException } from "@shared/services/crashReporting";
import type { PendingSync } from "../types";
import {
  applyRecordChanges,
  listRecords,
  replaceCollection,
} from "./sqliteStorage";
import { getUserKey, STORAGE_KEYS } from "./storage";
import { pendingSyncSortKey } from "./pendingSyncRows";

export interface PendingSyncRow {
  id: string;
  sortKey: string;
  value: string;
}

export interface PendingSyncStore {
  load: (userId: string | null) => Promise<PendingSync[]>;
  replace: (userId: string | null, rows: PendingSyncRow[]) => Promise<void>;
  apply: (
    userId: string | null,
    puts: PendingSyncRow[],
    deleteIds: string[],
  ) => Promise<void>;
}

const collectionOf = (userId: string | null) =>
  getUserKey(STORAGE_KEYS.PENDING_SYNCS, userId);

export const toPendingSyncRow = (
  sync: PendingSync & { syncId: string },
): PendingSyncRow => ({
  id: sync.syncId,
  sortKey: pendingSyncSortKey(sync),
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

export const pendingSyncStore: PendingSyncStore = {
  load: loadPendingSyncs,
  replace: (userId, rows) => replaceCollection(collectionOf(userId), rows),
  apply: (userId, puts, deleteIds) =>
    applyRecordChanges(collectionOf(userId), puts, deleteIds),
};
