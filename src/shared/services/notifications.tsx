import Constants, { ExecutionEnvironment } from "expo-constants";
import { Linking, Platform } from "react-native";
import ExactAlarms from "../../../modules/exact-alarms";
import type { UseAlertReturn } from "../components/CustomAlert";
import { captureException, metric } from "./crashReporting";

const isExpoGo =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Requiring expo-notifications inside Expo Go triggers a load-time warning and,
// as of SDK 57, a hard runtime error, so it is never imported statically, only
// lazily and only outside Expo Go.
export type NotificationsModule = typeof import("expo-notifications");
let cachedNotifications: NotificationsModule | null = null;

export async function getNotifications(): Promise<NotificationsModule | null> {
  if (isExpoGo) return null;
  if (!cachedNotifications) {
    try {
      cachedNotifications = await import("expo-notifications");
    } catch (error) {
      metric.count("notifications.module_unavailable");
      captureException(error, { stage: "getNotifications" });
      return null;
    }
  }
  return cachedNotifications;
}

export async function scheduleNotification(
  options: Parameters<NotificationsModule["scheduleNotificationAsync"]>[0],
): Promise<ReturnType<NotificationsModule["scheduleNotificationAsync"]>> {
  const Notifications = await getNotifications();
  if (!Notifications) throw new Error("Notifications unavailable");
  const { sound: _, ...content } = options.content;
  return Notifications.scheduleNotificationAsync({
    ...options,
    content,
  });
}

export async function cancelNotification(identifier: string): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  await Notifications.cancelScheduledNotificationAsync(identifier);
}

// Without the exact-alarm grant (off by default on Android 14+), expo-notifications
// falls back to an inexact alarm that Doze delays until the phone next wakes, so a
// 90-second rest reminder only shows up once the user reopens the app.
export function canScheduleExactAlarms(): boolean {
  if (Platform.OS !== "android") return true;
  // Without the native module the grant is unknown. Android 14 (API 34) is
  // where it became denied by default.
  if (!ExactAlarms) return Platform.Version < 34;
  return ExactAlarms.canScheduleExactAlarms();
}

export function openExactAlarmSettings(): void {
  if (ExactAlarms) ExactAlarms.openExactAlarmSettings();
  else void Linking.openSettings();
}

export function promptForExactAlarms(
  alert: UseAlertReturn["alert"],
  reminderKind: string,
): void {
  if (canScheduleExactAlarms()) return;
  alert(
    "Allow on-time reminders",
    `Android is delaying ${reminderKind} until you open OwnGains. Turn on "Alarms & reminders" for OwnGains so they arrive on time.`,
    [
      { text: "Not now", style: "cancel" },
      { text: "Open settings", onPress: openExactAlarmSettings },
    ],
    "warning",
  );
}
