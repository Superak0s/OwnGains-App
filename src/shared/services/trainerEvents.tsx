import { loadFromStorage, saveToStorage } from "./storage"

export const ACTIVE_TRAINEE_KEY = "@active_trainee"

export type TrainerEventType =
  | "trainer_set_recorded"
  | "trainee_set_recorded"
  | "trainer_session_started"
  | "trainer_session_ended"

export interface TrainerEvent {
  type: TrainerEventType
  traineeId: string
  trainerId: string
  trainerUsername: string
  sessionId: string
}

const TRAINER_EVENT_TYPES = new Set<string>([
  "trainer_set_recorded",
  "trainee_set_recorded",
  "trainer_session_started",
  "trainer_session_ended",
])

export const isTrainerEvent = (msg: unknown): msg is TrainerEvent => {
  if (!msg || typeof msg !== "object") return false
  const m = msg as Record<string, unknown>
  return (
    TRAINER_EVENT_TYPES.has(m.type as string) &&
    typeof m.traineeId === "string" &&
    typeof m.trainerId === "string" &&
    typeof m.trainerUsername === "string" &&
    typeof m.sessionId === "string"
  )
}

// ponytail: inline pub/sub, same pattern as appMode's
const listeners: ((e: TrainerEvent) => void)[] = []
export const onTrainerEvent = {
  subscribe: (fn: (e: TrainerEvent) => void) => {
    listeners.push(fn)
    return () => { listeners.splice(listeners.indexOf(fn), 1) }
  },
  trigger: (e: TrainerEvent) => listeners.forEach(fn => fn(e)),
}

export interface TraineeOption {
  userId: string
  username: string
}

let activeTrainee: TraineeOption | null = null
let traineeOwnerId: string | null = null
const traineeListeners = new Set<(t: TraineeOption | null) => void>()

const emitTrainee = (trainee: TraineeOption | null): void => {
  activeTrainee = trainee
  traineeListeners.forEach(fn => fn(trainee))
}

export const getActiveTrainee = (): TraineeOption | null => activeTrainee

export const setActiveTrainee = (trainee: TraineeOption | null): void => {
  void saveToStorage(ACTIVE_TRAINEE_KEY, trainee, traineeOwnerId)
  emitTrainee(trainee)
}

// A trainer session is expected to last longer than the process (the trainer puts the
// phone down mid-set), so it is restored per user on load rather than re-picked.
export const restoreActiveTrainee = async (
  userId: string | null,
): Promise<void> => {
  traineeOwnerId = userId
  emitTrainee(
    userId
      ? await loadFromStorage<TraineeOption>(ACTIVE_TRAINEE_KEY, userId)
      : null,
  )
}

export const onActiveTraineeChange = {
  subscribe: (fn: (t: TraineeOption | null) => void) => {
    traineeListeners.add(fn)
    return () => { traineeListeners.delete(fn) }
  },
}
