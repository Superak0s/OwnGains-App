import type { Exercise } from "@shared/types"
import { createEmitter } from "@utils/emitter"
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

/** Reads a socket message as a trainer event, or `null`. The server sends `sessionId` as a number. */
export const toTrainerEvent = (msg: unknown): TrainerEvent | null => {
  if (!msg || typeof msg !== "object") return null
  const m = msg as Record<string, unknown>
  const ok =
    TRAINER_EVENT_TYPES.has(m.type as string) &&
    typeof m.traineeId === "string" &&
    typeof m.trainerId === "string" &&
    typeof m.trainerUsername === "string" &&
    (typeof m.sessionId === "string" || typeof m.sessionId === "number")
  return ok ? ({ ...m, sessionId: String(m.sessionId) } as TrainerEvent) : null
}

export const onTrainerEvent = createEmitter<TrainerEvent>()

export interface TraineeOption {
  userId: string
  username: string
}

let activeTrainee: TraineeOption | null = null
let traineeOwnerId: string | null = null
const traineeChange = createEmitter<TraineeOption | null>()
export const onActiveTraineeChange = { subscribe: traineeChange.subscribe }

const emitTrainee = (trainee: TraineeOption | null): void => {
  activeTrainee = trainee
  traineeChange.trigger(trainee)
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

/** A workout started on a session-only day, outside the plan. */
export interface CustomWorkout {
  dayTitle: string
  exercises: Exercise[]
}

export interface TraineeStart {
  start: CustomWorkout | null
  split?: string
}

let pendingStart: (TraineeStart & { traineeId: string }) | null = null

/** Hands the next act-as Workout screen for `traineeId` a workout to start, or a plan split to switch to. */
export const queueTraineeStart = (traineeId: string, start: CustomWorkout | null, split?: string): void => {
  pendingStart = start || split ? { traineeId, start, split } : null
}

export const takeTraineeStart = (traineeId: string): TraineeStart | null => {
  if (pendingStart?.traineeId !== traineeId) return null
  const { start, split } = pendingStart
  pendingStart = null
  return { start, split }
}
