import { Platform } from "react-native"
import * as Calendar from "expo-calendar"
import { getRecordStoreUser } from "@shared/services/offlineHelpers"
import { loadFromStorage, saveToStorage } from "@shared/services/storage"
import { metric } from "@shared/services/crashReporting"
import type { ScheduledWorkout } from "./types"

const ENABLED_KEY = "@schedule_calendar_sync"
const EVENTS_KEY = "@schedule_calendar_events"
const CALENDAR_TITLE = "OwnGains"

/** Per account, since entry ids repeat across accounts. Entry id to the device event made for it, with the start time used to tell a past entry from a deleted one. */
type EventMap = Record<string, { eventId: string; startAt: string }>

export const isCalendarSyncEnabled = async (): Promise<boolean> => (await loadFromStorage<boolean>(ENABLED_KEY)) === true

/** Turns syncing on (asking for the permission) or off. Resolves false when the permission was refused. */
export async function setCalendarSync(enabled: boolean): Promise<boolean> {
  if (enabled && !(await Calendar.requestCalendarPermissions()).granted) return false
  await saveToStorage(ENABLED_KEY, enabled)
  return true
}

async function ownCalendar(): Promise<Calendar.ExpoCalendar> {
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT)
  const existing = calendars.find((c) => c.title === CALENDAR_TITLE && c.allowsModifications)
  if (existing) return existing
  if (Platform.OS === "ios") {
    const primary = calendars.find((c) => c.isPrimary && c.allowsModifications)
    if (primary) return primary
  }
  // Android has no default calendar an app may write to without an account, so the app keeps a local one.
  return Calendar.createCalendar({
    title: CALENDAR_TITLE,
    name: CALENDAR_TITLE,
    color: "#667eea",
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: Calendar.SourceType.LOCAL },
    ownerAccount: CALENDAR_TITLE,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  })
}

const eventDetails = (entry: ScheduledWorkout) => {
  const startDate = new Date(entry.startAt)
  return {
    title: entry.title,
    startDate,
    endDate: new Date(startDate.getTime() + entry.durationMin * 60_000),
    notes: entry.programDay ? `Program day ${entry.programDay}` : undefined,
  }
}

/**
 * Mirrors accepted entries into the device calendar. Entries that left the list
 * while still upcoming were deleted, so their events go too. Past ones are kept.
 */
export async function syncCalendar(entries: ScheduledWorkout[], windowStart: Date): Promise<void> {
  if (!(await isCalendarSyncEnabled()) || !(await Calendar.getCalendarPermissions()).granted) return
  const map = (await loadFromStorage<EventMap>(EVENTS_KEY, getRecordStoreUser())) ?? {}
  const next: EventMap = {}
  let calendar: Calendar.ExpoCalendar | null = null

  for (const entry of entries.filter((e) => e.status === "accepted")) {
    const known = map[entry.id]
    const details = eventDetails(entry)
    if (known) {
      try {
        await (await Calendar.ExpoCalendarEvent.get(known.eventId)).update(details)
        next[entry.id] = { eventId: known.eventId, startAt: entry.startAt }
        continue
      } catch {
        // The user deleted the event in their calendar app. Make it again.
        metric.count("schedule.calendar_event_recreated")
      }
    }
    calendar ??= await ownCalendar()
    next[entry.id] = { eventId: (await calendar.createEvent(details)).id, startAt: entry.startAt }
  }

  for (const [id, known] of Object.entries(map)) {
    if (next[id]) continue
    if (new Date(known.startAt) < windowStart) {
      next[id] = known
      continue
    }
    await Calendar.ExpoCalendarEvent.get(known.eventId)
      .then((event) => event.delete())
      .catch(() => metric.count("schedule.calendar_event_already_gone"))
  }
  await saveToStorage(EVENTS_KEY, next, getRecordStoreUser())
}
