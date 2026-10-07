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

const readSchemaVersion = (db: MigrationDb): number =>
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

interface StoredWidget {
  type: string;
  order: number;
}

/**
 * Rewrites a saved widget layout so retired widget types become the widget
 * that replaced them. A replacement already on the board is not added twice.
 * Anything that isn't a layout is returned unchanged.
 */
export const mergeWidgetTypes = (
  json: string,
  replacements: Readonly<Record<string, string | null>>,
): string => {
  let layout: unknown;
  try {
    layout = JSON.parse(json);
  } catch {
    return json;
  }
  if (!Array.isArray(layout)) return json;
  const widgets = layout as StoredWidget[];
  if (!widgets.some((w) => w.type in replacements)) return json;

  const placed = new Set(
    widgets.filter((w) => !(w.type in replacements)).map((w) => w.type),
  );
  const next = [...widgets]
    .sort((a, b) => a.order - b.order)
    .flatMap((widget) => {
      if (!(widget.type in replacements)) return [widget];
      const type = replacements[widget.type];
      if (!type || placed.has(type)) return [];
      placed.add(type);
      return [{ ...widget, type }];
    })
    .map((widget, order) => ({ ...widget, order }));
  return JSON.stringify(next);
};

/** Appends widgets a saved layout doesn't have yet, so new features reach
 * boards that were customised before they existed. */
export const appendWidgetTypes = (
  json: string,
  additions: readonly { type: string; size: string }[],
  atStart = false,
): string => {
  let layout: unknown;
  try {
    layout = JSON.parse(json);
  } catch {
    return json;
  }
  if (!Array.isArray(layout)) return json;
  const widgets = layout as StoredWidget[];
  const missing = additions.filter(
    ({ type }) => !widgets.some((w) => w.type === type),
  );
  if (missing.length === 0) return json;
  const added = missing.map(({ type, size }) => ({
    id: `migrated-${type.replaceAll("_", "-")}`,
    type,
    size,
  }));
  const existing = [...widgets].sort((a, b) => a.order - b.order);
  return JSON.stringify(
    (atStart ? [...added, ...existing] : [...existing, ...added]).map(
      (widget, order) => ({ ...widget, order }),
    ),
  );
};
