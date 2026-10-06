import { useEffect, useState } from "react";
import { useNavigation } from "@react-navigation/native";
import { AppRegistry, Linking, Platform, ToastAndroid } from "react-native";
import { authService } from "@features/auth/services";
import { quickLogHydration } from "./hydrationNotification";
import { LogHydrationModal } from "./tabs/HydrationTab";

// Both names are shared with modules/hydration-tiles (HydrationTileService.kt).
const TASK_NAME = "HydrationTileLog";
const LOG_WATER_URL = "owngains://log-water";

export const logFromTile = async ({ ml }: { ml?: number }): Promise<void> => {
  const user = await authService.getStoredUser().catch(() => null);
  if (!user) {
    ToastAndroid.show("Sign in to OwnGains to log water.", ToastAndroid.SHORT);
    return;
  }
  const logged = await quickLogHydration(String(user.id), Number(ml), "tile");
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
export function HydrationTileModal({ onLogged }: { readonly onLogged: () => void }) {
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
    <LogHydrationModal
      visible={open}
      onClose={() => setOpen(false)}
      onSuccess={onLogged}
    />
  );
}
