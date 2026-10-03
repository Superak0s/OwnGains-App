import { Platform } from "react-native";
import {
  getStorageItem,
  setStorageItem,
} from "./sqliteStorage";
import {
  getNotifications,
  scheduleNotification,
  cancelNotification,
} from "./notifications";
import { withLock } from "./offlineHelpers";
import {
  captureException,
  metric,
} from "./crashReporting";

/** Per-supplement reminder config stored in SQLite. */
export interface SupplementReminderConfig {
  supplementId: number;
  name: string;
  unit: string;
  defaultAmount: number;
  timeBasedEnabled: boolean;
  reminderTime: string;
  enabled: boolean;
  notificationType?: string;
}

/** "alarm" gets its own MAX-importance channel. Android importance is fixed at
 * channel creation, so the two levels can't share one. */
const CHANNELS: Record<string, string> = {
  notification: "supplement-reminders",
  alarm: "supplement-alarms",
};

// Rest and inactivity reminders get their own channel so muting supplement
// reminders in Android settings doesn't also mute them.
export const WORKOUT_TIMER_CHANNEL = "workout-timers";

const channelFor = (notificationType: string | undefined) =>
  CHANNELS[notificationType ?? "notification"] ?? CHANNELS.notification;

const STORAGE_KEY_SUPPLEMENT_CONFIGS = (userId: string) =>
  `supplementReminderConfigs_user_${userId}`;

/**
 * A corrupt or truncated row must not throw: the callers delete supplements and
 * save reminder settings, and an exception there leaves an orphaned reminder
 * firing daily for something the app no longer knows about.
 */
export const readSupplementReminderConfigs = async (
  userId: string,
): Promise<SupplementReminderConfig[]> => {
  const raw = await getStorageItem(STORAGE_KEY_SUPPLEMENT_CONFIGS(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SupplementReminderConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn("Supplement reminder configs are corrupt, ignoring them");
    return [];
  }
};

// Read-modify-write over one key: two saves in quick succession, or a save
// overlapping the boot re-arm, would otherwise each write back their own copy.
const configLock = (userId: string) => `supplementReminderConfigs:${userId}`;

export const removeSupplementReminderConfig = (
  userId: string,
  supplementId: number,
): Promise<void> =>
  withLock(configLock(userId), async () => {
    const configs = await readSupplementReminderConfigs(userId);
    await setStorageItem(
      STORAGE_KEY_SUPPLEMENT_CONFIGS(userId),
      JSON.stringify(configs.filter((c) => c.supplementId !== supplementId)),
    );
  });

export const saveSupplementReminderConfig = (
  userId: string,
  config: SupplementReminderConfig,
): Promise<void> =>
  withLock(configLock(userId), async () => {
    const configs = await readSupplementReminderConfigs(userId);
    const idx = configs.findIndex((c) => c.supplementId === config.supplementId);
    if (idx >= 0) configs[idx] = config;
    else configs.push(config);
    await setStorageItem(
      STORAGE_KEY_SUPPLEMENT_CONFIGS(userId),
      JSON.stringify(configs),
    );
  });

/**
 * `promptIfNeeded` is false on paths the user did not ask for a notification
 * on, especially the boot re-arm, which would raise the system
 * permission dialog immediately after a first sign-in, before the user has
 * opened Supplements or created one reminder.
 */
export const initializeSupplementNotifications = async (
  promptIfNeeded = true,
): Promise<boolean> => {
  // Expo Go can't do push/remote notification setup, so skip entirely rather
  // than let expo-notifications warn/throw.
  const Notifications = await getNotifications();
  if (!Notifications) return false;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      if (!promptIfNeeded) return false;
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    metric.count("notifications.permission", 1, {
      attributes: { outcome: finalStatus, prompted: existing !== "granted" },
    });
    if (finalStatus !== "granted") return false;

    if (Platform.OS === "android") {
      try {
        await Notifications.setNotificationChannelAsync(CHANNELS.notification, {
          name: "Supplement Reminders",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#667eea",
          // sound omitted, channel uses system default
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync(CHANNELS.alarm, {
          name: "Supplement Alarms",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500],
          lightColor: "#667eea",
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync(WORKOUT_TIMER_CHANNEL, {
          name: "Workout Timers",
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#667eea",
          showBadge: false,
        });
      } catch {
        // channel already exists, ignore
      }
    }
    return true;
  } catch (error) {
    metric.count("notifications.init_failed");
    captureException(error, { stage: "initializeSupplementNotifications" });
    return false;
  }
};

/**
 * The DAILY trigger repeats on its own and is kept across reboots, so nothing has to
 * re-arm it. A one-shot trigger must not be used here: re-arming can only be
 * driven by the user tapping the notification, so a dismissed reminder would
 * silently never fire again.
 *
 * The identifier includes the user id: offline supplement ids come from a
 * per-user counter starting at 1, so two accounts on one device would otherwise
 * overwrite and cancel each other's reminders.
 */
const notificationIdFor = (userId: string, supplementId: number): string =>
  `supplement-time-${userId}-${supplementId}`;

export const scheduleTimeReminder = async (
  userId: string,
  supplementId: number,
  supplementName: string,
  defaultAmount: number,
  unit: string,
  reminderTime: string,
  notificationType?: string,
): Promise<string | null> => {
  const Notifications = await getNotifications();
  if (!Notifications) return null;

  // A malformed stored time must not silently become midnight: the user would
  // get a 00:00 notification they never asked for while the UI shows the time
  // they did set.
  const parsed = /^(\d{1,2}):(\d{2})$/.exec(reminderTime.trim());
  const hours = parsed ? Number(parsed[1]) : NaN;
  const minutes = parsed ? Number(parsed[2]) : NaN;
  if (!(hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59)) {
    console.warn(`Refusing to schedule reminder for invalid time "${reminderTime}"`);
    metric.count("notifications.invalid_reminder_time");
    return null;
  }

  try {
    const notifId = notificationIdFor(userId, supplementId);
    await cancelTimeReminder(userId, supplementId);

    // Via the shared wrapper, which strips `sound` from the content: on Android
    // the channel sets the sound, and setting both double-fires it.
    const identifier = await scheduleNotification({
      identifier: notifId,
      content: {
        title: `💊 Time for ${supplementName}!`,
        body: `It's ${reminderTime}. Don't forget your ${defaultAmount}${unit} dose!`,
        data: { type: "supplement_time_reminder", supplementId, userId },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        vibrate: [0, 250, 250, 250],
        ...(Platform.OS === "android" && {
          channelId: channelFor(notificationType),
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: hours,
        minute: minutes,
      },
    });

    await setStorageItem(
      `supplementTimeNotifId_${supplementId}_user_${userId}`,
      identifier,
    );
    return identifier;
  } catch (error) {
    metric.count("notifications.schedule_failed");
    captureException(error, { stage: "scheduleTimeReminder" });
    return null;
  }
};

export const cancelTimeReminder = async (
  userId: string,
  supplementId: number,
): Promise<void> => {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    // The legacy id too: installs that predate the per-user namespace have a
    // reminder scheduled under it that nothing else would ever cancel.
    const ids = new Set([
      notificationIdFor(userId, supplementId),
      `supplement-time-${supplementId}`,
    ]);
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (ids.has(n.identifier)) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch {
    // best-effort
  }
};

const nextDoseIdFor = (userId: string, supplementId: number): string =>
  `supplement-dose-${userId}-${supplementId}`;

/** A one-shot trigger is right here, unlike the daily reminder: logging a dose
 * is what re-arms it. Never prompts for permission, because logging is not a moment
 * the user asked to be interrupted. */
export const scheduleNextDoseReminder = async (
  userId: string,
  supplementId: number,
  supplementName: string,
  amount: number,
  unit: string,
  at: Date,
  notificationType?: string,
): Promise<string | null> => {
  const Notifications = await getNotifications();
  if (!Notifications || at.getTime() <= Date.now()) return null;
  if (!(await initializeSupplementNotifications(false))) return null;

  try {
    await cancelNextDoseReminder(userId, supplementId);
    return await scheduleNotification({
      identifier: nextDoseIdFor(userId, supplementId),
      content: {
        title: `💊 Next ${supplementName} dose`,
        body: `Time for your next ${amount}${unit} dose.`,
        data: { type: "supplement_dose_reminder", supplementId, userId },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" && {
          channelId: channelFor(notificationType),
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: at,
      },
    });
  } catch (error) {
    metric.count("notifications.dose_schedule_failed");
    captureException(error, { stage: "scheduleNextDoseReminder" });
    return null;
  }
};

export const cancelNextDoseReminder = async (
  userId: string,
  supplementId: number,
): Promise<void> => {
  try {
    await cancelNotification(nextDoseIdFor(userId, supplementId));
  } catch {
    // best-effort
  }
};

/** A config whose supplement the store no longer lists (deleted on another
 * device, or left on the server when it moved supplements on-device) has no
 * row left to turn it off, and the boot re-arm would keep rescheduling it. */
export const pruneOrphanedSupplementReminders = async (
  userId: string,
  liveIds: readonly number[],
): Promise<number[]> => {
  const live = new Set(liveIds);
  const orphaned = await withLock(configLock(userId), async () => {
    const configs = await readSupplementReminderConfigs(userId);
    const gone = configs.filter((c) => !live.has(c.supplementId));
    if (gone.length > 0) {
      await setStorageItem(
        STORAGE_KEY_SUPPLEMENT_CONFIGS(userId),
        JSON.stringify(configs.filter((c) => live.has(c.supplementId))),
      );
    }
    return gone.map((c) => c.supplementId);
  });
  for (const id of orphaned) {
    await cancelTimeReminder(userId, id);
    await cancelNextDoseReminder(userId, id);
  }
  return orphaned;
};

/** Daily triggers keep firing after the data they were scheduled for, so anything that
 * removes a user's supplements or signs them out has to cancel these too. */
export const cancelAllSupplementReminders = async (
  userId: string,
): Promise<void> => {
  const Notifications = await getNotifications();
  if (!Notifications) return;

  try {
    const prefixes = [`supplement-time-${userId}-`, `supplement-dose-${userId}-`];
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if (prefixes.some((p) => n.identifier.startsWith(p))) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    captureException(error, { stage: "cancelAllSupplementReminders" });
  }
};
