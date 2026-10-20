import { Platform } from "react-native";
import type { Notification } from "expo-notifications";
import { getNotifications, type NotificationsModule } from "@shared/services/notifications";
import { getServerUrl } from "@shared/services/config";
import { loadFromStorage, removeFromStorage, saveToStorage } from "@shared/services/storage";
import { captureUnreported, reportAndReturn } from "@shared/services/crashReporting";
import { messagesApi } from "./services";
import { messagesApi as onlineMessagesApi } from "./services/on/messages";

export const MESSAGES_CHANNEL = "messages";

// Persisted so a revoked session or a killed app can still unregister on the next sign-out.
const REGISTRATION_KEY = "@push_registration";

interface Registration {
  serverUrl: string;
  token: string;
}

let channelReady = false;
let serverPushes = false;
let generation = 0;

export async function ensureMessagesChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== "android" || channelReady) return;
  await Notifications.setNotificationChannelAsync(MESSAGES_CHANNEL, {
    name: "Messages",
    importance: Notifications.AndroidImportance.HIGH,
    showBadge: true,
  });
  channelReady = true;
}

/** True once the server confirmed it pushes new messages to this device, so the app shows none of its own. */
export const serverPushesMessages = (): boolean => serverPushes;

/**
 * Hands this device's FCM token to the server. Does nothing in builds without a
 * google-services.json or against a server without FCM, where the socket alone delivers messages.
 */
export async function registerPushToken(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications || Platform.OS !== "android") return;
  const started = generation;
  try {
    await ensureMessagesChannel(Notifications);
    const { data } = await Notifications.getDevicePushTokenAsync();
    if (typeof data !== "string") return;
    const serverUrl = getServerUrl();
    const enabled = await messagesApi.registerPushToken(data);
    if (started !== generation) return;
    serverPushes = enabled;
    await saveToStorage(REGISTRATION_KEY, { serverUrl, token: data } satisfies Registration);
  } catch (error) {
    if (started === generation) serverPushes = false;
    captureUnreported(error, { stage: "pushRegister" }, "warning");
  }
}

/**
 * Stops pushes to this device for whoever was signed in, on whichever sign-out path.
 * Needs no session, so it still works after the server revoked one.
 */
export async function unregisterPushToken(): Promise<void> {
  generation += 1;
  serverPushes = false;
  const registration = await loadFromStorage<Registration>(REGISTRATION_KEY);
  if (!registration) return;
  await removeFromStorage(REGISTRATION_KEY);
  // ponytail: one try. If the server is unreachable now, the token moves to the next account that signs in here.
  await onlineMessagesApi.unregisterPushToken(registration.serverUrl, registration.token)
    .catch(reportAndReturn(undefined, { stage: "pushUnregister" }));
}

/** Asks once for the notification permission Android 13 and later needs to show a message push. */
export async function askNotificationPermission(): Promise<void> {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
    if (!granted && canAskAgain) await Notifications.requestPermissionsAsync();
  } catch (error) {
    // Messages still arrive in the app without it.
    captureUnreported(error, { stage: "pushPermission" }, "warning");
  }
}

/** The sender's uuid when the notification is about a new message. */
export function messageSender(notification: Notification): string | null {
  const { content, trigger } = notification.request;
  // An FCM push keeps its data on the remote message, a local notification on the content.
  const remote = (trigger as { remoteMessage?: { data?: Record<string, unknown> } } | null)?.remoteMessage?.data;
  const data = remote?.type === "message" ? remote : content.data;
  return data?.type === "message" && typeof data.fromUuid === "string" ? data.fromUuid : null;
}
