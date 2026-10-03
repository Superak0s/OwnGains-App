jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

const mockCopy = jest.fn(async (_: { from: string; to: string }) => {});
const mockDelete = jest.fn(async (_uri: string, _opts?: unknown) => {});
jest.mock("expo-file-system/legacy", () => ({
  documentDirectory: "file:///docs/",
  makeDirectoryAsync: jest.fn(async () => {}),
  copyAsync: (args: { from: string; to: string }) => mockCopy(args),
  deleteAsync: (uri: string, opts?: unknown) => mockDelete(uri, opts),
}));

const mockCompress = jest.fn(async (_uri: string) => "file:///cache/full.jpg");
const mockMakeThumbnail = jest.fn(async (_uri: string): Promise<string | null> => "file:///cache/thumb.jpg");
jest.mock("@utils/compressImage", () => ({
  compressImageForUpload: (uri: string) => mockCompress(uri),
  makeThumbnail: (uri: string) => mockMakeThumbnail(uri),
}));

import type { progressPhotoApi as ProgressPhotoApi } from "../progressPhoto";

let progressPhotoApi: typeof ProgressPhotoApi;

beforeEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  require("test-utils/memorySqlite").resetMemorySqlite();
  progressPhotoApi = require("../progressPhoto").progressPhotoApi;
});

const upload = () =>
  progressPhotoApi.uploadPhoto({ uri: "file:///camera/raw.jpg", muscleGroups: ["chest_upper"] });

describe("offline progressPhotoApi", () => {
  it("stores a thumbnail beside the photo", async () => {
    const { data } = await upload();

    expect(data?.uri).toBe(`file:///docs/progress-photos/${data?.id}.jpg`);
    expect(data?.thumbUri).toBe(`file:///docs/progress-photos/${data?.id}_thumb.jpg`);
    expect(mockCopy).toHaveBeenCalledWith({
      from: "file:///cache/thumb.jpg",
      to: data?.thumbUri,
    });
  });

  it("still saves the photo when the thumbnail can't be made", async () => {
    mockMakeThumbnail.mockResolvedValueOnce(null);

    const { data } = await upload();

    expect(data?.thumbUri).toBeUndefined();
    expect((await progressPhotoApi.getAllPhotos()).data).toHaveLength(1);
  });

  it("still saves the photo when copying the thumbnail fails", async () => {
    mockCopy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("disk full"));

    const { data } = await upload();

    expect(data?.thumbUri).toBeUndefined();
  });

  it("removes the manipulator's cache files once they are copied", async () => {
    await upload();

    const deleted = mockDelete.mock.calls.map(([uri]) => uri);
    expect(deleted).toEqual(["file:///cache/thumb.jpg", "file:///cache/full.jpg"]);
  });

  it("never deletes the picked original when compression fell back to it", async () => {
    mockCompress.mockImplementationOnce(async (uri) => uri);
    mockMakeThumbnail.mockResolvedValueOnce(null);

    await upload();

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("deletes the thumbnail with the photo", async () => {
    const { data } = await upload();
    mockDelete.mockClear();

    await progressPhotoApi.deletePhoto(data!.id);

    const deleted = mockDelete.mock.calls.map(([uri]) => uri);
    expect(deleted).toEqual([data?.uri, data?.thumbUri]);
    expect((await progressPhotoApi.getAllPhotos()).data).toEqual([]);
  });

  it("pages through every photo, including ones that share a timestamp", async () => {
    for (const takenAt of ["2024-01-03", "2024-01-02", "2024-01-02", "2024-01-02", "2024-01-01"]) {
      await progressPhotoApi.uploadPhoto({ uri: "file:///camera/raw.jpg", muscleGroups: [], takenAt });
    }

    const seen: string[] = [];
    let page = await progressPhotoApi.getPhotoPage(null, 2);
    seen.push(...page.data.map((p) => String(p.id)));
    while (page.nextCursor) {
      page = await progressPhotoApi.getPhotoPage(page.nextCursor, 2);
      seen.push(...page.data.map((p) => String(p.id)));
    }

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
  });

  it("ends the list on a short page", async () => {
    await upload();
    const page = await progressPhotoApi.getPhotoPage(null, 2);
    expect(page.data).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
