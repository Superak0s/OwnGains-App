import { useEffect } from "react";
import { Linking } from "react-native";
import Constants from "expo-constants";
import { GITHUB_BUILD } from "@shared/distribution";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import { useAlert } from "@shared/components/CustomAlert";

const LATEST_RELEASE_URL =
  "https://api.github.com/repos/Superak0s/OwnGains-App/releases/latest";
const LAST_CHECK_KEY = "@github_update_last_check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v.replace(/^v/, "").split("-")[0].split(".").map((n) => Number(n) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
}

export async function checkForGitHubUpdate(
  current: string,
  now = Date.now(),
): Promise<{ version: string; url: string } | null> {
  const last = Number(await getStorageItem(LAST_CHECK_KEY)) || 0;
  if (now - last < CHECK_INTERVAL_MS) return null;
  const res = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) return null;
  await setStorageItem(LAST_CHECK_KEY, String(now));
  const { tag_name, html_url } = (await res.json()) as {
    tag_name?: string;
    html_url?: string;
  };
  if (!tag_name || !html_url || !isNewerVersion(tag_name, current)) return null;
  return { version: tag_name.replace(/^v/, ""), url: html_url };
}

// Play bans apps updating themselves outside Play, so this only runs in the GitHub APK build.
export function useGitHubUpdateCheck() {
  const { alert, AlertComponent } = useAlert();
  useEffect(() => {
    const current = Constants.expoConfig?.version;
    if (!GITHUB_BUILD || __DEV__ || !current) return;
    checkForGitHubUpdate(current)
      .then((update) => {
        if (!update) return;
        alert(
          "Update available",
          `OwnGains ${update.version} is out (you have ${current}). Download the APK for your device from the release page.`,
          [
            { text: "Later", style: "cancel" },
            { text: "Download", onPress: () => void Linking.openURL(update.url) },
          ],
        );
      })
      .catch(() => {});
  }, [alert]);
  return AlertComponent;
}
