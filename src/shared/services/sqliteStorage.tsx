import * as SQLite from "expo-sqlite";
import { runMigrations, type Migration } from "./storageMigrations";

const db = SQLite.openDatabaseSync("asyncStorage.db");

db.execSync("PRAGMA journal_mode = WAL");
db.execSync("PRAGMA synchronous = NORMAL");

db.execSync(
  "CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY NOT NULL, value TEXT)",
);

db.execSync(`CREATE TABLE IF NOT EXISTS kv_records (
  collection TEXT NOT NULL,
  id TEXT NOT NULL,
  sort_key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (collection, id)
)`);
db.execSync(
  "CREATE INDEX IF NOT EXISTS idx_kv_records_sort ON kv_records (collection, sort_key)",
);

// Queued reads use their own connection and the async API so large reads stay
// off the JS thread. WAL lets it read beside the main connection, so a
// render-path getStorageItemSync can never share a connection with one of them.
const readDb = SQLite.openDatabaseSync("asyncStorage.db", {
  useNewConnection: true,
});

// Schema version 1 is the baseline: the tables above, created on first open.
const MIGRATIONS: readonly Migration[] = [() => {}];

runMigrations(db, MIGRATIONS);

// Registered by crashReporting rather than imported from it: this module is
// loaded during crashReporting's own module init, so importing back would
// leave getStorageItemSync undefined whenever storage is required first.
let onStorageError: (error: unknown) => void = () => {};
export const setStorageErrorHandler = (
  handler: (error: unknown) => void,
): void => {
  onStorageError = handler;
};

const upsertKvSql =
  "INSERT INTO kv_store (key, value) VALUES (?, ?) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value";
const upsertRecordSql =
  "INSERT INTO kv_records (collection, id, sort_key, value) VALUES (?, ?, ?, ?) " +
  "ON CONFLICT(collection, id) DO UPDATE SET sort_key = excluded.sort_key, value = excluded.value";

const instrumented =
  <T,>(task: () => Promise<T>) =>
  async (): Promise<T> => {
    try {
      return await task();
    } catch (error) {
      onStorageError(error);
      throw error;
    }
  };

const settled = (promise: Promise<unknown>): Promise<void> =>
  promise.then(
    () => {},
    () => {},
  );

// One queue per connection, because expo-sqlite breaks under concurrent
// statements on one connection. There is no timeout escape hatch: releasing a
// queue while its task still runs is exactly that condition.
let writeTail: Promise<void> = Promise.resolve();
let readTail: Promise<void> = Promise.resolve();

/**
 * Writes never wait behind reads: under WAL a read in flight keeps its own
 * snapshot, so a large list read or export no longer delays logging a set.
 */
function serializeWrite<T>(task: () => Promise<T>): Promise<T> {
  const result = writeTail.then(instrumented(task));
  writeTail = settled(result);
  return result;
}

/** Waits for every write queued before it, so a read sees what came earlier. */
function serializeRead<T>(task: () => Promise<T>): Promise<T> {
  const result = Promise.all([writeTail, readTail]).then(instrumented(task));
  readTail = settled(result);
  return result;
}

// Above this a batch runs on its own connection with the async API: the
// synchronous one blocks the JS thread for the whole transaction.
const ASYNC_BATCH_THRESHOLD = 200;

/**
 * Runs `task` in an exclusive transaction on a separate connection. Only safe
 * inside serializeWrite: a competing write would fail with "database is
 * locked" rather than wait.
 */
const inExclusiveTransaction = (
  task: (txn: SQLite.SQLiteDatabase) => Promise<void>,
): Promise<void> => db.withExclusiveTransactionAsync(task);

async function runPrepared(
  txn: SQLite.SQLiteDatabase,
  sql: string,
  rows: Iterable<SQLite.SQLiteBindParams>,
): Promise<void> {
  const statement = await txn.prepareAsync(sql);
  try {
    for (const params of rows) await statement.executeAsync(params);
  } finally {
    await statement.finalizeAsync();
  }
}

interface BatchStatement {
  sql: string;
  rows: SQLite.SQLiteBindParams[];
}

/** One transaction, off the JS thread once it is large enough to be felt. */
async function writeBatch(statements: BatchStatement[]): Promise<void> {
  const size = statements.reduce((sum, s) => sum + s.rows.length, 0);
  if (size === 0) return;
  if (size > ASYNC_BATCH_THRESHOLD) {
    await inExclusiveTransaction(async (txn) => {
      for (const { sql, rows } of statements) await runPrepared(txn, sql, rows);
    });
    return;
  }
  db.withTransactionSync(() => {
    for (const { sql, rows } of statements)
      for (const params of rows) db.runSync(sql, params);
  });
}

// Every key ever read synchronously, kept in memory and written through by the
// queued writers below. Without it a render-path sync read can land a statement
// on the connection while a queued async statement is mid-flight, which is the
// exact condition the queue exists to prevent.
// ponytail: only keys touched by getStorageItemSync are cached, so the map
// remains tiny. Drop it if expo-sqlite ever tolerates concurrent statements.
const syncCache = new Map<string, string | null>();
// Called only after the statement succeeded: a cache updated ahead of a failed
// write would serve getStorageItemSync a value the next launch will not have.
const writeThrough = (key: string, value: string | null): void => {
  if (syncCache.has(key)) syncCache.set(key, value);
};

/**
 * Synchronous read, for the few values needed before the app has an
 * event loop to await on: the crash-reporting opt-out, the app mode and the
 * onboarding flag. Served from memory after the first read of each key, so
 * later calls from render paths never touch the connection.
 */
export const getStorageItemSync = (key: string): string | null => {
  const cached = syncCache.get(key);
  if (cached !== undefined) return cached;
  const value =
    db.getFirstSync<{ value: string }>(
      "SELECT value FROM kv_store WHERE key = ?",
      [key],
    )?.value ?? null;
  syncCache.set(key, value);
  return value;
};

export interface ExportedRecord {
  id: string;
  sortKey: string;
  value: string;
}

export interface StorageSnapshot {
  kv: Record<string, string>;
  records: Record<string, ExportedRecord[]>;
}

/**
 * Every row on this device, for the offline data export. Dumping the two
 * tables wholesale rather than naming each feature's keys means a feature
 * added later is exported automatically instead of being silently left out.
 * Auth tokens are stored in expo-secure-store, not here, so nothing secret is
 * included.
 */
export const exportAll = (): Promise<StorageSnapshot> =>
  serializeRead(async () => {
    const kvRows = await readDb.getAllAsync<{ key: string; value: string }>(
      "SELECT key, value FROM kv_store",
    );
    const kv: Record<string, string> = {};
    for (const row of kvRows) kv[row.key] = row.value;

    const recordRows = await readDb.getAllAsync<{
      collection: string;
      id: string;
      sort_key: string;
      value: string;
    }>(
      "SELECT collection, id, sort_key, value FROM kv_records ORDER BY collection, sort_key DESC",
    );
    const records: Record<string, ExportedRecord[]> = {};
    for (const row of recordRows) {
      records[row.collection] ??= [];
      records[row.collection].push({
        id: row.id,
        sortKey: row.sort_key,
        value: row.value,
      });
    }

    return { kv, records };
  });

export type ImportMode = "replace" | "merge";

/**
 * In `replace` mode every existing row is dropped first, so the device ends up
 * with exactly the snapshot. `merge` keeps what is already here and lets the
 * snapshot's rows win on collisions, which can resurrect records the user
 * deleted after taking the backup. That is the trade the user accepts when
 * choosing it. Runs as one transaction so a failure can't leave the wipe
 * committed without the restore.
 */
export const importAll = (
  snapshot: StorageSnapshot,
  mode: ImportMode = "replace",
): Promise<void> =>
  serializeWrite(async () => {
    try {
      await inExclusiveTransaction(async (txn) => {
        if (mode === "replace") {
          await txn.runAsync("DELETE FROM kv_store");
          await txn.runAsync("DELETE FROM kv_records");
        }
        await runPrepared(txn, upsertKvSql, Object.entries(snapshot.kv ?? {}));
        await runPrepared(
          txn,
          upsertRecordSql,
          Object.entries(snapshot.records ?? {}).flatMap(([collection, rows]) =>
            rows.map((row) => [collection, row.id, row.sortKey, row.value]),
          ),
        );
      });
    } finally {
      // A render-path sync read during the import may have cached a pre-import value.
      syncCache.clear();
    }
  });

export const getStorageItem = (key: string): Promise<string | null> =>
  serializeRead(async () => {
    const row = await readDb.getFirstAsync<{ value: string }>(
      "SELECT value FROM kv_store WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  });

export const setStorageItem = (key: string, value: string): Promise<void> =>
  serializeWrite(async () => {
    db.runSync(upsertKvSql, [key, value]);
    writeThrough(key, value);
  });

export const getStorageItems = (keys: string[]): Promise<Record<string, string>> =>
  serializeRead(async () => {
    if (keys.length === 0) return {}
    const placeholders = keys.map(() => "?").join(", ")
    const rows = await readDb.getAllAsync<{ key: string; value: string }>(
      `SELECT key, value FROM kv_store WHERE key IN (${placeholders})`,
      keys,
    )
    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return result
  })

export const removeStorageItem = (key: string): Promise<void> =>
  serializeWrite(async () => {
    db.runSync("DELETE FROM kv_store WHERE key = ?", [key]);
    writeThrough(key, null);
  });

export const removeStorageItems = (keys: string[]): Promise<void> =>
  serializeWrite(async () => {
    if (keys.length === 0) return;
    const placeholders = keys.map(() => "?").join(", ");
    db.runSync(
      `DELETE FROM kv_store WHERE key IN (${placeholders})`,
      keys,
    );
    for (const key of keys) writeThrough(key, null);
  });



export const getRecord = (
  collection: string,
  id: string,
): Promise<string | null> =>
  serializeRead(async () => {
    const row = await readDb.getFirstAsync<{ value: string }>(
      "SELECT value FROM kv_records WHERE collection = ? AND id = ?",
      [collection, id],
    );
    return row?.value ?? null;
  });

export const listRecords = (
  collection: string,
  limit?: number,
): Promise<string[]> =>
  serializeRead(async () => {
    const sql =
      "SELECT value FROM kv_records WHERE collection = ? ORDER BY sort_key DESC";
    const rows =
      limit == null
        ? await readDb.getAllAsync<{ value: string }>(sql, [collection])
        : await readDb.getAllAsync<{ value: string }>(`${sql} LIMIT ?`, [collection, limit]);
    return rows.map((r) => r.value);
  });

export const listRecordsSince = (
  collection: string,
  sinceSortKey: string,
): Promise<string[]> =>
  serializeRead(async () => {
    const rows = await readDb.getAllAsync<{ value: string }>(
      "SELECT value FROM kv_records WHERE collection = ? AND sort_key >= ? ORDER BY sort_key DESC",
      [collection, sinceSortKey],
    );
    return rows.map((r) => r.value);
  });

export interface RecordCursor {
  sortKey: string;
  id: string;
}

/** Keyset page ordered by (sort_key, id) descending, starting after `before`. */
export const listRecordsBefore = (
  collection: string,
  before: RecordCursor | null,
  limit: number,
): Promise<string[]> =>
  serializeRead(async () => {
    const order = " ORDER BY sort_key DESC, id DESC LIMIT ?";
    const rows = before
      ? await readDb.getAllAsync<{ value: string }>(
          `SELECT value FROM kv_records WHERE collection = ? AND (sort_key < ? OR (sort_key = ? AND id < ?))${order}`,
          [collection, before.sortKey, before.sortKey, before.id, limit],
        )
      : await readDb.getAllAsync<{ value: string }>(
          `SELECT value FROM kv_records WHERE collection = ?${order}`,
          [collection, limit],
        );
    return rows.map((r) => r.value);
  });

export type RecordFilter = Record<string, string | number>;

/** Top-level JSON fields matched in SQL, so non-matching rows are never parsed. */
export const listRecordsWhere = (
  collection: string,
  where: RecordFilter,
  limit?: number,
): Promise<string[]> =>
  serializeRead(async () => {
    const fields = Object.entries(where);
    const conditions = fields
      .map(() => " AND json_extract(value, ?) = ?")
      .join("");
    const params: (string | number)[] = [collection];
    for (const [field, value] of fields) params.push(`$.${field}`, value);
    let sql = `SELECT value FROM kv_records WHERE collection = ?${conditions} ORDER BY sort_key DESC`;
    if (limit != null) {
      sql += " LIMIT ?";
      params.push(limit);
    }
    const rows = await readDb.getAllAsync<{ value: string }>(sql, params);
    return rows.map((r) => r.value);
  });

export const putRecord = (
  collection: string,
  id: string,
  sortKey: string,
  value: string,
): Promise<void> =>
  serializeWrite(async () => {
    db.runSync(upsertRecordSql, [collection, id, sortKey, value]);
  });

interface RecordWrite {
  id: string;
  sortKey: string;
  value: string;
}

export const putRecords = (
  collection: string,
  records: RecordWrite[],
): Promise<void> =>
  serializeWrite(() => writeBatch([upsertsOf(collection, records)]));

const upsertsOf = (
  collection: string,
  records: RecordWrite[],
): BatchStatement => ({
  sql: upsertRecordSql,
  rows: records.map((r) => [collection, r.id, r.sortKey, r.value]),
});

/** Upserts and deletes in one transaction, so a crash can't apply half. */
export const applyRecordChanges = (
  collection: string,
  puts: RecordWrite[],
  deleteIds: string[],
): Promise<void> =>
  serializeWrite(() =>
    writeBatch([
      upsertsOf(collection, puts),
      {
        sql: "DELETE FROM kv_records WHERE collection = ? AND id = ?",
        rows: deleteIds.map((id) => [collection, id]),
      },
    ]),
  );

/** Leaves the collection holding exactly `records`, atomically. */
export const replaceCollection = (
  collection: string,
  records: RecordWrite[],
): Promise<void> =>
  serializeWrite(() =>
    writeBatch([
      {
        sql: "DELETE FROM kv_records WHERE collection = ?",
        rows: [[collection]],
      },
      upsertsOf(collection, records),
    ]),
  );

export const deleteRecord = (collection: string, id: string): Promise<void> =>
  serializeWrite(async () => {
    db.runSync("DELETE FROM kv_records WHERE collection = ? AND id = ?", [
      collection,
      id,
    ]);
  });

export const deleteRecords = (
  collection: string,
  ids: string[],
): Promise<void> =>
  serializeWrite(async () => {
    if (ids.length === 0) return;
    const placeholders = ids.map(() => "?").join(", ");
    db.runSync(
      `DELETE FROM kv_records WHERE collection = ? AND id IN (${placeholders})`,
      [collection, ...ids],
    );
  });

/**
 * Moves every row of `from` into `to`, for the one-time migration of rows
 * written before record collections were namespaced per user.
 */
export const renameCollection = (from: string, to: string): Promise<void> =>
  serializeWrite(async () => {
    db.runSync(
      "UPDATE OR REPLACE kv_records SET collection = ? WHERE collection = ?",
      [to, from],
    );
  });

/**
 * Every row belonging to one account, in both tables. `getUserKey` and
 * `createRecordStore` both namespace with the same `_user_<id>` suffix, so this
 * is what "delete my data" has to reach. Removing the known STORAGE_KEYS alone
 * leaves every tracking record (weight, macros, photos, notes) on the device.
 *
 * Matched with substr rather than LIKE so a `%` or `_` in the user id needs no
 * escaping.
 */
export const clearUserData = (userId: string): Promise<void> =>
  serializeWrite(async () => {
    syncCache.clear();
    const suffix = `_user_${userId}`;
    db.runSync("DELETE FROM kv_store WHERE substr(key, -length(?)) = ?", [
      suffix,
      suffix,
    ]);
    db.runSync(
      "DELETE FROM kv_records WHERE substr(collection, -length(?)) = ?",
      [suffix, suffix],
    );
  });

/**
 * Re-keys every row namespaced to `fromUserId` onto `toUserId`, in both tables.
 * On a collision the `from` row is kept: it holds the user's real history, while
 * the `to` row can only be a default written moments ago under the new id.
 */
export const renameUserData = (
  fromUserId: string,
  toUserId: string,
): Promise<void> =>
  serializeWrite(async () => {
    syncCache.clear();
    const from = `_user_${fromUserId}`;
    const to = `_user_${toUserId}`;
    db.withTransactionSync(() => {
      db.runSync(
        "UPDATE OR REPLACE kv_store SET key = substr(key, 1, length(key) - length(?)) || ? WHERE substr(key, -length(?)) = ?",
        [from, to, from, from],
      );
      db.runSync(
        "UPDATE OR REPLACE kv_records SET collection = substr(collection, 1, length(collection) - length(?)) || ? WHERE substr(collection, -length(?)) = ?",
        [from, to, from, from],
      );
    });
  });

export const clearCollection =(collection: string): Promise<void> =>
  serializeWrite(async () => {
    db.runSync("DELETE FROM kv_records WHERE collection = ?", [collection]);
  });
