import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { AppRegistry, AppState, Linking, Platform, ToastAndroid } from "react-native";
import { authService } from "@features/auth/services";
import { captureException, trackFeature } from "@shared/services/crashReporting";
import {
  getRecordStoreUser,
  setRecordStoreUser,
} from "@shared/services/offlineHelpers";
import { hydrationApi } from "./services";
import { DEFAULT_HYDRATION_ERROR_MARGIN } from "./services/types";
import { LogHydrationModal } from "./tabs/HydrationTab";

// Both names are shared with modules/hydration-tiles (HydrationTileService.kt).
const TASK_NAME = "HydrationTileLog";
const LOG_WATER_URL = "owngains://log-water";

/** Logs a drink outside the app's UI. Returns false when nothing was logged. */
const quickLogHydration = async (userId: string, ml: number): Promise<boolean> => {
  if (!(ml > 0)) return false;

  // A headless run starts with no account seated. One signed in as someone
  // else must not get this drink.
  const seated = getRecordStoreUser();
  if (seated === null) setRecordStoreUser(userId);
  else if (seated !== userId) return false;

  try {
    await hydrationApi.logHydration(
      ml,
      undefined,
      null,
      undefined,
      DEFAULT_HYDRATION_ERROR_MARGIN,
    );
    trackFeature("hydration", "quick_log", {
      source: "tile",
      foreground: AppState.currentState === "active",
    });
    return true;
  } catch (error) {
    captureException(error, { stage: "hydrationQuickLog", source: "tile" });
    return false;
  }
};

export const logFromTile = async ({ ml }: { ml?: number }): Promise<void> => {
  const user = await authService.getStoredUser().catch(() => null);
  if (!user) {
    ToastAndroid.show("Sign in to OwnGains to log water.", ToastAndroid.SHORT);
    return;
  }
  const logged = await quickLogHydration(String(user.id), Number(ml));
  ToastAndroid.show(
    logged ? `Logged ${ml} ml of water` : "Couldn't log water. Open OwnGains to try again.",
    ToastAndroid.SHORT,
  );
};

if (Platform.OS === "android") {
  AppRegistry.registerHeadlessTask(TASK_NAME, () => logFromTile);
}

const isLogWaterUrl = (url: string | null): boolean =>
  url?.startsWith(LOG_WATER_URL) ?? false;

/** Opens the log water sheet when the "Log water" tile launches the app. */
export function HydrationTileModal() {
  const [open, setOpen] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    const openFromTile = (url: string | null) => {
      if (!isLogWaterUrl(url)) return;
      (navigation.navigate as unknown as (name: string, params: object) => void)("Main", {
        screen: "Tracking",
        params: { tab: "hydration" },
      });
      setOpen(true);
    };
    void Linking.getInitialURL().then(openFromTile);
    const sub = Linking.addEventListener("url", ({ url }) => openFromTile(url));
    return () => sub.remove();
  }, [navigation]);

  return (
    <LogHydrationModal visible={open} onClose={() => setOpen(false)} />
  );
}
