interface QueuedOp {
  timestamp?: string;
  syncId?: string;
}

/** Orders rows by when the op happened, and the sync id breaks same-millisecond ties. */
export const pendingSyncSortKey = (sync: QueuedOp): string =>
  `${sync.timestamp ?? ""}|${sync.syncId ?? ""}`;
