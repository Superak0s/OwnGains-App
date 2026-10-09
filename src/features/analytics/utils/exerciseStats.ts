import { estimateOneRepMax } from "@utils/oneRepMax";
import { RECORD_REP_LIMIT } from "@utils/recordSets";
import { parseDate, toDateString } from "@utils/format";
import type { ChartPoint } from "@shared/components/chart/chartMath";
import { REST_WINDOW_MAX_SEC, REST_WINDOW_MIN_SEC } from "@utils/session";
import type {
  FullSessionWithGroups,
  SetTiming,
  WorkoutData,
} from "@shared/types";
import type {
  CompletedDays,
  ExerciseHistoryEntry,
  ExerciseMeta,
  ExerciseStats,
  PlannedExercise,
} from "../types";

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
const REP_MAX_TABLE_LIMIT = RECORD_REP_LIMIT;
const TREND_WINDOW_SESSIONS = 8;
const STALL_WEEKS = 4;
// Below this a long-vs-short rest comparison is two sessions and a coin flip.
const MIN_REST_COMPARE_SESSIONS = 4;

export interface PersonalRecord {
  value: number;
  reps: number;
  date: Date;
}

export interface RepMaxRow {
  reps: number;
  load: number;
  date: Date;
}

export interface SessionOneRepMax {
  date: Date;
  value: number;
}

export interface ExerciseInsights {
  currentOneRepMax: number;
  bestOneRepMax: number;
  oneRepMaxChange30d: number;
  oneRepMaxChange90d: number;
  records: {
    heaviestSet: PersonalRecord | null;
    mostReps: PersonalRecord | null;
    bestOneRepMax: PersonalRecord | null;
  };
  repMaxTable: RepMaxRow[];
  progressPerWeek: number;
  weeksSinceRecord: number | null;
  isStalled: boolean;
  repRanges: { strength: number; hypertrophy: number; endurance: number };
  workingSetCount: number;
  sessionsPerWeek: number;
  medianDaysBetween: number | null;
  daysSinceLast: number | null;
  avgRestSec: number | null;
  /** Preferred over the mean: one interrupted set can't drag it. */
  medianRestSec: number | null;
  dropOffPct: number | null;
  restPerformance: RestPerformance | null;
}

/** Rep drop-off on this exercise's longer-rest sessions vs its shorter-rest ones. */
export interface RestPerformance {
  longRestSec: number;
  longRestDropOffPct: number;
  shortRestSec: number;
  shortRestDropOffPct: number;
}

export const workingSets = (
  entries: ExerciseHistoryEntry[],
): ExerciseHistoryEntry[] => entries.filter((entry) => !entry.isWarmup);

const startOfDayMs = (date: Date): number => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.getTime();
};

const round = (value: number, decimals = 1): number => {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
};

const groupBySession = (
  entries: ExerciseHistoryEntry[],
): ExerciseHistoryEntry[][] => {
  const sessions = new Map<number, ExerciseHistoryEntry[]>();
  entries.forEach((entry) => {
    const key = startOfDayMs(entry.date);
    const bucket = sessions.get(key);
    if (bucket) bucket.push(entry);
    else sessions.set(key, [entry]);
  });
  return [...sessions.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) =>
      [...bucket].sort((a, b) => a.date.getTime() - b.date.getTime()),
    );
};

export function sessionOneRepMaxes(
  entries: ExerciseHistoryEntry[],
): SessionOneRepMax[] {
  return groupBySession(workingSets(entries))
    .map((session) => ({
      date: session[0].date,
      value: Math.max(
        ...session.map((entry) => estimateOneRepMax(entry.load, entry.reps)),
      ),
    }))
    .filter((point) => point.value > 0);
}

function slopePerWeek(points: SessionOneRepMax[]): number {
  if (points.length < 2) return 0;
  const xs = points.map((point) => point.date.getTime() / WEEK_MS);
  const ys = points.map((point) => point.value);
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
  const denominator = xs.reduce((sum, x) => sum + (x - meanX) ** 2, 0);
  if (denominator === 0) return 0;
  const numerator = xs.reduce(
    (sum, x, index) => sum + (x - meanX) * (ys[index] - meanY),
    0,
  );
  return numerator / denominator;
}

function changeOverDays(points: SessionOneRepMax[], days: number): number {
  if (points.length < 2) return 0;
  const latest = points.at(-1)!;
  const cutoff = latest.date.getTime() - days * DAY_MS;
  const baseline = points.find((point) => point.date.getTime() >= cutoff);
  if (!baseline || baseline === latest || baseline.value <= 0) return 0;
  return ((latest.value - baseline.value) / baseline.value) * 100;
}

function bestBy(
  entries: ExerciseHistoryEntry[],
  score: (entry: ExerciseHistoryEntry) => number,
): PersonalRecord | null {
  let best: PersonalRecord | null = null;
  entries.forEach((entry) => {
    const value = score(entry);
    if (!Number.isFinite(value) || value <= 0) return;
    if (best === null || value > best.value)
      best = { value: round(value), reps: entry.reps, date: entry.date };
  });
  return best;
}

function buildRepMaxTable(entries: ExerciseHistoryEntry[]): RepMaxRow[] {
  const rows = new Map<number, RepMaxRow>();
  entries.forEach((entry) => {
    if (entry.reps < 1 || entry.reps > REP_MAX_TABLE_LIMIT) return;
    if (!Number.isFinite(entry.load) || entry.load <= 0) return;
    const existing = rows.get(entry.reps);
    if (!existing || entry.load > existing.load)
      rows.set(entry.reps, {
        reps: entry.reps,
        load: round(entry.load),
        date: entry.date,
      });
  });
  return [...rows.values()].sort((a, b) => a.reps - b.reps);
}

function restIntervals(sessions: ExerciseHistoryEntry[][]): number[] {
  return sessions.flatMap((session) =>
    session.slice(1).flatMap((entry, index) => {
      const previous = session[index];
      const gapSec =
        (entry.date.getTime() - previous.date.getTime()) / 1000 -
        (entry.durationSec ?? 0);
      return gapSec >= REST_WINDOW_MIN_SEC && gapSec <= REST_WINDOW_MAX_SEC
        ? [gapSec]
        : [];
    }),
  );
}

function sessionDropOff(session: ExerciseHistoryEntry[]): number | null {
  if (session.length < 2) return null;
  const first = session[0];
  const last = session.at(-1)!;
  if (first.reps <= 0) return null;
  return ((first.reps - last.reps) / first.reps) * 100;
}

function dropOffPercentages(sessions: ExerciseHistoryEntry[][]): number[] {
  return sessions.flatMap((session) => {
    const dropOff = sessionDropOff(session);
    return dropOff === null ? [] : [dropOff];
  });
}

const mean = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

function compareRestBuckets(
  sessions: ExerciseHistoryEntry[][],
): RestPerformance | null {
  const rows = sessions.flatMap((session) => {
    const dropOffPct = sessionDropOff(session);
    const restSec = median(restIntervals([session]));
    return dropOffPct === null || restSec === null
      ? []
      : [{ restSec, dropOffPct }];
  });
  if (rows.length < MIN_REST_COMPARE_SESSIONS) return null;

  const split = median(rows.map((row) => row.restSec))!;
  const longer = rows.filter((row) => row.restSec >= split);
  const shorter = rows.filter((row) => row.restSec < split);
  if (longer.length === 0 || shorter.length === 0) return null;

  return {
    longRestSec: Math.round(mean(longer.map((row) => row.restSec))),
    longRestDropOffPct: round(mean(longer.map((row) => row.dropOffPct))),
    shortRestSec: Math.round(mean(shorter.map((row) => row.restSec))),
    shortRestDropOffPct: round(mean(shorter.map((row) => row.dropOffPct))),
  };
}

const EMPTY_INSIGHTS: ExerciseInsights = {
  currentOneRepMax: 0,
  bestOneRepMax: 0,
  oneRepMaxChange30d: 0,
  oneRepMaxChange90d: 0,
  records: {
    heaviestSet: null,
    mostReps: null,
    bestOneRepMax: null,
  },
  repMaxTable: [],
  progressPerWeek: 0,
  weeksSinceRecord: null,
  isStalled: false,
  repRanges: { strength: 0, hypertrophy: 0, endurance: 0 },
  workingSetCount: 0,
  sessionsPerWeek: 0,
  medianDaysBetween: null,
  daysSinceLast: null,
  avgRestSec: null,
  medianRestSec: null,
  dropOffPct: null,
  restPerformance: null,
};

/**
 * `recordEntries` are record-setting sets from outside the `entries` window.
 * They only count towards the all-time records, never the trends.
 */
export function computeExerciseInsights(
  entries: ExerciseHistoryEntry[] | null,
  recordEntries: ExerciseHistoryEntry[] = [],
): ExerciseInsights {
  const working = workingSets(entries ?? []);
  if (working.length === 0) return EMPTY_INSIGHTS;

  // Older sets first, so a tie keeps the date the record was first set.
  const allTime = [...workingSets(recordEntries), ...working];
  const sessions = groupBySession(working);
  const oneRepMaxes = sessionOneRepMaxes(working);
  const bestOneRepMax = bestBy(allTime, (entry) =>
    estimateOneRepMax(entry.load, entry.reps),
  );

  const sessionDates = sessions.map((session) => session[0].date);
  const firstDate = sessionDates[0];
  const lastDate = sessionDates.at(-1)!;
  const gapsDays = sessionDates
    .slice(1)
    .map(
      (date, index) =>
        (date.getTime() - sessionDates[index].getTime()) / DAY_MS,
    );
  const spanWeeks = Math.max(
    1,
    (lastDate.getTime() - firstDate.getTime()) / WEEK_MS,
  );

  const shareInRepRange = (min: number, max: number): number =>
    (working.filter((entry) => entry.reps >= min && entry.reps <= max).length /
      working.length) *
    100;

  const rests = restIntervals(sessions);
  const dropOffs = dropOffPercentages(sessions);
  const weeksSinceRecord = bestOneRepMax
    ? (Date.now() - bestOneRepMax.date.getTime()) / WEEK_MS
    : null;

  return {
    currentOneRepMax: round(oneRepMaxes.at(-1)?.value ?? 0),
    bestOneRepMax: bestOneRepMax?.value ?? 0,
    oneRepMaxChange30d: round(changeOverDays(oneRepMaxes, 30)),
    oneRepMaxChange90d: round(changeOverDays(oneRepMaxes, 90)),
    records: {
      heaviestSet: bestBy(allTime, (entry) => entry.load),
      mostReps: bestBy(allTime, (entry) => entry.reps),
      bestOneRepMax,
    },
    repMaxTable: buildRepMaxTable(allTime),
    progressPerWeek: round(
      slopePerWeek(oneRepMaxes.slice(-TREND_WINDOW_SESSIONS)),
    ),
    weeksSinceRecord:
      weeksSinceRecord === null ? null : round(weeksSinceRecord),
    isStalled: (weeksSinceRecord ?? 0) >= STALL_WEEKS && sessions.length > 1,
    repRanges: {
      strength: round(shareInRepRange(1, 5), 0),
      hypertrophy: round(shareInRepRange(6, 12), 0),
      endurance: round(shareInRepRange(13, Number.MAX_SAFE_INTEGER), 0),
    },
    workingSetCount: working.length,
    sessionsPerWeek: round(sessions.length / spanWeeks),
    medianDaysBetween: gapsDays.length ? round(median(gapsDays)!) : null,
    daysSinceLast: Math.floor((Date.now() - startOfDayMs(lastDate)) / DAY_MS),
    avgRestSec: rests.length ? Math.round(mean(rests)) : null,
    medianRestSec: rests.length ? Math.round(median(rests)!) : null,
    restPerformance: compareRestBuckets(sessions),
    dropOffPct: dropOffs.length
      ? round(dropOffs.reduce((sum, value) => sum + value, 0) / dropOffs.length)
      : null,
  };
}

export type AnalyticsSession = Pick<
  FullSessionWithGroups,
  "dayNumber" | "startTime" | "setTimings"
>;

export interface ExerciseHistorySources {
  sessions: AnalyticsSession[];
  workoutData: WorkoutData | null;
  selectedSplit: string | null;
  completedDays: CompletedDays;
}

export interface ExerciseSelection {
  selection: string;
  isGroupFocus: boolean;
  currentBodyWeight: number | null;
}

const average = (values: number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const finite = (value: number | null | undefined): number =>
  Number.isFinite(value) ? (value as number) : 0;

const resolveExerciseName = (timing: SetTiming): string =>
  timing.exerciseName?.trim() || "Unknown Exercise";

const isAssistedName = (name: string): boolean =>
  name.toLowerCase().includes("assisted");

/** Assisted machines subtract the stack from body weight, so what is on the pin
 * is not what was actually moved. */
const effectiveLoad = (
  isAssisted: boolean,
  weight: number,
  bodyWeight: number | null,
): number => (isAssisted && bodyWeight ? bodyWeight - weight : weight);

export function buildAvailableExercises(
  sources: ExerciseHistorySources,
): ExerciseMeta[] {
  const { sessions, workoutData, selectedSplit, completedDays } = sources;
  const metas = new Map<string, ExerciseMeta>();

  const upsert = (
    key: string,
    fallback: Omit<ExerciseMeta, "name" | "days" | "totalSets">,
  ): ExerciseMeta => {
    const existing = metas.get(key);
    if (existing) return existing;
    const created: ExerciseMeta = {
      name: key,
      days: [],
      totalSets: 0,
      ...fallback,
    };
    metas.set(key, created);
    return created;
  };

  // Everything the plan defines, so it shows in the picker before any set is logged.
  if (workoutData?.days && selectedSplit) {
    workoutData.days.forEach((day) => {
      const exercises = day.split?.[selectedSplit]?.exercises ?? [];
      exercises.forEach((exercise, exerciseIndex) => {
        const planned = exercise as PlannedExercise;
        const meta = upsert(planned.machineName ?? planned.name, {
          exerciseName: planned.name,
          exerciseId: planned.exerciseId ?? null,
          machineName: planned.machineName ?? null,
          primaryMuscles: planned.primaryMuscles ?? [],
          secondaryMuscles: planned.secondaryMuscles ?? [],
        });
        meta.days.push({ dayNumber: day.dayNumber, exerciseIndex });
        const daySets = completedDays[day.dayNumber]?.[exerciseIndex];
        if (daySets) meta.totalSets += Object.keys(daySets).length;
      });
    });
  }

  // Logged sessions may hold exercises that are no longer part of the plan.
  sessions.forEach((session) => {
    const timings = session.setTimings ?? [];
    timings.forEach((timing) => {
      const key = resolveExerciseName(timing);
      upsert(key, {
        exerciseName: key,
        exerciseId: timing.exerciseId == null ? null : String(timing.exerciseId),
        machineName: null,
        primaryMuscles: timing.exercisePrimaryMuscles ?? [],
        secondaryMuscles: timing.exerciseSecondaryMuscles ?? [],
      }).totalSets++;
    });
  });

  return [...metas.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const matchesSelection = (
  { selection, isGroupFocus }: ExerciseSelection,
  exerciseName: string,
  primaryMuscles: string[],
): boolean =>
  isGroupFocus
    ? primaryMuscles.includes(selection)
    : exerciseName === selection;

function historyFromSessions(
  sources: ExerciseHistorySources,
  selection: ExerciseSelection,
): ExerciseHistoryEntry[] {
  return sources.sessions.flatMap((session) => {
    const timings = session.setTimings ?? [];
    return timings.flatMap((timing): ExerciseHistoryEntry[] => {
      const exerciseName = resolveExerciseName(timing);
      const primaryMuscles = timing.exercisePrimaryMuscles ?? [];
      if (!matchesSelection(selection, exerciseName, primaryMuscles)) return [];

      const date = parseDate(timing.endTime ?? session.startTime);
      if (!date) return [];

      const dayNumber = session.dayNumber ?? 0;
      const isAssisted = isAssistedName(exerciseName);
      const rawWeight = timing.weight ?? 0;

      return [
        {
          date,
          exerciseName,
          weight: finite(rawWeight),
          reps: finite(timing.reps ?? 0),
          load: finite(
            effectiveLoad(isAssisted, rawWeight, selection.currentBodyWeight),
          ),
          dayNumber,
          setNumber: (timing.setIndex ?? 0) + 1,
          source: "server",
          isAssisted,
          isWarmup: timing.isWarmup ?? false,
          durationSec: timing.setDuration,
        },
      ];
    });
  });
}

function historyFromCompletedDays(
  sources: ExerciseHistorySources,
  selection: ExerciseSelection,
): ExerciseHistoryEntry[] {
  const { workoutData, selectedSplit, completedDays } = sources;
  if (!workoutData?.days || !selectedSplit) return [];
  const days = workoutData.days;

  return Object.keys(completedDays).flatMap((dayKey) => {
    const dayNumber = Number.parseInt(dayKey);
    const exercises = days.find((d) => d.dayNumber === dayNumber)?.split?.[
      selectedSplit
    ]?.exercises;
    if (!exercises) return [];

    return exercises.flatMap((exercise, exerciseIndex) => {
      const planned = exercise as PlannedExercise;
      const exerciseName = planned.machineName ?? planned.name;
      if (
        !matchesSelection(selection, exerciseName, planned.primaryMuscles ?? [])
      )
        return [];

      const exerciseSets = completedDays[dayNumber]?.[exerciseIndex];
      if (!exerciseSets) return [];
      const isAssisted = isAssistedName(planned.name);

      return Object.keys(exerciseSets).flatMap(
        (setIndex): ExerciseHistoryEntry[] => {
          const setData = exerciseSets[Number(setIndex)];
          const date = parseDate(setData?.completedAt);
          if (!setData || !date) return [];
          const rawWeight = setData.weight ?? 0;

          return [
            {
              date,
              exerciseName,
              weight: finite(rawWeight),
              reps: finite(setData.reps ?? 0),
              load: finite(
                effectiveLoad(
                  isAssisted,
                  rawWeight,
                  selection.currentBodyWeight,
                ),
              ),
              dayNumber,
              setNumber: Number.parseInt(setIndex) + 1,
              source: "local",
              isAssisted,
              isWarmup: setData.isWarmup ?? false,
            },
          ];
        },
      );
    });
  });
}

export function buildExerciseHistory(
  sources: ExerciseHistorySources,
  selection: ExerciseSelection,
): ExerciseHistoryEntry[] {
  return [
    ...historyFromSessions(sources, selection),
    ...historyFromCompletedDays(sources, selection),
  ];
}

/** A set can arrive from both a synced session and the local completedDays
 * record during the sync window, and the server copy is used. */
export function dedupeHistory(
  entries: ExerciseHistoryEntry[],
): ExerciseHistoryEntry[] {
  const sorted = [...entries].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );
  const seen = new Map<string, ExerciseHistoryEntry>();
  sorted.forEach((entry) => {
    const key = `${entry.date.getTime()}-${entry.dayNumber}-${entry.exerciseName}-${entry.setNumber}`;
    const existing = seen.get(key);
    if (!existing || (entry.source === "server" && existing.source === "local"))
      seen.set(key, entry);
  });
  return [...seen.values()];
}

const EMPTY_STATS: ExerciseStats = {
  totalSets: 0,
  totalWorkouts: 0,
  extremeWeight: 0,
  extremeWeightLabel: "Max Weight",
  maxReps: 0,
  avgWeight: 0,
  avgReps: 0,
  lastWorkout: null,
  isAssisted: false,
};

export function computeExerciseStats(
  entries: ExerciseHistoryEntry[] | null,
): ExerciseStats {
  if (!entries?.length) return EMPTY_STATS;

  const isAssisted = entries.every((entry) => entry.isAssisted);
  const weights = entries.map((entry) => finite(entry.weight));
  const reps = entries.map((entry) => finite(entry.reps));

  return {
    totalSets: entries.length,
    totalWorkouts: new Set(entries.map((e) => toDateString(e.date)))
      .size,
    extremeWeight: isAssisted ? Math.min(...weights) : Math.max(...weights),
    extremeWeightLabel: isAssisted ? "Least Assistance" : "Max Weight",
    maxReps: Math.max(...reps),
    avgWeight: round(average(weights)),
    avgReps: round(average(reps)),
    lastWorkout: entries.at(-1)?.date ?? null,
    isAssisted,
  };
}

export const PROGRESS_METRICS = [
  "weight",
  "heaviest",
  "oneRepMax",
  "bestSetVolume",
  "sessionVolume",
  "reps",
  "totalReps",
] as const;
export type ProgressMetric = (typeof PROGRESS_METRICS)[number];

/** One point per training day. */
export function buildProgressPoints(
  entries: ExerciseHistoryEntry[] | null,
  metric: ProgressMetric,
): ChartPoint[] {
  if (!entries?.length) return [];

  const byDate = new Map<string, ExerciseHistoryEntry[]>();
  entries.forEach((entry) => {
    const key = toDateString(entry.date);
    const bucket = byDate.get(key);
    if (bucket) bucket.push(entry);
    else byDate.set(key, [entry]);
  });

  const value = (session: ExerciseHistoryEntry[]): number => {
    const volumes = session.map((e) => finite(e.load) * finite(e.reps));
    switch (metric) {
      case "weight":
        return average(session.map((entry) => finite(entry.weight)));
      case "heaviest":
        return Math.max(...session.map((entry) => finite(entry.weight)));
      case "reps":
        return average(session.map((entry) => finite(entry.reps)));
      case "totalReps":
        return session.reduce((sum, entry) => sum + finite(entry.reps), 0);
      case "bestSetVolume":
        return Math.max(...volumes);
      case "sessionVolume":
        return volumes.reduce((sum, v) => sum + v, 0);
      default:
        return Math.max(
          ...session.map((entry) => estimateOneRepMax(entry.load, entry.reps)),
        );
    }
  };

  return [...byDate.values()]
    .sort((a, b) => a[0].date.getTime() - b[0].date.getTime())
    .map((session) => ({ date: session[0].date, value: round(value(session)) }));
}

export interface ExerciseBreakdownRow {
  exerciseName: string;
  sets: number;
  currentOneRepMax: number;
  oneRepMaxChange30d: number;
}

/** Splits a muscle group's pooled history back into its exercises, the only
 * level where a 1RM trend means anything. */
export function exerciseBreakdown(
  entries: ExerciseHistoryEntry[],
): ExerciseBreakdownRow[] {
  const byName = new Map<string, ExerciseHistoryEntry[]>();
  workingSets(entries).forEach((entry) => {
    const bucket = byName.get(entry.exerciseName);
    if (bucket) bucket.push(entry);
    else byName.set(entry.exerciseName, [entry]);
  });
  return [...byName.entries()]
    .map(([exerciseName, sets]) => {
      const insights = computeExerciseInsights(sets);
      return {
        exerciseName,
        sets: sets.length,
        currentOneRepMax: insights.currentOneRepMax,
        oneRepMaxChange30d: insights.oneRepMaxChange30d,
      };
    })
    .sort((a, b) => b.sets - a.sets);
}
