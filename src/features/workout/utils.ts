import type { ThemeColors } from "@shared/context/ThemeContext";
import { darken, isDarkColor } from "@utils/color";
import type { PartnerProgress } from "@shared/context/hooks/useJointSession";
import type { Exercise, MachineMeta, WorkoutSession } from "@shared/types";
import {
  getCanonicalName,
  normalizeExerciseName,
} from "@utils/exerciseMatching";
import { filterExercises, matchExercise } from "@utils/exerciseDb";
import { estimateOneRepMax } from "@utils/oneRepMax";
import { recordSessionsOutside } from "@utils/recordSets";
import { log, metric } from "@shared/services/crashReporting";

export const LBS_TO_KG = 0.45359237;
export const KG_TO_LBS = 2.20462262;

/** Convert a kg value (as stored) to the display unit, rounded to 1 dp. */
export function kgToDisplay(kg: number, unit: "kg" | "lbs"): string {
  if (unit === "lbs") {
    return (kg * KG_TO_LBS).toFixed(1);
  }
  return kg % 1 === 0 ? String(kg) : kg.toFixed(1);
}

/** Heaviest load accepted from the weight input, in kg. */
export const MAX_WEIGHT_KG = 1000;

/** Most reps accepted from the rep input. */
export const MAX_REPS = 100;

/**
 * Whole reps only: `Number.parseInt` reads "8.5" as 8 and "12kg" as 12, so a
 * typo silently logs a different set than the one performed.
 */
export function parseReps(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= MAX_REPS ? n : null;
}

/**
 * Strict numeric parse for weight inputs: accepts a comma decimal separator
 * (comma-decimal keyboards) and rejects anything with trailing junk, which
 * `Number.parseFloat` would silently truncate instead.
 */
export function parseDecimal(value: string): number | null {
  const trimmed = value.trim().replace(",", ".");
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse a user-entered string in the chosen unit and return kg for storage. */
export function displayToKg(value: string, unit: "kg" | "lbs"): number {
  const n = parseDecimal(value);
  if (n === null || n <= 0) return 0;
  return unit === "lbs" ? n * LBS_TO_KG : n;
}

/** The reason a weight entry is unusable, or null when it is fine. */
export function validateWeightInput(
  value: string,
  unit: "kg" | "lbs",
): string | null {
  if (value.trim() === "") return null;
  if (parseDecimal(value) === null) return "Enter a number, e.g. 80 or 82.5";
  if (displayToKg(value, unit) > MAX_WEIGHT_KG) {
    return `That's over ${kgToDisplay(MAX_WEIGHT_KG, unit)} ${unit}. Check the number.`;
  }
  return null;
}

// Outside edit mode the day-status widgets are fused into one seamless card,
// so every widget in the group must round its outer corners by the same amount.
export const WIDGET_GROUP_RADIUS = 14;

/** The machine an exercise is currently running on, or null for none chosen. */
export function activeMachine(exercise: {
  selectedMachine?: string;
  defaultMachine?: string;
}): string | null {
  return exercise.selectedMachine ?? exercise.defaultMachine ?? null;
}

/** Move a machine's note/pin to its new name. An empty entry drops it. */
export function editMachineMeta(
  meta: Record<string, MachineMeta> | undefined,
  from: string,
  to: string,
  entry: MachineMeta,
): Record<string, MachineMeta> {
  const next = { ...meta };
  delete next[from];
  if (entry.note || entry.pin !== undefined) next[to] = entry;
  return next;
}

type EmptyStateInfo = {
  icon: string;
  title: string;
  text: string;
  actionLabel?: string;
  actionTab?: "Home" | "Plan";
};

export function getEmptyStateInfo(
  workoutData: unknown,
  selectedSplit: string | null,
  dayWorkout: unknown,
  currentDay: number,
  traineeName?: string,
): EmptyStateInfo | null {
  if (traineeName) {
    if (!workoutData)
      return {
        icon: "📁",
        title: "No Workout Plan",
        text: `${traineeName} hasn't set up a workout program yet.`,
      };
    if (!selectedSplit)
      return {
        icon: "👤",
        title: "No Split Selected",
        text: `${traineeName} hasn't picked a split yet.`,
      };
    if (!dayWorkout)
      return {
        icon: "🤷",
        title: "No Workout for This Day",
        text: `${selectedSplit} has no exercises scheduled for Day ${currentDay}.`,
      };
    return null;
  }
  if (!workoutData) {
    return {
      icon: "📁",
      title: "No Workout Plan",
      text: "Upload a workout file to get started.",
      actionLabel: "Go to Plan Screen",
      actionTab: "Plan",
    };
  }
  if (!selectedSplit) {
    return {
      icon: "👤",
      title: "No Split Selected",
      text: "Pick a split to see the exercises for each day.",
      actionLabel: "Go to Plan",
      actionTab: "Plan",
    };
  }
  if (!dayWorkout) {
    return {
      icon: "🤷",
      title: "No Workout for This Day",
      text: `${selectedSplit} has no exercises scheduled for Day ${currentDay}`,
      actionLabel: "Edit this split",
      actionTab: "Plan",
    };
  }
  return null;
}

// Dark palettes define accent/success as light foreground colors meant to sit
// *on* a dark background, so painting the whole day-overview group with one
// glares. Darkening keeps each state distinguishable without the glow.
const DARK_TINT_AMOUNT = 0.55;

export function getDayOverviewTint(
  colors: ThemeColors,
  isCurrentDayLocked: boolean,
  setsCompleteAndUnlocked: boolean,
): string {
  let base = colors.accent;
  if (isCurrentDayLocked) base = colors.textSecondary;
  else if (setsCompleteAndUnlocked) base = colors.success;
  return isDarkColor(colors.background) ? darken(base, DARK_TINT_AMOUNT) : base;
}

/** Text/foreground color that remains legible on getDayOverviewTint's fill. */
export function getDayOverviewTextColor(colors: ThemeColors): string {
  return isDarkColor(colors.background) ? colors.textPrimary : colors.surface;
}

export function computeProgressPercentage(
  completedSetsCount: number,
  totalSetsCount: number,
): number {
  return totalSetsCount > 0 ? (completedSetsCount / totalSetsCount) * 100 : 0;
}

export function getAddingSetsSubtitle(
  addingSetsExercise: Record<string, unknown> | null,
): string | undefined {
  if (!addingSetsExercise) return undefined;
  const exercise = addingSetsExercise.exercise as { name?: string } | undefined;
  if (!exercise?.name) return undefined;
  return `Adding sets to: ${exercise.name}`;
}

export function isAssistedExercise(name: string): boolean {
  return name.toLowerCase().includes("assisted");
}

export function checkIsSelectedSetAssisted(
  selectedSet: { exerciseIndex: number; setIndex: number } | null,
  dayWorkout: { exercises: Exercise[] } | null,
): boolean {
  if (!selectedSet || !dayWorkout) return false;
  const exercise = dayWorkout.exercises[selectedSet.exerciseIndex];
  return !!exercise && isAssistedExercise(exercise.name);
}

type PerformanceEntry = {
  date: Date;
  weight: number;
  reps: number;
  oneRepMax: number;
  note: string;
  isWarmup: boolean;
};

function toPerformanceEntry(
  completedAt: string | number | Date | undefined,
  weight: number | undefined,
  reps: number | undefined,
  note: string | undefined,
  isWarmup: boolean | undefined,
): PerformanceEntry {
  const w = weight ?? 0;
  const r = reps ?? 0;
  return {
    date: new Date(completedAt ?? Date.now()),
    weight: Number.isFinite(w) ? w : 0,
    reps: Number.isFinite(r) ? r : 0,
    oneRepMax: estimateOneRepMax(w, r),
    note: note || "",
    isWarmup: Boolean(isWarmup),
  };
}

type StoredSets = Record<
  string,
  {
    weight?: number;
    reps?: number;
    completedAt?: string;
    note?: string;
    isWarmup?: boolean;
    machineName?: string;
  }
>;

// A null filter means "every machine counts". A string keeps only the sets
// recorded on that machine. Sets logged before machines were tracked carry
// none, so they stay with whichever machine the exercise is set to now.
export type MachineFilter = string | null;

const matchesMachine = (
  recorded: string | undefined,
  filter: MachineFilter,
): boolean => filter === null || !recorded || recorded === filter;

function collectSetsForExercise(
  sets: StoredSets | undefined,
  machine: MachineFilter,
): PerformanceEntry[] {
  if (!sets) return [];
  return Object.values(sets)
    .filter((s) => matchesMachine(s.machineName, machine))
    .map((s) =>
      toPerformanceEntry(s.completedAt, s.weight, s.reps, s.note, s.isWarmup),
    );
}

function getSetsForDayExercise(
  workoutData: { days: Array<Record<string, any>> } | null | undefined,
  selectedSplit: string | null,
  completedDays: Record<string, Record<number, Record<string, unknown>>>,
  dayNumber: string,
  canonicalName: string,
  allExerciseNames: string[],
  machine: MachineFilter,
): PerformanceEntry[] {
  const day = workoutData?.days.find(
    (d) => d.dayNumber === Number.parseInt(dayNumber, 10),
  );
  const pw = day && selectedSplit ? day.split[selectedSplit] : null;
  if (!pw?.exercises) return [];

  const entries: PerformanceEntry[] = [];
  pw.exercises.forEach((ex: { name: string }, exerciseIndex: number) => {
    if (
      getCanonicalName(ex.name, allExerciseNames).toLowerCase() !==
      canonicalName.toLowerCase()
    )
      return;
    const sets = completedDays[dayNumber]?.[exerciseIndex] as
      | StoredSets
      | undefined;
    entries.push(...collectSetsForExercise(sets, machine));
  });
  return entries;
}

export function getLocalHistoryEntries(
  completedDays: Record<string, Record<number, Record<string, unknown>>>,
  workoutData: { days: Array<Record<string, any>> } | null | undefined,
  selectedSplit: string | null,
  canonicalName: string,
  allExerciseNames: string[],
  machine: MachineFilter = null,
): PerformanceEntry[] {
  return Object.keys(completedDays).flatMap((dayNumber) =>
    getSetsForDayExercise(
      workoutData,
      selectedSplit,
      completedDays,
      dayNumber,
      canonicalName,
      allExerciseNames,
      machine,
    ),
  );
}

function collectSessionTimings(
  session: WorkoutSession,
  exerciseName: string,
  canonicalName: string,
  allExerciseNames: string[],
  machine: MachineFilter,
): PerformanceEntry[] {
  if (!session?.setTimings) return [];
  return session.setTimings
    .filter((t) => {
      const timingName = t.exerciseName || exerciseName || "";
      return (
        getCanonicalName(timingName, allExerciseNames).toLowerCase() ===
          canonicalName.toLowerCase() && matchesMachine(t.machineName, machine)
      );
    })
    .map((t) =>
      toPerformanceEntry(
        t.endTime ?? session.endTime ?? session.startTime,
        t.weight,
        t.reps,
        t.note,
        t.isWarmup,
      ),
    );
}

export async function getServerHistoryEntries(
  fetchSessionHistory: (
    limit: number,
    flag: boolean,
  ) => Promise<WorkoutSession[]>,
  exerciseName: string,
  canonicalName: string,
  allExerciseNames: string[],
  machine: MachineFilter = null,
  fetchRecordSessions?: () => Promise<WorkoutSession[] | null>,
): Promise<PerformanceEntry[] | null> {
  try {
    const [window, records] = await Promise.all([
      fetchSessionHistory(50, true),
      fetchRecordSessions?.() ?? null,
    ]);
    const sessions = [
      ...(window ?? []),
      ...recordSessionsOutside(window ?? [], records),
    ];
    if (!sessions.length) return [];
    return sessions.flatMap((session) =>
      collectSessionTimings(
        session,
        exerciseName,
        canonicalName,
        allExerciseNames,
        machine,
      ),
    );
  } catch (err) {
    console.warn(
      "Failed to fetch server session history for performance:",
      err,
    );
    metric.count("workout.session_history_fetch_failed");
    log.warn("workout.session_history_fetch_failed");
    return null;
  }
}

export function pickBestPerformanceSummary(history: PerformanceEntry[]): {
  last: PerformanceEntry;
  best: PerformanceEntry;
  totalAttempts: number;
} | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const prev = history.filter((e) => e.date < today && !e.isWarmup);
  if (!prev.length) return null;

  prev.sort((a, b) => b.date.getTime() - a.date.getTime());
  const last = prev[0];
  // Reps break the tie so bodyweight movements, whose estimated 1RM is always
  // 0, still have a usable best.
  const best = prev.reduce(
    (b, c) =>
      c.oneRepMax > b.oneRepMax ||
      (c.oneRepMax === b.oneRepMax && c.reps > b.reps)
        ? c
        : b,
    prev[0],
  );
  return { last, best, totalAttempts: prev.length };
}

function getPartnerExerciseLabel(progress: PartnerProgress): string {
  if (progress.exerciseName) return progress.exerciseName;
  if (progress.exerciseIndex != null) return `Ex ${progress.exerciseIndex + 1}`;
  return "—";
}

export function getPartnerStatusText(
  isPartnerReady: boolean,
  partnerProgress: PartnerProgress | null,
): string {
  if (isPartnerReady) return "✅ Ready for next set";
  if (!partnerProgress) return "Waiting…";
  const setLabel =
    partnerProgress.setIndex == null
      ? "—"
      : `Set ${partnerProgress.setIndex + 1}`;
  return `${getPartnerExerciseLabel(partnerProgress)} · ${setLabel}`;
}

/** Smallest plate pair on a standard barbell, and the step every gym has. */
export const PROGRESSION_STEP_KG = 2.5;

/** Upper bound of a rep target written as "10" or "8-12", null when unusable. */
export function targetRepCeiling(reps: string | undefined): number | null {
  const numbers = (reps ?? "").match(/\d+/g);
  if (!numbers?.length) return null;
  const top = Math.max(...numbers.map(Number));
  return top > 0 ? top : null;
}

export type ProgressionSuggestion = {
  weightKg: number;
  reps: number;
  direction: "up" | "down" | "same";
  reason: string;
};

/**
 * Next-set load from the previous set of the same exercise. 0 RIR means the
 * set was a grinder, so back off. Hitting the top of the rep target with reps
 * still in reserve means add a step.
 */
export function suggestNextSetLoad(
  last: { weight: number; reps: number; rir?: number },
  targetReps: string | undefined,
  step: number = PROGRESSION_STEP_KG,
): ProgressionSuggestion | null {
  if (!(last.weight > 0 && last.reps > 0)) return null;

  const { rir } = last;
  if (rir !== undefined && rir <= 0) {
    const weightKg = Math.max(step, last.weight - step);
    if (weightKg >= last.weight) return null;
    return {
      weightKg,
      reps: last.reps,
      direction: "down",
      reason: "Last set was 0 RIR",
    };
  }

  const ceiling = targetRepCeiling(targetReps);
  if (
    ceiling !== null &&
    last.reps >= ceiling &&
    (rir === undefined || rir >= 2)
  )
    return {
      weightKg: last.weight + step,
      reps: ceiling,
      direction: "up",
      reason: `Hit ${ceiling} reps last set`,
    };

  if (ceiling === null && rir !== undefined && rir >= 3)
    return {
      weightKg: last.weight + step,
      reps: last.reps,
      direction: "up",
      reason: `Last set was ${rir} RIR`,
    };

  return null;
}

export function repsInReserveLabel(rir: number): string {
  if (rir === 0) return "0 RIR · couldn't have done another rep";
  return `${rir} RIR · ${rir} more ${rir === 1 ? "rep" : "reps"} left in the tank`;
}

export interface ExerciseMuscles {
  primary: string[];
  secondary: string[];
}

// The bundled database spells muscles in lower case ("middle back"), but plans
// use the capitalised canonical groups.
const titleCase = (text: string): string =>
  text.replace(/\b\w/g, (c) => c.toUpperCase());

/** Muscles for an exercise name: the plan's own entry takes precedence over the bundled database. */
export function resolveExerciseMuscles(
  name: string,
  planExercises: readonly Exercise[],
): ExerciseMuscles | null {
  const key = normalizeExerciseName(name);
  if (!key) return null;
  const planned = planExercises.find(
    (e) =>
      normalizeExerciseName(e.name ?? "") === key && e.primaryMuscles?.length,
  );
  if (planned) {
    return {
      primary: planned.primaryMuscles ?? [],
      secondary: planned.secondaryMuscles ?? [],
    };
  }
  const match = matchExercise(name);
  if (match.status !== "confident") return null;
  const { primaryMuscles, secondaryMuscles } = match.candidates[0].exercise;
  return {
    primary: primaryMuscles.map(titleCase),
    secondary: secondaryMuscles.map(titleCase),
  };
}

/** Bundled-database muscle names, in the order a lifter scans for them. */
export const BROWSE_MUSCLES = [
  "chest",
  "lats",
  "middle back",
  "lower back",
  "shoulders",
  "traps",
  "biceps",
  "triceps",
  "forearms",
  "quadriceps",
  "hamstrings",
  "glutes",
  "calves",
  "abdominals",
  "adductors",
  "abductors",
  "neck",
] as const;

export const muscleDisplayName = titleCase;

/**
 * Exercises that target `muscle`: the plan's own first, then the bundled
 * database. Stretches are left out, since they can't be logged as sets.
 */
export function exercisesForMuscle(
  muscle: string,
  planExercises: readonly Exercise[],
): { name: string; meta?: string }[] {
  const target = normalizeExerciseName(muscle);
  const seen = new Set<string>();
  const unique = <T extends { name: string }>(item: T): boolean => {
    const key = normalizeExerciseName(item.name);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  const fromPlan = planExercises
    .filter((e) =>
      (e.primaryMuscles ?? []).some((m) => normalizeExerciseName(m) === target),
    )
    .map((e) => ({ name: e.name.trim(), meta: "In your plan" }));
  const fromDb = filterExercises({ include: [target], limit: Infinity })
    .filter((e) => e.category !== "stretching")
    .map((e) => ({ name: e.name, meta: e.equipment ?? undefined }));
  return [...fromPlan, ...fromDb].filter(unique);
}
