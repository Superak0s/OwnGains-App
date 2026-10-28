import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

/** Where the file actually ended up, so callers can report it accurately. */
export type ExportDestination = "folder" | "shared" | "device";

export const DESTINATION_TEXT: Record<ExportDestination, string> = {
  folder: "saved to the folder you picked",
  shared: "sent to the app you picked",
  device: "kept on this device, no folder or share target was available",
};

export interface ExportResult {
  uri: string;
  fileName: string;
  destination: ExportDestination;
}

interface ExportFile {
  fileName: string;
  contents: string;
  mimeType: string;
  encoding: FileSystem.EncodingType;
}

/**
 * Writes to a user-picked folder on Android. iOS has no writable public
 * Downloads directory, so it falls back to the share sheet.
 */
export async function writeJsonExport(
  namePrefix: string,
  payload: unknown,
): Promise<ExportResult> {
  return writeExportFile({
    fileName: `${namePrefix}-${Date.now()}.json`,
    contents: JSON.stringify(payload, null, 2),
    mimeType: "application/json",
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function writeBinaryExport(
  namePrefix: string,
  extension: string,
  base64: string,
  mimeType: string,
): Promise<ExportResult> {
  return writeExportFile({
    fileName: `${namePrefix}-${Date.now()}.${extension}`,
    contents: base64,
    mimeType,
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function writeTextExport(
  namePrefix: string,
  extension: string,
  text: string,
  mimeType: string,
): Promise<ExportResult> {
  return writeExportFile({
    fileName: `${namePrefix}-${Date.now()}.${extension}`,
    contents: text,
    mimeType,
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function writeExportFile(file: ExportFile): Promise<ExportResult> {
  const { fileName, contents, mimeType, encoding } = file;

  if (Platform.OS === "android") {
    const permissions =
      await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (permissions.granted) {
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        fileName,
        mimeType,
      );
      await FileSystem.writeAsStringAsync(fileUri, contents, { encoding });
      return { uri: fileUri, fileName, destination: "folder" };
    }
  }

  return writeAndShare(file);
}

async function writeAndShare(file: ExportFile): Promise<ExportResult> {
  const { fileName, contents, mimeType, encoding } = file;
  const tempUri = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(tempUri, contents, { encoding });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(tempUri, {
      mimeType,
      dialogTitle: "Save your export",
    });
    return { uri: tempUri, fileName, destination: "shared" };
  }

  // Nothing consumed the file, so the user was told it is kept. A cache entry
  // is not that, and it is also what sweepStaleExports clears on next launch.
  const keptUri = `${FileSystem.documentDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(keptUri, contents, { encoding });
  await FileSystem.deleteAsync(tempUri, { idempotent: true }).catch(
    () => undefined,
  );
  return { uri: keptUri, fileName, destination: "device" };
}

/**
 * A shared export leaves its copy in the cache, because a share target may still be
 * reading it when shareAsync resolves, so it is cleared on the next launch
 * rather than immediately. Without this it leaves account data readable to
 * anything with access to the sandbox, indefinitely.
 */
export async function sweepStaleExports(): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) return;
  const names = await FileSystem.readDirectoryAsync(dir).catch(
    () => [] as string[],
  );
  await Promise.all(
    names
      .filter((name) => /-\d+\.(json|xlsx|csv|png)$/.test(name))
      .map((name) =>
        FileSystem.deleteAsync(`${dir}${name}`, { idempotent: true }).catch(
          () => undefined,
        ),
      ),
  );
}
