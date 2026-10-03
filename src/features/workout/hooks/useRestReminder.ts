import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  getNotifications,
  scheduleNotification,
  cancelNotification,
} from "@shared/services/notifications";
import {
  initializeSupplementNotifications,
  WORKOUT_TIMER_CHANNEL,
} from "@shared/services/supplementReminders";
import { log, metric } from "@shared/services/crashReporting";

type RestReminderOptions = {
  /** Off in the trainer's act-as pane: the trainee rests, so the reminder belongs on their device. */
  enabled: boolean;
  workoutStartTime: string | null;
  isCurrentDayLocked: boolean;
  restReminderEnabled: boolean;
  restReminderSeconds: number;
};

export function useRestReminder({
  enabled,
  workoutStartTime,
  isCurrentDayLocked,
  restReminderEnabled,
  restReminderSeconds,
}: RestReminderOptions): void {
  const { lastSetEndTime } = useWorkoutPick("lastSetEndTime");
  const scheduledNotifIdRef = useRef<string | null>(null);

  useEffect(() => {
    const cancelPending = async () => {
      if (scheduledNotifIdRef.current) {
        await cancelNotification(scheduledNotifIdRef.current).catch(() => {});
        scheduledNotifIdRef.current = null;
      }
    };

    if (
      !enabled ||
      !workoutStartTime ||
      isCurrentDayLocked ||
      !lastSetEndTime ||
      !restReminderEnabled ||
      restReminderSeconds <= 0
    ) {
      void cancelPending();
      return;
    }

    let cancelled = false;
    (async () => {
      await cancelPending();
      try {
        // No-op in Expo Go. The Notifications module is never loaded there.
        const Notifications = await getNotifications();
        if (!Notifications) return;
        const ready = await initializeSupplementNotifications();
        if (!ready) return;
        const identifier = await scheduleNotification({
          content: {
            title: `⏱️ Time to start your next set`,
            body: `You've rested ${formatDuration(restReminderSeconds)}. Start your next set when ready.`,
            data: { type: "rest_reminder" },
            priority: Notifications.AndroidNotificationPriority.HIGH,
            ...(Platform.OS === "android" && {
              channelId: WORKOUT_TIMER_CHANNEL,
            }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: restReminderSeconds,
            repeats: false,
          },
        });
        // The effect may have been torn down while this was awaiting. Its
        // cleanup ran before there was an id to cancel, so cancel it here or
        // the reminder still fires after the set and the workout end.
        if (cancelled) {
          await cancelNotification(identifier).catch(() => {});
          return;
        }
        scheduledNotifIdRef.current = identifier;
      } catch (err) {
        console.warn("Failed to schedule rest reminder:", err);
        metric.count("workout.rest_reminder_schedule_failed");
        log.warn("workout.rest_reminder_schedule_failed");
      }
    })();

    return () => {
      cancelled = true;
      void cancelPending();
    };
  }, [
    enabled,
    workoutStartTime,
    isCurrentDayLocked,
    lastSetEndTime,
    restReminderEnabled,
    restReminderSeconds,
  ]);
}
