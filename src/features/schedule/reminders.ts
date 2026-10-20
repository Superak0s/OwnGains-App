import { Platform } from "react-native"
import { cancelReminder, getNotifications, scheduleReminder } from "@shared/services/notifications"
import {
  ALARM_CHANNEL,
  initializeSupplementNotifications,
  WORKOUT_TIMER_CHANNEL,
} from "@shared/services/supplementReminders"
import * as alarms from "@shared/services/supplementAlarms"
import { reportAndReturn } from "@shared/services/crashReporting"
import type { ScheduledWorkout } from "./types"

const PREFIX = "scheduled-workout-"
// ponytail: Android caps an app at 500 pending alarms, so only the nearest ones are set. Each refresh tops them up.
const MAX_REMINDERS = 50

export interface PlannedReminder {
  id: string
  at: Date
  entry: ScheduledWorkout
}

/** Upcoming reminders for accepted entries, nearest first. A pending suggestion never rings. */
export function plannedReminders(entries: ScheduledWorkout[], now: number): PlannedReminder[] {
  return entries
    .filter((e) => e.status === "accepted" && e.reminderMinutes != null)
    .map((entry) => ({
      id: `${PREFIX}${entry.id}`,
      at: new Date(new Date(entry.startAt).getTime() - (entry.reminderMinutes ?? 0) * 60_000),
      entry,
    }))
    .filter((r) => r.at.getTime() > now)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_REMINDERS)
}

/** Clears every schedule reminder and sets the current ones, so edits and deletions need no bookkeeping. */
export async function syncScheduleReminders(entries: ScheduledWorkout[]): Promise<void> {
  const Notifications = await getNotifications()
  if (Notifications) {
    const pending = await Notifications.getAllScheduledNotificationsAsync()
      .catch(reportAndReturn([], { stage: "scheduleRemindersList" }))
    await Promise.all(pending.filter((n) => n.identifier.startsWith(PREFIX)).map((n) => cancelReminder(n.identifier)))
  }
  alarms.cancelAlarmsWithPrefix([PREFIX])

  const planned = plannedReminders(entries, Date.now())
  if (planned.length === 0 || !(await initializeSupplementNotifications(false))) return

  for (const { id, at, entry } of planned) {
    const title = `🏋️ ${entry.title}`
    const time = new Date(entry.startAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    const body = entry.reminderMinutes === 0 ? "Time for your workout." : `Your workout starts at ${time}.`
    if (entry.alarm && alarms.alarmsAvailable) {
      alarms.scheduleAlarm({ id, channelId: ALARM_CHANNEL, title, body }, at, false)
      continue
    }
    await scheduleReminder(id, async (N) => ({
      content: {
        title,
        body,
        data: { type: "scheduled_workout", id: entry.id },
        priority: N.AndroidNotificationPriority.HIGH,
        ...(Platform.OS === "android" && { channelId: WORKOUT_TIMER_CHANNEL }),
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at },
    })).catch(reportAndReturn(undefined, { stage: "scheduleReminder" }))
  }
}
