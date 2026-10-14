import * as FileSystem from "expo-file-system/legacy";
import { profilePhotoApi } from "@features/auth/services";
import { loadFriendPhoto } from "../friendPhoto";

jest.mock("@features/auth/services", () => ({
  profilePhotoApi: { downloadFor: jest.fn(async () => true) },
}));

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: jest.fn(async () => ({ exists: false })),
  makeDirectoryAsync: jest.fn(async () => {}),
}));

const downloadFor = profilePhotoApi.downloadFor as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe("loadFriendPhoto", () => {
  it("downloads once per hash and again when the hash changes", async () => {
    const [a, b] = await Promise.all([
      loadFriendPhoto("u1", "h1"),
      loadFriendPhoto("u1", "h1"),
    ]);
    expect(a).toBe("file:///cache/friend-photos/u1-h1.jpg");
    expect(b).toBe(a);
    expect(await loadFriendPhoto("u1", "h2")).toBe(
      "file:///cache/friend-photos/u1-h2.jpg",
    );
    expect(downloadFor).toHaveBeenCalledTimes(2);
  });

  it("skips the request for a friend with no photo, or one already on disk", async () => {
    expect(await loadFriendPhoto("u2", null)).toBeNull();
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true });
    expect(await loadFriendPhoto("u2", "h3")).toBe("file:///cache/friend-photos/u2-h3.jpg");
    expect(downloadFor).not.toHaveBeenCalled();
  });

  it("retries after a failed download", async () => {
    downloadFor.mockRejectedValueOnce(new Error("offline"));
    expect(await loadFriendPhoto("u3", "h4")).toBeNull();
    expect(await loadFriendPhoto("u3", "h4")).not.toBeNull();
  });
});
