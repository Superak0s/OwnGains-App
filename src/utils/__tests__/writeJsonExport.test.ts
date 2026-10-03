jest.mock("expo-file-system/legacy", () => ({
  __esModule: true,
  cacheDirectory: "file:///cache/",
  documentDirectory: "file:///docs/",
  EncodingType: { UTF8: "utf8", Base64: "base64" },
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  readDirectoryAsync: jest.fn(async () => []),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(async () => "content://Downloads/plan.json"),
  },
}));

jest.mock("expo-sharing", () => ({
  __esModule: true,
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => {}),
}));

import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import {
  sweepStaleExports,
  writeBinaryExport,
  writeJsonExport,
} from "@utils/writeJsonExport";

const requestDirectory = FileSystem.StorageAccessFramework
  .requestDirectoryPermissionsAsync as jest.Mock;
const createFile = FileSystem.StorageAccessFramework.createFileAsync as jest.Mock;
const writeString = FileSystem.writeAsStringAsync as jest.Mock;
const isSharingAvailable = Sharing.isAvailableAsync as jest.Mock;
const share = Sharing.shareAsync as jest.Mock;

const originalOS = Platform.OS;
const setPlatform = (os: string) =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
  requestDirectory.mockResolvedValue({
    granted: true,
    directoryUri: "content://Downloads",
  });
  createFile.mockResolvedValue("content://Downloads/plan.json");
  isSharingAvailable.mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  setPlatform(originalOS);
});

it("writes into the folder the user picked on Android", async () => {
  setPlatform("android");
  const result = await writeJsonExport("plan", { days: 3 });

  expect(result).toEqual({
    uri: "content://Downloads/plan.json",
    fileName: `plan-${Date.now()}.json`,
    destination: "folder",
  });
  expect(createFile).toHaveBeenCalledWith(
    "content://Downloads",
    `plan-${Date.now()}.json`,
    "application/json",
  );
  expect(writeString).toHaveBeenCalledWith(
    "content://Downloads/plan.json",
    JSON.stringify({ days: 3 }, null, 2),
    { encoding: "utf8" },
  );
  expect(share).not.toHaveBeenCalled();
});

it("falls back to the share sheet when the folder picker is declined", async () => {
  setPlatform("android");
  requestDirectory.mockResolvedValue({ granted: false });

  const result = await writeJsonExport("plan", { days: 3 });

  expect(result).toEqual({
    uri: `file:///cache/plan-${Date.now()}.json`,
    fileName: `plan-${Date.now()}.json`,
    destination: "shared",
  });
  expect(createFile).not.toHaveBeenCalled();
  expect(share).toHaveBeenCalledWith(result.uri, {
    mimeType: "application/json",
    dialogTitle: "Save your export",
  });
});

it("goes straight to the share sheet off Android", async () => {
  setPlatform("ios");
  const result = await writeJsonExport("account", { a: 1 });

  expect(result.uri).toBe(`file:///cache/account-${Date.now()}.json`);
  expect(result.destination).toBe("shared");
  expect(requestDirectory).not.toHaveBeenCalled();
  expect(share).toHaveBeenCalled();
});

it("keeps the file outside the cache when sharing is unavailable", async () => {
  setPlatform("ios");
  isSharingAvailable.mockResolvedValue(false);

  const result = await writeJsonExport("account", { a: 1 });

  expect(result.uri).toBe(`file:///docs/account-${Date.now()}.json`);
  expect(result.destination).toBe("device");
  expect(share).not.toHaveBeenCalled();
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    `file:///cache/account-${Date.now()}.json`,
    { idempotent: true },
  );
});

it("writes a binary export as base64 with its own extension and type", async () => {
  setPlatform("ios");
  const mimeType =
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  const result = await writeBinaryExport("program", "xlsx", "UEsDBA==", mimeType);

  expect(result.uri).toBe(`file:///cache/program-${Date.now()}.xlsx`);
  expect(writeString).toHaveBeenCalledWith(result.uri, "UEsDBA==", {
    encoding: "base64",
  });
  expect(share).toHaveBeenCalledWith(result.uri, {
    mimeType,
    dialogTitle: "Save your export",
  });
});

it("clears exports left in the cache by an earlier session", async () => {
  (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([
    "owngains-account-export-1700000000000.json",
    "workout-program-1700000000000.xlsx",
    "ImagePicker",
    "notes.json",
  ]);

  await sweepStaleExports();

  expect(FileSystem.deleteAsync).toHaveBeenCalledTimes(2);
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    "file:///cache/owngains-account-export-1700000000000.json",
    { idempotent: true },
  );
  expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
    "file:///cache/workout-program-1700000000000.xlsx",
    { idempotent: true },
  );
});
