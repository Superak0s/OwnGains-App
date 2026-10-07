/** Edge-case data that has crashed screens in production. */
import type { Exercise, User, WorkoutData, WorkoutSession } from "@shared/types"
import type { Friend } from "@features/friends/types"

const exercise = (name: string, sets = 3): Exercise => ({
  name,
  exerciseId: null,
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  sets,
  reps: "8-12",
})

export const user: User = { id: "u1", username: "tester", name: "Tester", heightCm: 180, bfFormulaSex: "male" }

export const emptyAccount = {
  user: { id: "u2", username: "newbie" } as User,
  workoutData: null,
  selectedSplit: null,
  sessions: [] as WorkoutSession[],
}

export const program: WorkoutData = {
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      split: {
        A: { exercises: [exercise("Bench Press"), exercise("Overhead Press")], totalSets: 6 },
        B: { exercises: [exercise("Incline Press")], totalSets: 3 },
      },
    },
    {
      dayNumber: 2,
      dayTitle: "Pull",
      split: { A: { exercises: [exercise("Row", 4)], totalSets: 4 }, B: { exercises: [], totalSets: 0 } },
    },
  ],
  totalDays: 2,
  split: ["A", "B"],
}

export const noPlanSelected = { workoutData: program, selectedSplit: null }

export const programWithEmptyDay: WorkoutData = {
  days: [
    program.days[0],
    { dayNumber: 2, dayTitle: "Rest", split: { A: { exercises: [], totalSets: 0 } } },
  ],
  totalDays: 2,
  split: ["A"],
}

export const localSessions: WorkoutSession[] = [
  {
    id: "local_1700000000000",
    split: "A",
    dayNumber: 1,
    startTime: "2026-10-01T10:00:00.000Z",
    endTime: "2026-10-01T11:00:00.000Z",
    setTimings: [
      { setIndex: 0, exerciseName: "Bench Press", endTime: "2026-10-01T10:05:00.000Z", weight: 80, reps: 8 },
    ],
  },
]

/** Older app versions stored sessions without endTime, split or setTimings. */
export const legacySessions = [
  { id: 42, startTime: "2025-01-01T10:00:00.000Z" },
  { id: "43", createdAt: "2025-01-02T10:00:00.000Z", dayNumber: 1, setCount: 0 },
] as WorkoutSession[]

export const traineeWithNoProgram = {
  actAs: { userId: "t1", username: "trainee" },
  workoutData: null,
  selectedSplit: null,
}

export const friend: Friend = { id: 7, username: "buddy", createdAt: "2026-01-01T00:00:00.000Z" }

/** A friend who shares nothing: every shared-data fetch comes back empty. */
export const friendWithNoSharedData = {
  friend,
  sharedProgram: null,
  sharedSessions: [] as WorkoutSession[],
  emptySession: { id: 99, split: "A", dayNumber: 1, startTime: "2026-10-01T10:00:00.000Z", setTimings: [] } as WorkoutSession,
}
