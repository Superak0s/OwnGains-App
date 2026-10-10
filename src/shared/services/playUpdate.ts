import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import SpInAppUpdates, { IAUUpdateKind } from "sp-react-native-in-app-updates";
import { GITHUB_BUILD } from "@shared/distribution";
import Constants from "expo-constants";
import { apiCall } from "./apiClient";
import { isServerless } from "./appMode";
import { compareVersions } from "./serverVersion";

export async function forcePlayUpdate(
  current = Constants.expoConfig?.version ?? "0.0.0",
  updates = new SpInAppUpdates(false),
) {
  if (await isServerless()) return;
  const { minAppVersion } = await apiCall<{ minAppVersion?: string | null }>("/healthz");
  if (!minAppVersion || compareVersions(current, minAppVersion) >= 0) return;
  const { shouldUpdate } = await updates.checkNeedsUpdate();
  if (shouldUpdate) await updates.startUpdate({ updateType: IAUUpdateKind.IMMEDIATE });
}

// The server's MIN_APP_VERSION decides who must update. Rechecking on foreground re-prompts a user who backed out of the Play flow.
export function usePlayForcedUpdate() {
  useEffect(() => {
    if (Platform.OS !== "android" || GITHUB_BUILD || __DEV__) return;
    const check = () => void forcePlayUpdate().catch(() => {});
    check();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, []);
}
