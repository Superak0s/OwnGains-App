import { useEffect } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { GITHUB_BUILD } from "@shared/distribution";

let downloaded = false;

/** Downloads a newer JS bundle from the update server. It runs on the next cold start. */
export async function fetchOtaUpdate() {
  if (!Updates.isEnabled || downloaded) return;
  // The APK and AAB bundles differ (Ko-fi link), and native config sends "play", the channel safe for both.
  if (GITHUB_BUILD) Updates.setUpdateRequestHeadersOverride({ "expo-channel-name": "github" });
  const { isAvailable } = await Updates.checkForUpdateAsync();
  if (!isAvailable) return;
  await Updates.fetchUpdateAsync();
  downloaded = true;
}

export function useOtaUpdates() {
  useEffect(() => {
    const check = () => void fetchOtaUpdate().catch(() => {});
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, []);
}
