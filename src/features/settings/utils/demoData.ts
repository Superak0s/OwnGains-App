import type { WorkoutData } from "@shared/types";
import type { WorkoutApi } from "@features/workout/services/workoutApiFactory";
import {
  buildProgramFromTemplate,
  type SplitTemplate,
} from "@features/plan/utils/splitTemplates";

export const DEMO_SPLIT = "Demo";

const DEMO_TEMPLATE: SplitTemplate = {
  id: "demo",
  name: "Demo Split",
  description: "Sample program seeded by demo mode",
  days: [
    {
      dayTitle: "Day 1 — Push",
      primaryMuscles: ["Chest", "Shoulders", "Triceps"],
      exercises: [
        { name: "Bench Press", primaryMuscles: ["Chest"], sets: 4 },
        { name: "Incline Dumbbell Press", primaryMuscles: ["Chest"], sets: 3 },
        { name: "Overhead Press", primaryMuscles: ["Shoulders"], sets: 3 },
        { name: "Triceps Pushdown", primaryMuscles: ["Triceps"], sets: 3 },
      ],
    },
    {
      dayTitle: "Day 2 — Pull",
      primaryMuscles: ["Back", "Biceps"],
      exercises: [
        { name: "Deadlift", primaryMuscles: ["Back"], sets: 3 },
        { name: "Pull Up", primaryMuscles: ["Back"], sets: 4 },
        { name: "Barbell Row", primaryMuscles: ["Back"], sets: 3 },
        { name: "Barbell Curl", primaryMuscles: ["Biceps"], sets: 3 },
      ],
    },
    {
      dayTitle: "Day 3 — Legs",
      primaryMuscles: ["Quads", "Hamstrings", "Calves"],
      exercises: [
        { name: "Back Squat", primaryMuscles: ["Quads"], sets: 4 },
        { name: "Romanian Deadlift", primaryMuscles: ["Hamstrings"], sets: 3 },
        { name: "Leg Press", primaryMuscles: ["Quads"], sets: 3 },
        { name: "Standing Calf Raise", primaryMuscles: ["Calves"], sets: 4 },
      ],
    },
  ],
};

export const buildDemoProgram = (split: string = DEMO_SPLIT): WorkoutData =>
  buildProgramFromTemplate(DEMO_TEMPLATE, [split]);

const DAY_MS = 86_400_000;
const SET_MS = 45_000;
const REST_MS = 150_000;
const DAYS_BETWEEN_SESSIONS = 2;
const DEFAULT_SESSION_COUNT = 18;

/** Deterministic: re-running the fill produces the same numbers, not noise. */
const baseWeight = (name: string): number => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 997;
  return 20 + (hash % 9) * 5;
};

const toPlate = (kg: number): number => Math.round(kg / 2.5) * 2.5;

export interface DemoFillResult {
  sessions: number;
  sets: number;
  friends: number;
  tracking: number;
}

export interface DemoDay {
  dayNumber: number;
  dayTitle: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  exercises: {
    name: string;
    sets: number;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
  }[];
}

/** The program days that have exercises in `split`, in the shape POST /api/sessions/demo takes. */
export const demoDays = (program: WorkoutData, split: string): DemoDay[] => {
  const days = (program.days ?? [])
    .filter((day) => (day.split?.[split]?.exercises?.length ?? 0) > 0)
    .map((day) => ({
      dayNumber: day.dayNumber,
      dayTitle: day.dayTitle || `Day ${day.dayNumber}`,
      primaryMuscles: day.primaryMuscles,
      secondaryMuscles: day.secondaryMuscles,
      exercises: day.split[split].exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        primaryMuscles: exercise.primaryMuscles,
        secondaryMuscles: exercise.secondaryMuscles,
      })),
    }));
  if (days.length === 0) {
    throw new Error(`No exercises found for split "${split}"`);
  }
  return days;
};

type SessionWriter = Pick<WorkoutApi, "startSession" | "recordSet" | "endSession">;

/**
 * Seeds finished workout sessions spread backwards over ~5 weeks, one every
 * other day, cycling through the program's days with a small weekly weight
 * progression so charts and trends have something to show. Used on-device
 * only: online, the server generates the same data from one request.
 */
export async function fillDemoSessions(
  api: SessionWriter,
  program: WorkoutData,
  split: string,
  sessionCount: number = DEFAULT_SESSION_COUNT,
  now: number = Date.now(),
): Promise<DemoFillResult> {
  const days = demoDays(program, split);
  const result: DemoFillResult = { sessions: 0, sets: 0, friends: 0, tracking: 0 };

  for (let i = 0; i < sessionCount; i++) {
    const day = days[i % days.length];
    const daysAgo = (sessionCount - i) * DAYS_BETWEEN_SESSIONS;
    const week = Math.floor((i * DAYS_BETWEEN_SESSIONS) / 7);
    let cursor = now - daysAgo * DAY_MS;

    const sessionId = await api.startSession(
      split,
      day.dayNumber,
      day.dayTitle,
      true,
      new Date(cursor).toISOString(),
    );

    for (const exercise of day.exercises) {
      for (let setIndex = 1; setIndex <= exercise.sets; setIndex++) {
        const setEnd = cursor + SET_MS;
        await api.recordSet(sessionId, {
          exerciseName: exercise.name,
          setIndex,
          startTime: new Date(cursor).toISOString(),
          endTime: new Date(setEnd).toISOString(),
          weight: toPlate(baseWeight(exercise.name) * (1 + 0.03 * week)),
          reps: Math.max(6, 11 - setIndex),
          note: "",
          isWarmup: false,
          primaryMuscles: exercise.primaryMuscles,
          secondaryMuscles: exercise.secondaryMuscles,
        });
        result.sets += 1;
        cursor = setEnd + REST_MS;
      }
    }

    await api.endSession(sessionId, new Date(cursor).toISOString());
    result.sessions += 1;
  }

  return result;
}
