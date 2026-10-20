import { nextId, readJSON, withLock, writeJSON } from "@shared/services/offlineHelpers"
import type { ScheduleApi } from "../scheduleApiFactory"
import type { ScheduledWorkout, ScheduleParams } from "../../types"

const LIST_KEY = "@offline:schedule:list"
const ID_COUNTER = "@offline:schedule:id_counter"

const readAll = () => readJSON<ScheduledWorkout[]>(LIST_KEY, [])

function change(id: number, edit: (entry: ScheduledWorkout) => ScheduledWorkout | null): Promise<ScheduledWorkout> {
  return withLock(LIST_KEY, async () => {
    const list = await readAll()
    const index = list.findIndex((e) => e.id === id)
    if (index < 0) throw new Error("Scheduled workout not found")
    const original = list[index]
    const next = edit(original)
    if (next) list[index] = next
    else list.splice(index, 1)
    await writeJSON(LIST_KEY, list)
    return next ?? original
  })
}

export const scheduleApi: ScheduleApi = {
  list: async (from, to) => {
    const [start, end] = [from.toISOString(), to.toISOString()]
    return (await readAll())
      .filter((e) => e.startAt >= start && e.startAt < end)
      .sort((a, b) => a.startAt.localeCompare(b.startAt))
  },

  create: async (params: ScheduleParams) => {
    const id = await nextId(ID_COUNTER)
    const entry: ScheduledWorkout = {
      id,
      title: params.title.trim(),
      programDay: params.programDay ?? null,
      startAt: new Date(params.startAt).toISOString(),
      durationMin: params.durationMin ?? 60,
      reminderMinutes: params.reminderMinutes ?? null,
      alarm: params.alarm ?? false,
      status: "accepted",
      scheduledBy: null,
    }
    await withLock(LIST_KEY, async () => writeJSON(LIST_KEY, [...(await readAll()), entry]))
    return entry
  },

  update: (id, patch) =>
    change(id, (e) => ({
      ...e,
      ...patch,
      ...(patch.title !== undefined && { title: patch.title.trim() }),
      ...(patch.startAt !== undefined && { startAt: new Date(patch.startAt).toISOString() }),
    })),

  accept: (id) => change(id, (e) => ({ ...e, status: "accepted" })),
  cancel: (id) => change(id, () => null),
  remove: async (id) => {
    await change(id, () => null)
  },
}
