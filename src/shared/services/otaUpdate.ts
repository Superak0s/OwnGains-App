import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";
import { GITHUB_BUILD } from "@shared/distribution";

let downloaded = false;

/** Downloads a newer JS bundle from the update server. It runs on the next cold start or resume. */
export async function fetchOtaUpdate() {
  if (!Updates.isEnabled || downloaded) return;
  // The APK and AAB bundles differ (Ko-fi link), and native config sends "play", the channel safe for both.
  if (GITHUB_BUILD) Updates.setUpdateRequestHeadersOverride({ "expo-channel-name": "github" });
  const { isAvailable } = await Updates.checkForUpdateAsync();
  if (!isAvailable) return;
  await Updates.fetchUpdateAsync();
  downloaded = true;
}

/**
 * Restarts into a downloaded update when the app returns from the background.
 * @returns Whether it reloaded.
 */
export async function applyOtaOnResume(workoutActive: boolean) {
  // A reload drops in-memory workout state such as the rest timer and an unsaved set.
  if (!downloaded || workoutActive) return false;
  await Updates.reloadAsync();
  return true;
}

export function useOtaUpdates(workoutActive: boolean) {
  const active = useRef(workoutActive);
  active.current = workoutActive;
  useEffect(() => {
    const check = () => void fetchOtaUpdate().catch(() => {});
    check();
    let prev: string | null | undefined = AppState.currentState;
    const sub = AppState.addEventListener("change", (s) => {
      const resumed = s === "active" && prev === "background";
      prev = s;
      if (s !== "active") return;
      if (!resumed) return check();
      void applyOtaOnResume(active.current)
        .then((reloaded) => reloaded || check())
        .catch(() => {});
    });
    return () => sub.remove();
  }, []);
}
