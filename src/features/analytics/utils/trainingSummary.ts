import type { WorkoutData, SetTiming } from "@shared/types";
import type { CompletedDays } from "../types";
import { normalizeExerciseName } from "@utils/exerciseMatching";
import { parseDate } from "@utils/format";

export type SummaryPeriod = "today" | "week" | "month" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

export interface TrainingSetEntry {
  date: Date;
  exerciseName: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  weight: number;
  reps: number;
  dayNumber: number;
}

interface SummaryMuscleGroupRow {
  primaryMuscle: string;
  sets: number;
}

interface SummaryExerciseRow {
  exerciseName: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  sets: number;
}

interface TrainingSummary {
  primaryMuscles: SummaryMuscleGroupRow[];
  exercises: SummaryExerciseRow[];
}

const UNKNOWN_MUSCLE_GROUP = "Unknown";

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const startOfWeek = (date: Date): Date => {
  const d = startOfDay(date);
  // 0 = Sunday
  const day = d.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diffToMonday);
  return d;
};

// Calendar month-to-date shows an empty summary on the 1st-3rd, so "month" is
// a rolling 30-day window instead.
const ROLLING_MONTH_DAYS = 30;

const startOfRollingMonth = (date: Date): Date => {
  const d = startOfDay(date);
  d.setDate(d.getDate() - (ROLLING_MONTH_DAYS - 1));
  return d;
};

export function getPeriodDateRange(
  period: SummaryPeriod,
  customRange: DateRange | null,
  now: Date = new Date(),
): DateRange {
  if (period === "today") return { start: startOfDay(now), end: endOfDay(now) };
  if (period === "week") return { start: startOfWeek(now), end: endOfDay(now) };
  if (period === "month")
    return { start: startOfRollingMonth(now), end: endOfDay(now) };

  if (!customRange) return { start: startOfDay(now), end: endOfDay(now) };
  const [start, end] =
    customRange.start.getTime() <= customRange.end.getTime()
      ? [customRange.start, customRange.end]
      : [customRange.end, customRange.start];
  return { start: startOfDay(start), end: endOfDay(end) };
}

interface SessionLike {
  dayNumber?: number | null;
  startTime?: string | null;
  setTimings?: SetTiming[] | null;
}

interface RawSetEntry extends TrainingSetEntry {
  setNumber: number;
  source: "server" | "local";
}

function resolveExerciseName(timing: SetTiming): string {
  return timing.exerciseName?.trim() || "Unknown Exercise";
}

/** Builds the deduped set-entry list that feeds aggregateTrainingSummary, from
 * the same two sources (live sessions + locally-completed days) ExerciseAnalytics
 * uses for its own exercise history. */
export function buildTrainingSetEntries(
  sessions: SessionLike[],
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null | undefined,
  completedDays: CompletedDays,
): TrainingSetEntry[] {
  const fromSessions: RawSetEntry[] = sessions.flatMap((session) =>
    (session.setTimings ?? [])
      .filter((timing) => !timing.isWarmup)
      .flatMap((timing) => {
        const date = parseDate(timing.endTime ?? session.startTime);
        if (!date) return [];
        return [
          {
            date,
            exerciseName: resolveExerciseName(timing),
            primaryMuscles: timing.exercisePrimaryMuscles ?? [],
            secondaryMuscles: timing.exerciseSecondaryMuscles ?? [],
            weight: Number.isFinite(timing.weight)
              ? (timing.weight as number)
              : 0,
            reps: Number.isFinite(timing.reps) ? (timing.reps as number) : 0,
            dayNumber: session.dayNumber ?? 0,
            setNumber: (timing.setIndex ?? 0) + 1,
            source: "server" as const,
          },
        ];
      }),
  );

  const fromCompletedDays: RawSetEntry[] =
    !workoutData?.days || !selectedSplit
      ? []
      : Object.keys(completedDays).flatMap((dayNumberKey) => {
          const dayNumber = Number.parseInt(dayNumberKey);
          const day = workoutData.days.find((d) => d.dayNumber === dayNumber);
          const splitWorkout = day?.split?.[selectedSplit];
          if (!splitWorkout?.exercises) return [];

          return splitWorkout.exercises.flatMap((exercise, exerciseIndex) => {
            const ex = exercise as {
              machineName?: string;
              name: string;
              primaryMuscles?: string[];
              secondaryMuscles?: string[];
            };
            const exerciseName = ex.machineName ?? ex.name;
            const exerciseSets = completedDays[dayNumber]?.[exerciseIndex];
            if (!exerciseSets) return [];
            return Object.keys(exerciseSets).flatMap((setIndex) => {
              const setData = exerciseSets[Number(setIndex)];
              const date = parseDate(setData?.completedAt);
              if (!setData || setData.isWarmup || !date) return [];
              return [
                {
                  date,
                  exerciseName,
                  primaryMuscles: ex.primaryMuscles ?? [],
                  secondaryMuscles: ex.secondaryMuscles ?? [],
                  weight: Number.isFinite(setData.weight) ? setData.weight : 0,
                  reps: Number.isFinite(setData.reps) ? setData.reps : 0,
                  dayNumber,
                  setNumber: Number.parseInt(setIndex) + 1,
                  source: "local" as const,
                },
              ];
            });
          });
        });

  // Same identity/priority rule used for exercise history: a set can appear
  // in both sessions (server) and completedDays (local) during the sync
  // window, and server entries are used.
  const sorted = [...fromSessions, ...fromCompletedDays].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const seen = new Map<string, RawSetEntry>();
  sorted.forEach((entry) => {
    const key = `${entry.date.getTime()}-${entry.dayNumber}-${entry.exerciseName}-${entry.setNumber}`;
    const existing = seen.get(key);
    if (
      !existing ||
      (entry.source === "server" && existing.source === "local")
    ) {
      seen.set(key, entry);
    }
  });

  return Array.from(seen.values()).map(
    ({
      date,
      exerciseName,
      primaryMuscles,
      secondaryMuscles,
      weight,
      reps,
      dayNumber,
    }) => ({
      date,
      exerciseName,
      primaryMuscles,
      secondaryMuscles,
      weight,
      reps,
      dayNumber,
    }),
  );
}

export function aggregateTrainingSummary(
  entries: TrainingSetEntry[],
  range: DateRange,
): TrainingSummary {
  const muscleGroupMap = new Map<string, SummaryMuscleGroupRow>();
  const exerciseMap = new Map<string, SummaryExerciseRow>();

  entries.forEach((entry) => {
    if (
      entry.date.getTime() < range.start.getTime() ||
      entry.date.getTime() > range.end.getTime()
    ) {
      return;
    }

    // A set counts toward every primary muscle the exercise targets (not
    // secondary), so a compound lift with two primary muscles credits both.
    const groups =
      entry.primaryMuscles.length > 0
        ? entry.primaryMuscles
        : [UNKNOWN_MUSCLE_GROUP];
    groups.forEach((muscleGroup) => {
      const muscleRow = muscleGroupMap.get(muscleGroup) ?? {
        primaryMuscle: muscleGroup,
        sets: 0,
      };
      muscleRow.sets += 1;
      muscleGroupMap.set(muscleGroup, muscleRow);
    });

    const exerciseRow = exerciseMap.get(entry.exerciseName) ?? {
      exerciseName: entry.exerciseName,
      primaryMuscles: entry.primaryMuscles,
      secondaryMuscles: entry.secondaryMuscles,
      sets: 0,
    };
    exerciseRow.sets += 1;
    exerciseMap.set(entry.exerciseName, exerciseRow);
  });

  return {
    primaryMuscles: Array.from(muscleGroupMap.values()).sort(
      (a, b) => b.sets - a.sets,
    ),
    exercises: Array.from(exerciseMap.values()).sort((a, b) => b.sets - a.sets),
  };
}

type UndertrainedCalculationMode = "days_done" | "full_split";

interface UndertrainedGroup {
  primaryMuscle: string;
  actualSets: number;
  targetSets: number;
  completionPct: number;
  deltaFromAvg: number;
}

const UNDERTRAINED_DELTA_THRESHOLD = 25;

function sumPlannedSetsByMuscleGroup(
  days: WorkoutData["days"],
  selectedSplit: string,
): Map<string, { primaryMuscle: string; sets: number }> {
  const targets = new Map<string, { primaryMuscle: string; sets: number }>();
  days.forEach((day) => {
    const exercises = day.split?.[selectedSplit]?.exercises ?? [];
    exercises.forEach((exercise) => {
      (exercise.primaryMuscles ?? []).forEach((rawGroup) => {
        const displayGroup = rawGroup.trim();
        if (!displayGroup) return;
        const key = normalizeExerciseName(displayGroup);
        const existing = targets.get(key);
        targets.set(key, {
          primaryMuscle: existing?.primaryMuscle ?? displayGroup,
          sets: (existing?.sets ?? 0) + exercise.sets,
        });
      });
    });
  });
  return targets;
}

export function getUndertrainedMuscleGroups(
  entries: TrainingSetEntry[],
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
  now: Date,
  calculationMode: UndertrainedCalculationMode,
): UndertrainedGroup[] {
  if (!workoutData?.days || !selectedSplit) return [];

  const weekRange = getPeriodDateRange("week", null, now);
  const weekEntries = entries.filter(
    (entry) =>
      entry.date.getTime() >= weekRange.start.getTime() &&
      entry.date.getTime() <= weekRange.end.getTime(),
  );

  let targetDays = workoutData.days;
  if (calculationMode === "days_done") {
    const loggedDayNumbers = new Set(weekEntries.map((e) => e.dayNumber));
    targetDays = workoutData.days.filter((day) =>
      loggedDayNumbers.has(day.dayNumber),
    );
  }
  if (targetDays.length === 0) return [];

  const targets = sumPlannedSetsByMuscleGroup(targetDays, selectedSplit);
  if (targets.size === 0) return [];

  const actuals = new Map<string, number>();
  weekEntries.forEach((entry) => {
    entry.primaryMuscles.forEach((rawGroup) => {
      const group = rawGroup.trim();
      if (!group) return;
      const key = normalizeExerciseName(group);
      if (!targets.has(key)) return;
      actuals.set(key, (actuals.get(key) ?? 0) + 1);
    });
  });

  const rows = Array.from(targets.entries()).map(
    ([key, { primaryMuscle, sets: targetSets }]) => {
      const actualSets = actuals.get(key) ?? 0;
      const completionPct =
        targetSets > 0 ? (actualSets / targetSets) * 100 : 0;
      return { primaryMuscle, actualSets, targetSets, completionPct };
    },
  );

  const avgCompletion =
    rows.reduce((sum, r) => sum + r.completionPct, 0) / rows.length;

  return rows
    .map((row) => ({ ...row, deltaFromAvg: avgCompletion - row.completionPct }))
    .filter((row) => row.deltaFromAvg > UNDERTRAINED_DELTA_THRESHOLD)
    .sort((a, b) => b.deltaFromAvg - a.deltaFromAvg);
}
