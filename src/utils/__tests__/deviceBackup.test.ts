const files: Record<string, string> = {};
// Real photo sizes, so a budget test doesn't have to allocate megabytes.
const stats: Record<string, { size: number; modificationTime: number }> = {};

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///data/user/0/com.owngains.app/files/",
  EncodingType: { Base64: "base64", UTF8: "utf8" },
  readDirectoryAsync: jest.fn(async (dir: string) =>
    Object.keys(files)
      .filter((p) => p.startsWith(dir))
      .map((p) => p.slice(dir.length)),
  ),
  readAsStringAsync: jest.fn(async (path: string) => files[path]!),
  getInfoAsync: jest.fn(async (path: string) => ({
    exists: files[path] !== undefined,
    size: stats[path]?.size ?? files[path]?.length ?? 0,
    modificationTime: stats[path]?.modificationTime ?? 0,
  })),
  writeAsStringAsync: jest.fn(async (path: string, data: string) => {
    files[path] = data;
  }),
  makeDirectoryAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async (path: string) => {
    delete files[path];
  }),
}));

type Snapshot = {
  kv: Record<string, string>;
  records: Record<string, Array<{ id: string; sortKey: string; value: string }>>;
};

const store: { snapshot: Snapshot } = { snapshot: { kv: {}, records: {} } };

jest.mock("@shared/services/sqliteStorage", () => ({
  exportAll: jest.fn(async () => store.snapshot),
  clearUserData: jest.fn(async (userId: string) => {
    const keep = ([key]: [string, unknown]) => !key.endsWith(`_user_${userId}`);
    store.snapshot = {
      kv: Object.fromEntries(Object.entries(store.snapshot.kv).filter(keep)),
      records: Object.fromEntries(
        Object.entries(store.snapshot.records).filter(keep),
      ),
    };
  }),
  importAll: jest.fn(async (s: Snapshot, mode = "replace") => {
    if (mode === "replace") {
      store.snapshot = s;
      return;
    }
    const records = { ...store.snapshot.records };
    for (const [collection, rows] of Object.entries(s.records ?? {})) {
      const byId = new Map(
        (records[collection] ?? []).map((row) => [row.id, row]),
      );
      for (const row of rows) byId.set(row.id, row);
      records[collection] = [...byId.values()];
    }
    store.snapshot = { kv: { ...store.snapshot.kv, ...s.kv }, records };
  }),
}));

import {
  buildDeviceBackup,
  deletePhotoFilesFor,
  isDeviceBackup,
  repointPhotoUris,
  restoreDeviceBackup,
  type DeviceBackup,
} from "../deviceBackup";

const PHOTOS_DIR = "file:///data/user/0/com.owngains.app/files/progress-photos/";

beforeEach(() => {
  for (const key of Object.keys(files)) delete files[key];
  for (const key of Object.keys(stats)) delete stats[key];
  store.snapshot = { kv: {}, records: {} };
});

describe("deviceBackup", () => {
  it("round-trips storage rows and photo files", async () => {
    const photoUri = `{"uri":"${PHOTOS_DIR}abc.jpg"}`;
    store.snapshot = {
      kv: { "@user": '{"id":"local"}' },
      records: {
        sessions_user_local: [
          { id: "s1", sortKey: "2026-01-01", value: photoUri },
        ],
      },
    };
    files[`${PHOTOS_DIR}abc.jpg`] = "BASE64DATA";

    const backup = await buildDeviceBackup("local");
    expect(backup.photos).toEqual({ "abc.jpg": "BASE64DATA" });

    // Wipe the device, then restore into it.
    store.snapshot = { kv: {}, records: {} };
    delete files[`${PHOTOS_DIR}abc.jpg`];

    await restoreDeviceBackup(backup);

    expect(store.snapshot).toEqual({
      kv: { "@user": '{"id":"local"}' },
      records: {
        sessions_user_local: [
          { id: "s1", sortKey: "2026-01-01", value: photoUri },
        ],
      },
    });
    expect(files[`${PHOTOS_DIR}abc.jpg`]).toBe("BASE64DATA");
  });

  it("exports only this user's rows and photos, and restores without touching others", async () => {
    const other = {
      notes_user_2: [
        { id: "n", sortKey: "1", value: `{"uri":"${PHOTOS_DIR}theirs.jpg"}` },
      ],
    };
    store.snapshot = {
      kv: { app_theme_v1: "dark", goal_user_1: "3000", goal_user_2: "2000" },
      records: {
        notes_user_1: [
          { id: "m", sortKey: "1", value: `{"uri":"${PHOTOS_DIR}mine.jpg"}` },
        ],
        ...other,
      },
    };
    files[`${PHOTOS_DIR}mine.jpg`] = "a";
    files[`${PHOTOS_DIR}theirs.jpg`] = "b";

    const backup = await buildDeviceBackup("1");
    expect(backup.kv).toEqual({ app_theme_v1: "dark", goal_user_1: "3000" });
    expect(Object.keys(backup.records)).toEqual(["notes_user_1"]);
    expect(backup.photos).toEqual({ "mine.jpg": "a" });

    store.snapshot.kv.goal_user_1 = "changed";
    await restoreDeviceBackup(backup, "replace");
    expect(store.snapshot.kv.goal_user_1).toBe("3000");
    expect(store.snapshot.kv.goal_user_2).toBe("2000");
    expect(store.snapshot.records.notes_user_2).toEqual(other.notes_user_2);
  });

  it("keeps the newest photos within the size budget and reports the rest", async () => {
    const mb = 1024 * 1024;
    const photo = (name: string, size: number, modificationTime: number) => {
      files[`${PHOTOS_DIR}${name}`] = name;
      stats[`${PHOTOS_DIR}${name}`] = { size, modificationTime };
    };
    photo("old.jpg", 20 * mb, 100);
    photo("new.jpg", 20 * mb, 300);
    photo("tiny.jpg", mb, 200);
    store.snapshot.kv.photos_user_local = ["old", "new", "tiny"]
      .map((n) => `${PHOTOS_DIR}${n}.jpg"`)
      .join(",");

    const backup = await buildDeviceBackup("local");

    expect(Object.keys(backup.photos).sort()).toEqual(["new.jpg", "tiny.jpg"]);
    expect(backup.photosOmitted).toBe(1);
  });

  it("re-points photo URIs from a different install's sandbox", () => {
    const fromOtherDevice =
      '{"uri":"file:///data/user/0/com.owngains.app/files/progress-photos/x.jpg"}';
    const stale = fromOtherDevice.replace("/data/user/0", "/data/user/11");

    expect(repointPhotoUris(stale)).toBe(fromOtherDevice);
  });

  it("rewrites photo URIs inside restored records", async () => {
    const backup = await buildDeviceBackup("local");
    await restoreDeviceBackup({
      ...backup,
      kv: { photo: '{"uri":"file:///old/sandbox/progress-photos/y.jpg"}' },
      records: {
        photos: [
          {
            id: "p1",
            sortKey: "1",
            value: '{"uri":"file:///old/sandbox/progress-photos/z.jpg"}',
          },
        ],
      },
    });

    const restored = store.snapshot as {
      kv: Record<string, string>;
      records: Record<string, Array<{ value: string }>>;
    };
    expect(restored.kv.photo).toContain(PHOTOS_DIR);
    expect(restored.records.photos[0]!.value).toBe(
      `{"uri":"${PHOTOS_DIR}z.jpg"}`,
    );
  });

  it("merges onto existing data, or replaces it, as asked", async () => {
    const onDevice: Snapshot = {
      kv: { "@keep": "device" },
      records: { sessions: [{ id: "s1", sortKey: "1", value: "device" }] },
    };
    const backup: DeviceBackup = {
      format: "owngains-backup",
      version: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      kv: { "@added": "backup" },
      records: { sessions: [{ id: "s2", sortKey: "2", value: "backup" }] },
      photos: {},
    };

    store.snapshot = onDevice;
    await restoreDeviceBackup(backup, "merge");
    expect(store.snapshot.kv).toEqual({
      "@keep": "device",
      "@added": "backup",
    });
    expect(store.snapshot.records.sessions!.map((r) => r.id)).toEqual([
      "s1",
      "s2",
    ]);

    store.snapshot = onDevice;
    await restoreDeviceBackup(backup, "replace");
    expect(store.snapshot.kv).toEqual({ "@added": "backup" });
    expect(store.snapshot.records.sessions!.map((r) => r.id)).toEqual(["s2"]);
  });

  it("rejects a file that is not an OwnGains backup", () => {
    expect(isDeviceBackup({ kv: {}, records: {} })).toBe(false);
    expect(isDeviceBackup(null)).toBe(false);
  });

  it("refuses a backup from a newer app version", async () => {
    const backup = await buildDeviceBackup("local");
    await expect(
      restoreDeviceBackup({ ...backup, version: 99 }),
    ).rejects.toThrow(/newer version/);
  });
});

describe("deletePhotoFilesFor", () => {
  const photoRow = (id: string) => ({
    id,
    sortKey: "2026-01-01",
    value: JSON.stringify({ id, uri: `${PHOTOS_DIR}${id}.jpg` }),
  });

  beforeEach(() => {
    for (const key of Object.keys(files)) delete files[key];
    files[`${PHOTOS_DIR}mine.jpg`] = "a";
    files[`${PHOTOS_DIR}theirs.jpg`] = "b";
    store.snapshot = {
      kv: {},
      records: {
        progress_photos_muscle_user_1: [photoRow("mine")],
        progress_photos_muscle_user_2: [photoRow("theirs")],
      },
    };
  });

  it("removes only the files this user's records point at", async () => {
    await deletePhotoFilesFor("1");

    expect(files[`${PHOTOS_DIR}mine.jpg`]).toBeUndefined();
    expect(files[`${PHOTOS_DIR}theirs.jpg`]).toBe("b");
  });

  it("leaves a user whose id only ends with this one's alone", async () => {
    store.snapshot.records = {
      progress_photos_muscle_user_1: [photoRow("mine")],
      progress_photos_muscle_user_21: [photoRow("theirs")],
    };

    await deletePhotoFilesFor("1");

    expect(files[`${PHOTOS_DIR}theirs.jpg`]).toBe("b");
  });
});
