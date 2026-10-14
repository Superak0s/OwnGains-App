import { useEffect } from "react";
import { Platform } from "react-native";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  cancelReminder,
  scheduleReminder,
} from "@shared/services/notifications";
import {
  ALARM_CHANNEL,
  initializeSupplementNotifications,
  WORKOUT_TIMER_CHANNEL,
} from "@shared/services/supplementReminders";
import * as alarms from "@shared/services/supplementAlarms";
import { log, metric } from "@shared/services/crashReporting";

const REST_REMINDER_ID = "workout-rest-reminder";

type RestReminderOptions = {
  /** Off in the trainer's act-as pane: the trainee rests, so the reminder belongs on their device. */
  enabled: boolean;
  workoutStartTime: string | null;
  isCurrentDayLocked: boolean;
  restReminderEnabled: boolean;
  restReminderSeconds: number;
  /** Rings like the supplement alarm instead of a notification. */
  asAlarm: boolean;
};

const cancelBoth = () => {
  void cancelReminder(REST_REMINDER_ID);
  alarms.cancelAlarm(REST_REMINDER_ID);
};

export function useRestReminder({
  enabled,
  workoutStartTime,
  isCurrentDayLocked,
  restReminderEnabled,
  restReminderSeconds,
  asAlarm,
}: RestReminderOptions): void {
  const { lastSetEndTime } = useWorkoutPick("lastSetEndTime");

  useEffect(() => {
    // The act-as pane shares REST_REMINDER_ID with the trainer's own workout.
    if (!enabled) return;

    // Anchored to the set, not to this effect: after a relaunch the effect
    // reruns with the restored set time and must keep the original fire time.
    const fireAt = lastSetEndTime
      ? new Date(lastSetEndTime).getTime() + restReminderSeconds * 1000
      : Number.NaN;
    if (
      !workoutStartTime ||
      isCurrentDayLocked ||
      !restReminderEnabled ||
      !(fireAt > Date.now())
    ) {
      cancelBoth();
      return;
    }

    const title = "⏱️ Time to start your next set";
    const body = `You've rested ${formatDuration(restReminderSeconds)}. Start your next set when ready.`;

    if (asAlarm && alarms.alarmsAvailable) {
      let active = true;
      void cancelReminder(REST_REMINDER_ID);
      // The alarm channel backs the fallback notification shown without "Display over other apps".
      void initializeSupplementNotifications().then((ready) => {
        if (!ready || !active) return;
        alarms.scheduleAlarm(
          { id: REST_REMINDER_ID, channelId: ALARM_CHANNEL, title, body, snoozeSeconds: 30 },
          new Date(fireAt),
          false,
        );
      });
      return () => {
        active = false;
        cancelBoth();
      };
    }
    alarms.cancelAlarm(REST_REMINDER_ID);

    scheduleReminder(REST_REMINDER_ID, async (Notifications) => {
      if (!(await initializeSupplementNotifications())) return null;
      return {
        content: {
          title,
          body,
          data: { type: "rest_reminder" },
          priority: Notifications.AndroidNotificationPriority.HIGH,
          ...(Platform.OS === "android" && {
            channelId: WORKOUT_TIMER_CHANNEL,
          }),
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      };
    }).catch((err: unknown) => {
      console.warn("Failed to schedule rest reminder:", err);
      metric.count("workout.rest_reminder_schedule_failed");
      log.warn("workout.rest_reminder_schedule_failed");
    });

    return () => {
      void cancelReminder(REST_REMINDER_ID);
    };
  }, [
    enabled,
    workoutStartTime,
    isCurrentDayLocked,
    lastSetEndTime,
    restReminderEnabled,
    restReminderSeconds,
    asAlarm,
  ]);
}
