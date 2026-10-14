import { useEffect, useState } from "react";
import * as FileSystem from "expo-file-system/legacy";
import { profilePhotoApi } from "@features/auth/services";

const loads = new Map<string, Promise<string | null>>();

/**
 * A friend's photo as a local file, downloaded once per `hash`. Without a hash
 * (a caller that doesn't have one) it is downloaded once per app run. A `null`
 * hash means the friend has no photo.
 */
export function loadFriendPhoto(
  userId: string,
  hash?: string | null,
): Promise<string | null> {
  if (hash === null) return Promise.resolve(null);
  const key = `${userId}:${hash ?? "run"}`;
  const pending = loads.get(key);
  if (pending) return pending;

  // ponytail: replaced photos stay in the cache folder until the OS clears it. Delete by userId prefix if that grows.
  const dir = `${FileSystem.cacheDirectory}friend-photos/`;
  const dest = `${dir}${encodeURIComponent(userId)}-${hash ?? Date.now()}.jpg`;
  const load = (async () => {
    if (hash && (await FileSystem.getInfoAsync(dest)).exists) return dest;
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
      () => {},
    );
    return (await profilePhotoApi.downloadFor(userId, dest)) ? dest : null;
  })().catch(() => {
    loads.delete(key);
    return null;
  });
  loads.set(key, load);
  return load;
}

export function useFriendPhoto(
  userId: string | number | null | undefined,
  hash?: string | null,
): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    setUri(null);
    if (userId == null) return;
    let live = true;
    void loadFriendPhoto(String(userId), hash).then((u) => {
      if (live) setUri(u);
    });
    return () => {
      live = false;
    };
  }, [userId, hash]);
  return uri;
}
