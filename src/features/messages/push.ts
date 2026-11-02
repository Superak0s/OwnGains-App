import { Platform } from "react-native";
import { getApps } from "@react-native-firebase/app";
import type { Notification } from "expo-notifications";
import { getNotifications, type NotificationsModule } from "@shared/services/notifications";
import { getServerUrl } from "@shared/services/config";
import { loadFromStorage, removeFromStorage, saveToStorage } from "@shared/services/storage";
import { withLock } from "@shared/services/offlineHelpers";
import { captureUnreported } from "@shared/services/crashReporting";
import { messagesApi } from "./services";
import { messagesApi as onlineMessagesApi } from "./services/on/messages";

export const MESSAGES_CHANNEL = "messages";

// Persisted so a revoked session or a killed app can still unregister on the next sign-out.
const REGISTRATION_KEY = "@push_registration";
// Token per server URL that a signed-out account may still receive pushes on.
const PENDING_UNREGISTER_KEY = "@push_pending_unregister";

interface Registration {
  serverUrl: string;
  token: string;
}

type PendingUnregisters = Record<string, string>;

// Registration and pending writes share one lock so a sign-out can never interleave between them.
const editPending = <T>(edit: (pending: PendingUnregisters) => Promise<T>): Promise<T> =>
  withLock(PENDING_UNREGISTER_KEY, async () => {
    const pending = (await loadFromStorage<PendingUnregisters>(PENDING_UNREGISTER_KEY)) ?? {};
    const result = await edit(pending);
    await saveToStorage(PENDING_UNREGISTER_KEY, pending);
    return result;
  });

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
  // The server's "Your plan was changed" push after a trainer saves over the plan.
  await Notifications.setNotificationChannelAsync("trainer", {
    name: "Trainer changes",
    importance: Notifications.AndroidImportance.DEFAULT,
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
  await retryPushUnregister();
  const Notifications = await getNotifications();
  if (!Notifications || Platform.OS !== "android" || getApps().length === 0) return;
  const started = generation;
  try {
    await ensureMessagesChannel(Notifications);
    // FCM registration fails transiently (no Play services, flaky network) and is retried on the next sign-in.
    const data = await Notifications.getDevicePushTokenAsync().then(({ data }) => data, () => null);
    if (typeof data !== "string") return;
    const serverUrl = getServerUrl();
    const enabled = await messagesApi.registerPushToken(data);
    const stillSignedIn = await editPending(async (pending) => {
      if (started !== generation) {
        pending[serverUrl] = data;
        return false;
      }
      // The server now binds this token to the new account, so a delayed unregister would cut it off.
      if (pending[serverUrl] === data) delete pending[serverUrl];
      await saveToStorage(REGISTRATION_KEY, { serverUrl, token: data } satisfies Registration);
      return true;
    });
    if (!stillSignedIn) return void (await sendUnregister({ serverUrl, token: data }));
    serverPushes = enabled;
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
  const registration = await editPending(async (pending) => {
    const active = await loadFromStorage<Registration>(REGISTRATION_KEY);
    if (active) pending[active.serverUrl] = active.token;
    await removeFromStorage(REGISTRATION_KEY);
    return active;
  });
  if (registration) await sendUnregister(registration);
}

/** Retries the unregisters that failed at an earlier sign-out. */
export async function retryPushUnregister(): Promise<void> {
  const pending = (await loadFromStorage<PendingUnregisters>(PENDING_UNREGISTER_KEY)) ?? {};
  for (const [serverUrl, token] of Object.entries(pending)) await sendUnregister({ serverUrl, token });
}

async function sendUnregister({ serverUrl, token }: Registration): Promise<void> {
  try {
    await onlineMessagesApi.unregisterPushToken(serverUrl, token);
    await editPending(async (pending) => {
      if (pending[serverUrl] === token) delete pending[serverUrl];
    });
  } catch (error) {
    // The entry stays pending: until the server forgets the token, the signed-out account's messages keep arriving here.
    captureUnreported(error, { stage: "pushUnregister" }, "warning");
  }
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
