import * as FileSystem from "expo-file-system/legacy";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import {
  loadProfileAvatar,
  restoreProfileAvatar,
  saveProfileAvatar,
} from "../profileAvatar";

const kv: Record<string, string> = {};

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn(async (k: string) => kv[k] ?? null),
  setStorageItem: jest.fn(async (k: string, v: string) => {
    kv[k] = v;
  }),
  removeStorageItem: jest.fn(async (k: string) => {
    delete kv[k];
  }),
}));

jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  deleteAsync: jest.fn(() => Promise.resolve()),
  getInfoAsync: jest.fn(() => Promise.resolve({ exists: true })),
  makeDirectoryAsync: jest.fn(() => Promise.resolve()),
}));

const KEY = "@profile_avatar_u1";
const OLD = "file:///docs/profile/avatar-1.jpg";

beforeEach(() => jest.clearAllMocks());

describe("saveProfileAvatar", () => {
  it("removes the stored reference and the photo file", async () => {
    await setStorageItem(KEY, OLD);
    await saveProfileAvatar(KEY, null);
    expect(await getStorageItem(KEY)).toBeNull();
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(OLD, {
      idempotent: true,
    });
  });

  it("deletes the replaced photo when a new one is saved", async () => {
    await setStorageItem(KEY, OLD);
    await saveProfileAvatar(KEY, "file:///docs/profile/avatar-2.jpg");
    expect(await getStorageItem(KEY)).toBe("file:///docs/profile/avatar-2.jpg");
    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(OLD, {
      idempotent: true,
    });
  });

  it("keeps the file when the photo is unchanged or outside the app folder", async () => {
    await setStorageItem(KEY, OLD);
    await saveProfileAvatar(KEY, OLD);
    await setStorageItem(KEY, "file:///cache/picked.jpg");
    await saveProfileAvatar(KEY, null);
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});

describe("loadProfileAvatar", () => {
  it("treats a reference to a deleted file as no photo", async () => {
    await setStorageItem(KEY, OLD);
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({
      exists: false,
    });
    expect(await loadProfileAvatar(KEY)).toBeNull();
  });
});

describe("restoreProfileAvatar", () => {
  it("stores nothing when the server has no photo", async () => {
    delete kv[KEY];
    expect(await restoreProfileAvatar(KEY, async () => false)).toBeNull();
    expect(await getStorageItem(KEY)).toBeNull();
  });

  it("saves the downloaded photo in the avatar folder", async () => {
    delete kv[KEY];
    const download = jest.fn(async () => true);
    const uri = await restoreProfileAvatar(KEY, download);
    expect(uri).toMatch(/^file:\/\/\/docs\/profile\/avatar-\d+\.jpg$/);
    expect(download).toHaveBeenCalledWith(uri);
    expect(await getStorageItem(KEY)).toBe(uri);
  });
});
