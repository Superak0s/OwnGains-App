import * as FileSystem from "expo-file-system/legacy";
import {
  clearUserData,
  exportAll,
  importAll,
  type ImportMode,
  type StorageSnapshot,
} from "@shared/services/sqliteStorage";

const PHOTOS_DIR = `${FileSystem.documentDirectory}progress-photos/`;

export const BACKUP_FORMAT = "owngains-backup";
export const BACKUP_VERSION = 1;

export interface DeviceBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  kv: StorageSnapshot["kv"];
  records: StorageSnapshot["records"];
  /** Progress photo file name -> base64 contents. */
  photos: Record<string, string>;
  /** Photos left out because the backup hit its size budget. */
  photosOmitted?: number;
  /** Whose data this is, absent in backups made before exports were per user. */
  userId?: string;
  profile?: unknown;
  server?: unknown;
}

// Photo URIs are stored absolute, and the sandbox path they embed changes
// between installs and devices, so a restored URI has to be re-pointed at this
// install's photo directory or every image silently renders blank.
const PHOTO_URI_PATTERN = /file:\/\/[^"]*?progress-photos\//g;

/**
 * A backup is one in-memory JSON string that is then stringified and possibly
 * encrypted, so every photo byte is stored several times over. Newest photos come first
 * the budget and the rest are counted, so the export is bounded without ever
 * dropping anything silently.
 *
 * ponytail: a flat byte cap, not a real streaming writer. Raise it or move to
 * a zip/sidecar if users start losing photos from their backups.
 */
const PHOTO_BUDGET_BYTES = 32 * 1024 * 1024;

const readPhotos = async (
  only?: Set<string>,
): Promise<{
  photos: Record<string, string>;
  omitted: number;
}> => {
  const names = (
    await FileSystem.readDirectoryAsync(PHOTOS_DIR).catch(() => [] as string[])
  ).filter((name) => !only || only.has(name));
  const entries = await Promise.all(
    names.map(async (name) => {
      const info = await FileSystem.getInfoAsync(`${PHOTOS_DIR}${name}`).catch(
        () => null,
      );
      const stat = info?.exists ? info : null;
      return {
        name,
        size: stat?.size ?? 0,
        modifiedAt: stat?.modificationTime ?? 0,
      };
    }),
  );
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt);

  const photos: Record<string, string> = {};
  let used = 0;
  let omitted = 0;
  for (const { name, size } of entries) {
    const base64Bytes = Math.ceil(size / 3) * 4;
    if (used + base64Bytes > PHOTO_BUDGET_BYTES) {
      omitted += 1;
      continue;
    }
    photos[name] = await FileSystem.readAsStringAsync(`${PHOTOS_DIR}${name}`, {
      encoding: FileSystem.EncodingType.Base64,
    });
    used += base64Bytes;
  }
  return { photos, omitted };
};

const writePhotos = async (photos: Record<string, string>): Promise<void> => {
  if (Object.keys(photos).length === 0) return;
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, {
    intermediates: true,
  }).catch(() => undefined);
  for (const [name, base64] of Object.entries(photos)) {
    await FileSystem.writeAsStringAsync(`${PHOTOS_DIR}${name}`, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
};

const PHOTO_FILE_PATTERN = /progress-photos\/([^"\/]+)/g;

const photoNamesIn = ({ kv, records }: StorageSnapshot): Set<string> =>
  new Set(
    [
      ...Object.values(kv),
      ...Object.values(records).flatMap((rows) => rows.map((row) => row.value)),
    ].flatMap((value) =>
      [...value.matchAll(PHOTO_FILE_PATTERN)].map((match) => match[1]),
    ),
  );

/**
 * One user's rows, plus the device-wide keys that belong to no user. Other
 * profiles on the same device are left out.
 */
const snapshotFor = (
  { kv, records }: StorageSnapshot,
  userId: string,
): StorageSnapshot => {
  const suffix = `_user_${userId}`;
  const own = (key: string) => key.endsWith(suffix) || !key.includes("_user_");
  return {
    kv: Object.fromEntries(Object.entries(kv).filter(([key]) => own(key))),
    records: Object.fromEntries(
      Object.entries(records).filter(([collection]) => own(collection)),
    ),
  };
};

/**
 * Progress photos live on disk, not in SQLite, so wiping the tables misses them.
 * The photo folder is shared by every profile on the device, so only files that
 * this user's rows point at are removed. Must run before those rows are cleared.
 */
export const deletePhotoFilesFor = async (userId: string): Promise<void> => {
  const suffix = `_user_${userId}`;
  const { kv, records } = await exportAll();
  const names = photoNamesIn({
    kv: Object.fromEntries(
      Object.entries(kv).filter(([key]) => key.endsWith(suffix)),
    ),
    records: Object.fromEntries(
      Object.entries(records).filter(([c]) => c.endsWith(suffix)),
    ),
  });
  await Promise.all(
    [...names].map((name) =>
      FileSystem.deleteAsync(`${PHOTOS_DIR}${name}`, { idempotent: true }).catch(
        () => undefined,
      ),
    ),
  );
};

export const repointPhotoUris = (value: string): string =>
  value.replace(PHOTO_URI_PATTERN, PHOTOS_DIR);

const DEVICE_SCOPED_KEYS = new Set([
  "@server_url",
  "appMode",
  "@onboarding_complete",
  "app_theme_v1",
]);

const repointSnapshot = (backup: DeviceBackup): StorageSnapshot => ({
  kv: Object.fromEntries(
    Object.entries(backup.kv ?? {})
      .filter(([k]) => !DEVICE_SCOPED_KEYS.has(k))
      .map(([k, v]) => [k, repointPhotoUris(v)]),
  ),
  records: Object.fromEntries(
    Object.entries(backup.records ?? {})
      // G4: a hand-edited backup can hold a non-array here, and .map would throw
      // partway through the restore.
      .filter((entry): entry is [string, StorageSnapshot["records"][string]] =>
        Array.isArray(entry[1]),
      )
      .map(([collection, rows]) => [
        collection,
        rows.map((row) => ({ ...row, value: repointPhotoUris(row.value) })),
      ]),
  ),
});

/**
 * One user's data on this device: their rows in both storage tables plus the
 * progress photo files those rows point at, which live on disk rather than in
 * SQLite. Filtering by the user suffix rather than naming each feature's keys
 * means a feature added later is included automatically. Auth tokens live
 * in expo-secure-store and are deliberately excluded. A backup file is not a
 * place to store credentials, and a restore re-authenticates anyway.
 *
 * Photos are inlined as base64 and so are capped by PHOTO_BUDGET_BYTES.
 */
export const buildDeviceBackup = async (
  userId: string,
  extra: { profile?: unknown; server?: unknown } = {},
): Promise<DeviceBackup> => {
  const { kv, records } = snapshotFor(await exportAll(), userId);
  const { photos, omitted } = await readPhotos(photoNamesIn({ kv, records }));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    kv,
    records,
    photos,
    ...(omitted > 0 && { photosOmitted: omitted }),
    ...extra,
  };
};

export const isDeviceBackup = (value: unknown): value is DeviceBackup =>
  typeof value === "object" &&
  value !== null &&
  (value as DeviceBackup).format === BACKUP_FORMAT &&
  typeof (value as DeviceBackup).kv === "object";

/** Resolves the number of photos the backup was exported without, if any. */
export const restoreDeviceBackup = async (
  backup: DeviceBackup,
  mode: ImportMode = "replace",
): Promise<{ photosOmitted: number }> => {
  if (backup.version > BACKUP_VERSION) {
    throw new Error(
      "This backup was made by a newer version of OwnGains. Update the app and try again.",
    );
  }
  await writePhotos(backup.photos ?? {});
  // A per-user backup replaces only that user's rows, never other profiles'.
  if (mode === "replace" && typeof backup.userId === "string") {
    await clearUserData(backup.userId);
    await importAll(repointSnapshot(backup), "merge");
  } else {
    await importAll(repointSnapshot(backup), mode);
  }
  return { photosOmitted: backup.photosOmitted ?? 0 };
};
