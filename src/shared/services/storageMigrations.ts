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

/** Puts `order`'s types first and in that order, adding any the layout lacks.
 * Other widgets keep their relative order after them. */
export const orderWidgetTypes = (
  json: string,
  order: readonly { type: string; size: string }[],
): string => {
  let layout: unknown;
  try {
    layout = JSON.parse(appendWidgetTypes(json, order));
  } catch {
    return json;
  }
  if (!Array.isArray(layout)) return json;
  const rank = (type: string) => {
    const i = order.findIndex((o) => o.type === type);
    return i === -1 ? order.length : i;
  };
  return JSON.stringify(
    [...(layout as StoredWidget[])]
      .sort((a, b) => rank(a.type) - rank(b.type) || a.order - b.order)
      .map((widget, i) => ({ ...widget, order: i })),
  );
};

/** Adds `addition` just before the first `before` widget, or at the end when
 * that isn't on the board. A layout that already has it is unchanged. */
export const insertWidgetTypeBefore = (
  json: string,
  addition: { type: string; size: string },
  before: string,
): string => {
  const appended = appendWidgetTypes(json, [addition]);
  if (appended === json) return json;
  const widgets = (JSON.parse(appended) as StoredWidget[]).sort(
    (a, b) => a.order - b.order,
  );
  const added = widgets.pop()!;
  const at = widgets.findIndex((w) => w.type === before);
  widgets.splice(at === -1 ? widgets.length : at, 0, added);
  return JSON.stringify(widgets.map((widget, order) => ({ ...widget, order })));
};
