import * as FileSystem from "expo-file-system/legacy";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "@shared/services/sqliteStorage";

const avatarDir = (): string => `${FileSystem.documentDirectory}profile/`;

export async function saveProfileAvatar(
  key: string,
  uri: string | null,
): Promise<void> {
  const previous = await getStorageItem(key);
  if (uri) await setStorageItem(key, uri);
  else await removeStorageItem(key);
  if (previous && previous !== uri && previous.startsWith(avatarDir())) {
    await FileSystem.deleteAsync(previous, { idempotent: true }).catch(
      () => {},
    );
  }
}

/** Fetches the server's copy into the avatar folder, for a device that has none yet. */
export async function restoreProfileAvatar(
  key: string,
  download: (destUri: string) => Promise<boolean>,
): Promise<string | null> {
  await FileSystem.makeDirectoryAsync(avatarDir(), {
    intermediates: true,
  }).catch(() => {});
  const dest = `${avatarDir()}avatar-${Date.now()}.jpg`;
  if (!(await download(dest))) return null;
  await saveProfileAvatar(key, dest);
  return dest;
}

// Offline migration copies the URI, not the file, so another profile may have
// deleted the file this key still points at.
export async function loadProfileAvatar(key: string): Promise<string | null> {
  const uri = await getStorageItem(key);
  if (!uri) return null;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? uri : null;
  } catch {
    return uri;
  }
}
