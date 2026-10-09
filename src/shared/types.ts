export interface User {
  id: string;
  username: string;
  email?: string;
  name?: string;
  /** Server-granted. Absent in offline mode, where there is no admin. */
  isAdmin?: boolean;
  heightCm?: number | null;
  bfFormulaSex?: "male" | "female" | null;
  /** Terms version the server has on record, absent offline and on servers without /consent. */
  termsVersion?: string | null;
  /** When the server recorded health-data consent. null = none, absent = server doesn't report it. */
  healthConsentAt?: string | null;
  /** false for an account created through Google sign-in. Absent offline and on older servers. */
  hasPassword?: boolean;
  googleLinked?: boolean;
  [key: string]: unknown;
}

/**
 * `exerciseId` for an exercise the user has said has no database entry, as
 * opposed to null/absent, which means "not matched yet, ask about it". It
 * rides on `exerciseId` because that is the only field the server round-trips
 * that can store the answer. A separate flag is dropped by /api/program/upload.
 */
export const CUSTOM_EXERCISE_ID = "custom";

export interface Exercise {
  name: string;
  /** Canonical exercise database id, or CUSTOM_EXERCISE_ID. Null = unmatched. */
  exerciseId?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  /** Machines/setups this exercise can be run on, e.g. ["Machine A", "Smith"]. */
  machines?: string[];
  /** The machine in use, stamped onto each set as `machineName`. */
  selectedMachine?: string;
  /** Machine selected when the exercise is opened with no explicit choice. */
  defaultMachine?: string;
  /** Best stats pool every machine instead of just the selected one. */
  bestAcrossMachines?: boolean;
  /** Per-machine note and pin/seat setting, keyed by machine name. */
  machineMeta?: Record<string, MachineMeta>;
  sets: number;
  /** Target reps as written by the user: "10" or a range like "8-12". */
  reps?: string;
}

export interface MachineMeta {
  note?: string;
  pin?: number;
}

export interface SplitWorkout {
  exercises: Exercise[];
  totalSets: number;
}
export interface ExerciseWithSets {
  name: string;
  exerciseId?: string | null;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  machines?: string[];
  selectedMachine?: string;
  defaultMachine?: string;
  bestAcrossMachines?: boolean;
  setsBySplit: Record<string, number>;
  /** Target reps as written by the user: "10" or a range like "8-12". */
  reps?: string;
}
export interface WorkoutDay {
  dayNumber: number;
  dayTitle?: string;
  exercises?: ExerciseWithSets[];
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  split: Record<string, SplitWorkout>;
}

export interface WorkoutData {
  days: WorkoutDay[];
  /** Total number of days. May be present on the object returned by uploadAndSave */
  totalDays?: number;
  /** Splits listed in the program. May be present on the object returned by uploadAndSave */
  split?: string[];
}

export interface SetDetail {
  weight: number;
  reps: number;
  completedAt: string;
  note: string;
  isWarmup: boolean;
  source?: string;
  /** Machine this set was performed on, so best stats can split by it. */
  machineName?: string;
  /** Reps in reserve, 0-9: how many more reps the set had left. */
  rir?: number;
}

export type CompletedSets = Record<number, SetDetail>;
export type CompletedExercises = Record<number, CompletedSets>;
export type CompletedDays = Record<number, CompletedExercises>;
export type LockedDays = Record<number, boolean>;

export interface SessionStatistics {
  totalTime: number;
  averageRest: number;
  currentRest: number;
  completedSets: number;
  totalSets: number;
}

/** Lightweight session row returned by getSessionHistory */
export interface WorkoutSession {
  id: string | number;
  split?: string;
  dayNumber?: number;
  startTime?: string;
  createdAt?: string;
  endTime?: string;
  /** May be present on summary rows */
  setCount?: number;
  totalDuration?: number;
  completedSets?: number;
  dayTitle?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  /** Only populated when the history request includes timings */
  setTimings?: SetTiming[];
}

/** Full session detail returned by getSession */
export interface SetTiming {
  id?: string | number;
  exerciseName?: string;
  setIndex: number;
  startTime?: string;
  endTime: string;
  weight?: number;
  reps?: number;
  note?: string;
  isWarmup?: boolean;
  /** Reps in reserve, 0-9: how many more reps the set had left. */
  rir?: number;
  /** Machine the set was performed on. Absent on older, untracked sets. */
  machineName?: string;
  /** Duration in seconds for the set */
  setDuration?: number;
  exerciseId?: string | number;
  exercisePrimaryMuscles?: string[];
  exerciseSecondaryMuscles?: string[];
}

export interface FullSession {
  id: string | number;
  dayNumber: number;
  endTime?: string;
  setTimings?: SetTiming[];
}

/** Enriched session detail with grouped exercises, built client-side */
export interface GroupedExercise {
  exerciseName: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  sets: SetTiming[];
}

export interface FullSessionWithGroups extends FullSession {
  groupedExercises?: GroupedExercise[];
  startTime?: string;
  totalDuration?: number;
  completedSets?: number;
  dayTitle?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

export interface SavedProgram {
  success: boolean;
  totalDays: number;
  split: string[];
  days: WorkoutDay[];
  originalFilename?: string;
}

export interface WeightEntry {
  id: string | number;
  weightKg: string | number;
  recordedAt: string;
  unit?: string;
}

export interface WeightHistoryResponse {
  entries: WeightEntry[];
}

export interface HeightData {
  heightCm: number;
  unit?: string;
}

export interface MacrosEntry {
  id: string | number;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  calories?: number | null;
  loggedAt?: string;
  name?: string;
}

export interface BodyFatEntry {
  id: string | number;
  bodyFatPercentage?: number;
  date?: string;
  waistCm?: number;
  neckCm?: number;
  hipCm?: number;
  measurementUnit?: string;
  gender?: string | null;
  recordedAt?: string;
  calculatedAt?: string;
}

export interface ProgressPhoto {
  id: string | number;
  takenAt?: string;
  uri?: string;
}

interface StartSessionSyncData {
  split: string;
  dayNumber: number;
  dayTitle?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

interface RecordSetSyncData {
  sessionId: string | number;
  exerciseName?: string;
  exerciseIndex?: number;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  setIndex: number;
  startTime: string;
  endTime: string;
  weight: number;
  reps: number;
  note?: string;
  isWarmup?: boolean;
  rir?: number;
  machineName?: string;
}

interface EndSessionSyncData {
  sessionId: string | number;
}

interface UpdateSessionDaySyncData {
  sessionId: string | number;
  dayNumber: number;
  dayTitle?: string;
}

export type PendingSync =
  | {
      type: "startSession";
      syncId?: string;
      localSessionId?: string;
      data: StartSessionSyncData;
      timestamp: string;
    }
  | {
      type: "recordSet";
      syncId?: string;
      localSessionId?: string;
      data: RecordSetSyncData;
      timestamp: string;
    }
  | {
      type: "endSession";
      syncId?: string;
      localSessionId?: string;
      data: EndSessionSyncData;
      timestamp: string;
    }
  | {
      type: "updateSessionDay";
      syncId?: string;
      localSessionId?: string;
      data: UpdateSessionDaySyncData;
      timestamp: string;
    };

export type RootStackParamList = {
  Onboarding: undefined;
  Home: undefined;
  Login: undefined;
  Signup: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
  PrivacyConsent: undefined;
  Workout: undefined;
  Tracking: undefined;
  Friends: undefined;
  Settings: undefined;
  Analytics: undefined;
  Supplements: undefined;
  Plan: undefined;
};

export type WidgetSize = "small" | "medium" | "large";

export interface WidgetDefinition<T extends string = string> {
  type: T;
  title?: string;
  description: string;
  icon?: string;
  availableSizes: WidgetSize[];
  defaultSize: WidgetSize;
}

export interface WidgetInstance<T extends string = string> {
  /** stable unique id for this placed instance, not the widget type */
  id: string;
  type: T;
  size: WidgetSize;
  order: number;
}

/**
 * A screen's starting board: the widget types it opens with, in order, each at
 * its registry default size. Ids must stay derived from the type, because an existing
 * install's persisted layout is matched against them.
 */
export function toDefaultWidgets<T extends string>(
  registry: Record<T, WidgetDefinition<T>>,
  types: T[],
): WidgetInstance<T>[] {
  return types.map((type, order) => ({
    id: `default-${type.replaceAll("_", "-")}`,
    type,
    size: registry[type].defaultSize,
    order,
  }));
}

export const RECOVERY_MUSCLE_GROUPS = [
  "chest_upper",
  "chest_lower",
  "back_upper",
  "back_lower",
  "lats",
  "traps",
  "neck",
  "shoulders_front",
  "shoulders_side",
  "shoulders_rear",
  "biceps",
  "triceps",
  "forearms",
  "abs_upper",
  "abs_lower",
  "obliques",
  "lower_back",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "adductors",
  "abductors",
  "hip_flexors",
] as const;

export type RecoveryMuscleGroup = (typeof RECOVERY_MUSCLE_GROUPS)[number];

/** Human-readable labels for recovery muscle groups. */
export const MUSCLE_GROUP_LABELS: Record<RecoveryMuscleGroup, string> = {
  chest_upper: "Upper Chest",
  chest_lower: "Lower Chest",
  back_upper: "Upper Back",
  back_lower: "Lower Back",
  lats: "Lats",
  traps: "Traps",
  neck: "Neck",
  shoulders_front: "Front Delts",
  shoulders_side: "Side Delts",
  shoulders_rear: "Rear Delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  abs_upper: "Upper Abs",
  abs_lower: "Lower Abs",
  obliques: "Obliques",
  lower_back: "Lower Back",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  calves: "Calves",
  adductors: "Adductors",
  abductors: "Abductors",
  hip_flexors: "Hip Flexors",
} as const;
