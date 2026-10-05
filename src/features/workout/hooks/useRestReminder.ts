import { useEffect } from "react";
import { Platform } from "react-native";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  cancelReminder,
  scheduleReminder,
} from "@shared/services/notifications";
import {
  initializeSupplementNotifications,
  WORKOUT_TIMER_CHANNEL,
} from "@shared/services/supplementReminders";
import { log, metric } from "@shared/services/crashReporting";

const REST_REMINDER_ID = "workout-rest-reminder";

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

  useEffect(() => {
    // The act-as pane shares REST_REMINDER_ID with the trainer's own workout.
    if (!enabled) return;

    // Anchored to the set, not to this effect: after a relaunch the effect
    // reruns with the restored set time and must keep the original fire time.
    const fireAt = lastSetEndTime
      ? new Date(lastSetEndTime).getTime() + restReminderSeconds * 1000
      : NaN;
    if (
      !workoutStartTime ||
      isCurrentDayLocked ||
      !restReminderEnabled ||
      !(fireAt > Date.now())
    ) {
      void cancelReminder(REST_REMINDER_ID);
      return;
    }

    scheduleReminder(REST_REMINDER_ID, async (Notifications) => {
      if (!(await initializeSupplementNotifications())) return null;
      return {
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
  ]);
}
