export type { CompletedDays } from "@shared/types";

/** The fields of a plan exercise the analytics code actually reads. */
export interface PlannedExercise {
  name: string;
  exerciseId?: string | null;
  machineName?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

export interface ExerciseMeta {
  name: string;
  exerciseName: string;
  exerciseId: string | null;
  machineName: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  days: Array<{ dayNumber: number; exerciseIndex: number }>;
  totalSets: number;
}

export interface ExerciseHistoryEntry {
  date: Date;
  exerciseName: string;
  weight: number;
  reps: number;
  /** Effective weight moved per rep, net of assistance on assisted machines. */
  load: number;
  dayNumber: number;
  setNumber: number;
  source: "server" | "local";
  isAssisted: boolean;
  isWarmup: boolean;
  /** Only recorded server-side. Without it rest gaps include the set itself. */
  durationSec?: number;
}

export interface ExerciseStats {
  totalSets: number;
  totalWorkouts: number;
  extremeWeight: number;
  extremeWeightLabel: string;
  maxReps: number;
  avgWeight: number;
  avgReps: number;
  lastWorkout: Date | null;
  isAssisted: boolean;
}
