import { STORAGE_KEYS, loadFromStorage } from "@shared/services/storage"
import type { WidgetInstance } from "@shared/types"

/** Every widget board a skin can carry, by its stable id in the skin format. */
export const SKIN_BOARDS = {
  home: { storageKey: STORAGE_KEYS.HOME_WIDGETS, label: "Home" },
  workout: { storageKey: STORAGE_KEYS.WORKOUT_WIDGETS, label: "Workout" },
  plan: { storageKey: STORAGE_KEYS.PLAN_WIDGETS, label: "Plan" },
  analytics: { storageKey: STORAGE_KEYS.ANALYTICS_WIDGETS, label: "Analytics" },
  "tracking.weight": { storageKey: STORAGE_KEYS.WEIGHT_TAB_WIDGETS, label: "Tracking: Weight" },
  "tracking.photos": { storageKey: STORAGE_KEYS.PHOTOS_TAB_WIDGETS, label: "Tracking: Photos" },
  "tracking.macros": { storageKey: STORAGE_KEYS.MACROS_TAB_WIDGETS, label: "Tracking: Macros" },
  "tracking.bodyfat": { storageKey: STORAGE_KEYS.BODYFAT_TAB_WIDGETS, label: "Tracking: Body fat" },
  "tracking.measurements": { storageKey: STORAGE_KEYS.MEASUREMENTS_TAB_WIDGETS, label: "Tracking: Measurements" },
  "tracking.hydration": { storageKey: STORAGE_KEYS.HYDRATION_TAB_WIDGETS, label: "Tracking: Hydration" },
  "tracking.soreness": { storageKey: STORAGE_KEYS.SORENESS_TAB_WIDGETS, label: "Tracking: Soreness" },
  "tracking.menstrual": { storageKey: STORAGE_KEYS.MENSTRUAL_TAB_WIDGETS, label: "Tracking: Cycle" },
  "tracking.health": { storageKey: STORAGE_KEYS.HEALTH_TAB_WIDGETS, label: "Tracking: Health" },
  "friends.friends": { storageKey: STORAGE_KEYS.FRIENDS_TAB_WIDGETS, label: "Friends" },
  "friends.requests": { storageKey: STORAGE_KEYS.REQUESTS_TAB_WIDGETS, label: "Friends: Requests" },
  "trainer.clients": { storageKey: STORAGE_KEYS.TRAINER_CLIENTS_WIDGETS, label: "Trainer: Clients" },
  "trainer.clientPage": { storageKey: STORAGE_KEYS.TRAINER_CLIENT_PAGE_WIDGETS, label: "Trainer: Client page" },
} as const

export type SkinBoardId = keyof typeof SKIN_BOARDS

export const SKIN_BOARD_IDS = Object.keys(SKIN_BOARDS) as SkinBoardId[]

export const isSkinBoardId = (id: string): id is SkinBoardId => Object.hasOwn(SKIN_BOARDS, id)

/** Every board this user has arranged. Boards still on their defaults are left out. */
export async function storedBoards(userId: string | null): Promise<Partial<Record<SkinBoardId, WidgetInstance[]>>> {
  const boards: Partial<Record<SkinBoardId, WidgetInstance[]>> = {}
  for (const id of SKIN_BOARD_IDS) {
    const list = await loadFromStorage<WidgetInstance[]>(SKIN_BOARDS[id].storageKey, userId)
    if (list?.length) boards[id] = list
  }
  return boards
}
