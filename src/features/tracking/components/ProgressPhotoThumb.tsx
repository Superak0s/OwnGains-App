import { useState } from "react";
import type { StyleProp } from "react-native";
import { Image, type ImageStyle } from "expo-image";
import type { ProgressPhotoMuscle } from "../types/muscleRecovery";

type PhotoSource = {
  uri: string | undefined;
  headers: Record<string, string> | undefined;
};

// expo-image treats a new `source` object as a new image to resolve, so a fresh
// literal per render re-runs the loader for a picture that never changed.
const photoSourceCache = new Map<string, PhotoSource>();
let cachedForToken: string | null = null;

function photoSource(uri: string | undefined, authToken: string): PhotoSource {
  // The silent refresh swaps the token roughly hourly. The old entries are dead
  // weight once it does.
  if (cachedForToken !== authToken) {
    photoSourceCache.clear();
    cachedForToken = authToken;
  }
  const key = uri ?? "";
  let source = photoSourceCache.get(key);
  if (!source) {
    source = {
      uri,
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
    };
    photoSourceCache.set(key, source);
  }
  return source;
}

/** Tiles show the 400 px thumbnail, falling back to the full photo if it fails to load. */
export function ProgressPhotoThumb({
  photo,
  authToken,
  style,
}: {
  readonly photo: ProgressPhotoMuscle;
  readonly authToken: string;
  readonly style: StyleProp<ImageStyle>;
}) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const useThumb = !!photo.thumbUri && !thumbFailed;
  return (
    <Image
      source={photoSource(useThumb ? photo.thumbUri : photo.uri, authToken)}
      style={style}
      contentFit='cover'
      recyclingKey={String(photo.id)}
      onError={useThumb ? () => setThumbFailed(true) : undefined}
    />
  );
}
