type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

type RecordRow = { collection: string; id: string; sort_key: string };

function loadStorage(records: RecordRow[] = []) {
  const main = {
    execSync: jest.fn(),
    runSync: jest.fn(),
    getFirstSync: jest.fn((): unknown => ({ user_version: 1 })),
    getAllSync: jest.fn((): unknown[] => records),
    withTransactionSync: jest.fn((task: () => void) => task()),
    withExclusiveTransactionAsync: jest.fn(
      async (task: (txn: unknown) => Promise<void>) => task(txn),
    ),
  };
  const txn = {
    runAsync: jest.fn(async () => undefined),
    getAllSync: jest.fn(() => []),
    runSync: jest.fn(),
    prepareAsync: jest.fn(async () => ({
      executeAsync: jest.fn(async () => undefined),
      finalizeAsync: jest.fn(async () => undefined),
    })),
  };
  const read = {
    getFirstAsync: jest.fn(async (): Promise<unknown> => null),
    getAllAsync: jest.fn(async (): Promise<unknown[]> => []),
  };
  jest.doMock("expo-sqlite", () => ({
    openDatabaseSync: (_name: string, options?: { useNewConnection?: boolean }) =>
      options?.useNewConnection ? read : main,
  }));
  let storage!: typeof import("../sqliteStorage");
  jest.isolateModules(() => {
    storage = require("../sqliteStorage");
  });
  const migrationCalls = [...main.runSync.mock.calls];
  jest.clearAllMocks();
  return { storage, main, read, txn, migrationCalls };
}

import { getLocalISOString } from "@utils/session";

afterEach(() => {
  jest.dontMock("expo-sqlite");
});

describe("sqliteStorage queues", () => {
  it("does not hold a write behind a slow read", async () => {
    const { storage, main, read } = loadStorage();
    const slowRead = deferred<unknown[]>();
    read.getAllAsync.mockReturnValueOnce(slowRead.promise);

    const listing = storage.listRecords("sets");
    await flush();
    await storage.putRecord("sets", "1", "a", "{}");

    expect(main.runSync).toHaveBeenCalledTimes(1);
    slowRead.resolve([{ value: "{}" }]);
    await expect(listing).resolves.toEqual(["{}"]);
  });

  it("holds a read until the writes queued before it have finished", async () => {
    const { storage, main, read } = loadStorage();
    const transaction = deferred<void>();
    main.withExclusiveTransactionAsync.mockReturnValueOnce(transaction.promise);
    const rows = Array.from({ length: 201 }, (_, i) => ({
      id: String(i),
      sortKey: "a",
      value: "{}",
    }));

    const write = storage.putRecords("sets", rows);
    const reading = storage.getStorageItem("k");
    await flush();
    expect(read.getFirstAsync).not.toHaveBeenCalled();

    transaction.resolve();
    await write;
    await reading;
    expect(read.getFirstAsync).toHaveBeenCalledTimes(1);
  });

  it("runs one read at a time on the read connection", async () => {
    const { storage, read } = loadStorage();
    const first = deferred<unknown[]>();
    read.getAllAsync.mockReturnValueOnce(first.promise);

    const a = storage.listRecords("sets");
    const b = storage.listRecords("notes");
    await flush();
    expect(read.getAllAsync).toHaveBeenCalledTimes(1);

    first.resolve([]);
    await Promise.all([a, b]);
    expect(read.getAllAsync).toHaveBeenCalledTimes(2);
  });

  it("writes small batches synchronously and large ones off the JS thread", async () => {
    const { storage, main } = loadStorage();
    const row = (id: number) => ({ id: String(id), sortKey: "a", value: "{}" });

    await storage.putRecords("sets", [row(1), row(2)]);
    expect(main.withTransactionSync).toHaveBeenCalledTimes(1);
    expect(main.withExclusiveTransactionAsync).not.toHaveBeenCalled();

    await storage.putRecords("sets", Array.from({ length: 201 }, (_, i) => row(i)));
    expect(main.withExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  });

  it("reports a failed statement and keeps the queue moving", async () => {
    const { storage, main } = loadStorage();
    const onError = jest.fn();
    storage.setStorageErrorHandler(onError);
    main.runSync.mockImplementationOnce(() => {
      throw new Error("disk full");
    });

    await expect(storage.setStorageItem("k", "v")).rejects.toThrow("disk full");
    await storage.setStorageItem("k", "v");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(main.runSync).toHaveBeenCalledTimes(2);
  });

  it("restores in one exclusive transaction and drops cached sync reads", async () => {
    const { storage, main, txn } = loadStorage();
    main.getFirstSync.mockReturnValue({ value: "old" });
    expect(storage.getStorageItemSync("@mode")).toBe("old");

    await storage.importAll({
      kv: { "@mode": "new" },
      records: { sets: [{ id: "1", sortKey: "a", value: "{}" }] },
    });

    expect(txn.runAsync).toHaveBeenCalledWith("DELETE FROM kv_store");
    expect(txn.prepareAsync).toHaveBeenCalledTimes(2);
    main.getFirstSync.mockReturnValue({ value: "new" });
    expect(storage.getStorageItemSync("@mode")).toBe("new");
  });
});

describe("sqliteStorage record batches", () => {
  it("replaces a collection with its delete and inserts in one transaction", async () => {
    const { storage, main } = loadStorage();

    await storage.replaceCollection("q", [{ id: "1", sortKey: "a", value: "{}" }]);

    expect(main.withTransactionSync).toHaveBeenCalledTimes(1);
    expect(main.runSync.mock.calls.map((c) => c[0])).toEqual([
      "DELETE FROM kv_records WHERE collection = ?",
      expect.stringContaining("INSERT"),
    ]);
  });

  it("skips the transaction when there is nothing to change", async () => {
    const { storage, main } = loadStorage();

    await storage.applyRecordChanges("q", [], []);

    expect(main.withTransactionSync).not.toHaveBeenCalled();
  });
});

describe("sqliteStorage sort keys", () => {
  it("stores a pending-sync key in UTC, so a DST fall-back keeps replay order", async () => {
    const { storage, main } = loadStorage();
    // Athens: the set is 03:50+03:00, the later endSession 03:05+02:00.
    const set = `${getLocalISOString(new Date("2026-10-25T00:50:00Z"))}|sync_a`;
    const end = `${getLocalISOString(new Date("2026-10-25T01:05:00Z"))}|sync_b`;
    await storage.putRecord("pending", "a", set, "{}");
    await storage.putRecord("pending", "b", end, "{}");

    expect(main.runSync.mock.calls.map((call) => (call[1] as unknown[])[2])).toEqual([
      "2026-10-25T00:50:00.000Z|sync_a",
      "2026-10-25T01:05:00.000Z|sync_b",
    ]);
  });

  it("pages from a UTC cursor", async () => {
    const { storage, read } = loadStorage();
    await storage.listRecordsBefore("sessions", { sortKey: "2026-10-23 07:00:00", id: "x" }, 10);

    expect(read.getAllAsync.mock.calls[0]).toEqual([
      expect.any(String),
      ["sessions", "2026-10-23T07:00:00.000Z", "2026-10-23T07:00:00.000Z", "x", 10],
    ]);
  });

  it("migration 10 rewrites legacy sort keys and leaves UTC and empty ones alone", () => {
    const { migrationCalls } = loadStorage([
      { collection: "workout_sessions", id: "1", sort_key: "2026-10-23 07:00:00" },
      { collection: "pending", id: "2", sort_key: "2026-10-25T03:50:00.000+03:00|sync_a" },
      { collection: "body_weight", id: "3", sort_key: "2026-10-23T05:00:00.000Z" },
      { collection: "workout_sessions", id: "4", sort_key: "" },
    ]);

    expect(
      migrationCalls
        .filter(([sql]) => String(sql).startsWith("UPDATE kv_records"))
        .map(([, params]) => params),
    ).toEqual([
      ["2026-10-23T07:00:00.000Z", "workout_sessions", "1"],
      ["2026-10-25T00:50:00.000Z|sync_a", "pending", "2"],
    ]);
  });
});
