jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { collections, resetMemorySqlite } from "test-utils/memorySqlite";
import { loadPendingSyncs, pendingSyncStore, toPendingSyncRow } from "../pendingSyncStore";
import type { PendingSync } from "../../types";

const op = (syncId: string, timestamp: string) =>
  ({
    type: "startSession",
    syncId,
    data: { split: "local", dayNumber: 1 },
    timestamp,
  }) as PendingSync & { syncId: string };

beforeEach(resetMemorySqlite);

describe("pendingSyncStore", () => {
  it("loads the queue oldest first and skips an unreadable row", async () => {
    await pendingSyncStore.replace("u1", [
      toPendingSyncRow(op("b", "2026-01-02")),
      toPendingSyncRow(op("a", "2026-01-01")),
      { id: "bad", sortKey: "2026-01-03|bad", value: "{" },
    ]);

    const loaded = await loadPendingSyncs("u1");
    expect(loaded.map((s) => s.syncId)).toEqual(["a", "b"]);
    expect(await loadPendingSyncs("u2")).toEqual([]);
  });

  it("applies puts and deletes to the user's collection only", async () => {
    await pendingSyncStore.replace("u1", [toPendingSyncRow(op("a", "t1"))]);
    await pendingSyncStore.apply("u1", [toPendingSyncRow(op("b", "t2"))], ["a"]);

    expect(collections["pendingSyncs_user_u1"].map((r) => r.id)).toEqual(["b"]);
  });
});
