import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as TaskManager from "expo-task-manager";
import type { NotificationResponse } from "expo-notifications";
import {
  getNotifications,
  scheduleNotification,
} from "@shared/services/notifications";
import { initializeSupplementNotifications } from "@shared/services/supplementReminders";
import { captureException, trackFeature } from "@shared/services/crashReporting";
import {
  getRecordStoreUser,
  setRecordStoreUser,
} from "@shared/services/offlineHelpers";
import {
  STORAGE_KEYS,
  loadFromStorage,
  saveToStorage,
} from "@shared/services/storage";
import { hydrationApi } from "./services";
import { DEFAULT_HYDRATION_PRESETS, type HydrationPreset } from "./services/types";
import { isoToLocalDateStr } from "./utils";

const NOTIFICATION_ID = "hydration-quick-log";
const CATEGORY_ID = "hydration-quick-log";
const CHANNEL_ID = "hydration-quick-log";
const TASK_NAME = "hydration-quick-log-action";
const DATA_TYPE = "hydration_quick_log";
const ACTION_PREFIX = "add-ml:";
// Android shows at most three action buttons.
const MAX_ACTIONS = 3;

export const isHydrationNotificationEnabled = async (
  userId: string,
): Promise<boolean> =>
  (await loadFromStorage<boolean>(STORAGE_KEYS.HYDRATION_NOTIFICATION, userId)) ===
  true;

const todayTotalMl = async (): Promise<number> => {
  const today = isoToLocalDateStr(new Date().toISOString());
  const { data } = await hydrationApi.getHydrationHistory(100);
  return (data ?? [])
    .filter((entry) => isoToLocalDateStr(entry.loggedAt) === today)
    .reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0);
};

const present = async (
  userId: string,
  promptIfNeeded = false,
): Promise<boolean> => {
  const Notifications = await getNotifications();
  if (!Notifications) return false;
  if (!(await initializeSupplementNotifications(promptIfNeeded))) return false;

  try {
    const [presets, total, settings] = await Promise.all([
      loadFromStorage<HydrationPreset[]>(STORAGE_KEYS.HYDRATION_PRESETS, userId),
      todayTotalMl().catch(() => null),
      hydrationApi.getSettings().catch(() => null),
    ]);
    const amounts = [
      ...new Set(
        (presets?.length ? presets : DEFAULT_HYDRATION_PRESETS)
          .map((preset) => preset.ml)
          .filter((ml) => ml > 0),
      ),
    ].slice(0, MAX_ACTIONS);

    if (Platform.OS === "android") {
      // LOW importance so refreshing the total after each drink is silent.
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: "Water Quick Log",
        importance: Notifications.AndroidImportance.LOW,
        showBadge: false,
      });
    }
    await Notifications.setNotificationCategoryAsync(
      CATEGORY_ID,
      amounts.map((ml) => ({
        identifier: `${ACTION_PREFIX}${ml}`,
        buttonTitle: `+${ml} ml`,
        options: { opensAppToForeground: false },
      })),
    );
    await Notifications.registerTaskAsync(TASK_NAME);

    const goal = settings?.data?.goalMl;
    await scheduleNotification({
      identifier: NOTIFICATION_ID,
      content: {
        title: "💧 Water",
        body:
          total === null
            ? "Log a drink with the buttons below."
            : `${total}${goal ? ` of ${goal}` : ""} ml today`,
        data: { type: DATA_TYPE, userId },
        categoryIdentifier: CATEGORY_ID,
        sticky: true,
        autoDismiss: false,
        ...(Platform.OS === "android" && { channelId: CHANNEL_ID }),
      },
      trigger: null,
    });
    return true;
  } catch (error) {
    captureException(error, { stage: "presentHydrationNotification" });
    return false;
  }
};

export const hideHydrationNotification = async (): Promise<void> => {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
  } catch {
    // best-effort
  }
};

/** Returns false when notification permission was refused, leaving it off. */
export const setHydrationNotificationEnabled = async (
  userId: string,
  enabled: boolean,
): Promise<boolean> => {
  const granted = !enabled || (await present(userId, true));
  trackFeature("hydration", "notification_toggle", { on: enabled, granted });
  if (!granted) return false;
  if (!enabled) await hideHydrationNotification();
  await saveToStorage(STORAGE_KEYS.HYDRATION_NOTIFICATION, enabled, userId);
  return true;
};

// ponytail: the total only refreshes on a log or app open, so it reads yesterday's
// total after midnight until then. A daily trigger could refresh it if that matters.
export const refreshHydrationNotification = async (
  userId: string,
): Promise<void> => {
  if (await isHydrationNotificationEnabled(userId)) await present(userId);
};

type RawContent = { data?: unknown; dataString?: unknown };

// The background task gets the response unmapped, with data still as a JSON string.
const dataOf = (content: RawContent): { type?: string; userId?: string } => {
  if (typeof content.dataString === "string") {
    try {
      return JSON.parse(content.dataString);
    } catch {
      return {};
    }
  }
  return (content.data as { type?: string; userId?: string }) ?? {};
};

export const handleHydrationAction = async (
  response: Pick<NotificationResponse, "actionIdentifier" | "notification">,
): Promise<void> => {
  const { type, userId } = dataOf(
    response.notification.request.content as RawContent,
  );
  if (type !== DATA_TYPE || !userId) return;
  if (!response.actionIdentifier.startsWith(ACTION_PREFIX)) return;
  const ml = Number(response.actionIdentifier.slice(ACTION_PREFIX.length));
  if (!(ml > 0)) return;

  // A headless run starts with no account seated. One signed in as someone
  // else must not get this drink.
  const seated = getRecordStoreUser();
  if (seated === null) setRecordStoreUser(userId);
  else if (seated !== userId) return;

  try {
    await hydrationApi.logHydration(ml);
    trackFeature("hydration", "quick_log", { foreground: AppState.currentState === "active" });
  } catch (error) {
    captureException(error, { stage: "hydrationQuickLog" });
  }
  await present(userId);
};

TaskManager.defineTask<NotificationResponse | Record<string, unknown>>(
  TASK_NAME,
  async ({ data }) => {
    if (data && "actionIdentifier" in data) {
      await handleHydrationAction(data as NotificationResponse);
    }
  },
);

/** Keeps the notification's total current, and handles its buttons while the
 * app is in the foreground, where Android doesn't run the background task. */
export function useHydrationNotification(userId: string | null): void {
  useEffect(() => {
    if (!userId) return;
    void refreshHydrationNotification(userId);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshHydrationNotification(userId);
    });
    let response: { remove: () => void } | null = null;
    let cancelled = false;
    void getNotifications().then((Notifications) => {
      if (!Notifications || cancelled) return;
      response = Notifications.addNotificationResponseReceivedListener((r) => {
        if (AppState.currentState === "active") void handleHydrationAction(r);
      });
    });
    return () => {
      cancelled = true;
      appState.remove();
      response?.remove();
    };
  }, [userId]);
}
