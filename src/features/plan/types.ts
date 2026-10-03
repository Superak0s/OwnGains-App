export type { SavedProgram } from "@shared/types"
export type { Exercise as ExercisePayload } from "@shared/types"
import type { Exercise } from "@shared/types"

/** The exercise fields `PATCH /api/program/exercise/machine` accepts. */
/** `null` on a machine selection clears it, and `undefined` leaves it untouched. */
export type MachinePatch = Pick<
  Exercise,
  "machines" | "bestAcrossMachines" | "machineMeta"
> & {
  selectedMachine?: string | null
  defaultMachine?: string | null
}

export interface WdDay {
  dayNumber?: number;
  dayTitle?: string;
  exercises?: Array<{
    name?: string;
    exerciseId?: string;
    primaryMuscles?: string[];
    secondaryMuscles?: string[];
    setsBySplit?: Record<string, number>;
    reps?: string;
  }>;
}

export interface SplitDayDraft {
  /** Stable across reorders and removals so row state follows the day, not its position. */
  id: string;
  /** Index of the program day this draft edits, absent for a day being added. */
  dayIdx?: number;
  dayTitle: string;
  exercises: {
    name: string;
    exerciseId: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    sets: string;
    reps: string;
  }[];
}
