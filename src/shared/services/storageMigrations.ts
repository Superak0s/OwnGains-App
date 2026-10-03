export interface MigrationDb {
  getFirstSync<T>(sql: string): T | null;
  execSync(sql: string): void;
  withTransactionSync(task: () => void): void;
}

/** Entry `i` upgrades the schema from version `i` to `i + 1`. Append only. */
export type Migration = () => void;

// Migrations run at module load, before crash reporting exists or the user has
// answered the consent screen, so a failure waits here to be reported later.
let pendingFailure: { step: number; error: unknown } | null = null;

export const takeMigrationFailure = (): {
  step: number;
  error: unknown;
} | null => {
  const failure = pendingFailure;
  pendingFailure = null;
  return failure;
};

export const readSchemaVersion = (db: MigrationDb): number =>
  db.getFirstSync<{ user_version: number }>("PRAGMA user_version")
    ?.user_version ?? 0;

/**
 * Runs every migration past the stored version, each in its own transaction
 * together with the version bump, so a failure rolls back cleanly and the next
 * launch retries from the same step. Returns the final version.
 */
export const runMigrations = (
  db: MigrationDb,
  migrations: readonly Migration[],
  startVersion = readSchemaVersion(db),
): number => {
  let version = startVersion;
  while (version < migrations.length) {
    const next = version + 1;
    try {
      db.withTransactionSync(() => {
        migrations[version]();
        db.execSync(`PRAGMA user_version = ${next}`);
      });
    } catch (error) {
      console.warn(`Storage migration ${next} failed`, error);
      pendingFailure = { step: next, error };
      break;
    }
    version = next;
  }
  return version;
};
