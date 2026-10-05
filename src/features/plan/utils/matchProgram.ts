import {
  CUSTOM_EXERCISE_ID,
  type Exercise,
  type ExerciseWithSets,
  type WorkoutData,
} from "@shared/types";
import { getExercises } from "@utils/exerciseDb";
import {
  matchExercise,
  getExerciseById,
  type ExerciseCandidate,
} from "@utils/exerciseDb";
import { metric } from "@shared/services/crashReporting";

export interface UnresolvedExercise {
  dayNumber: number;
  split: string;
  name: string;
  primaryMuscles?: string[];
  candidates: ExerciseCandidate[];
}

interface MatchProgramResult {
  program: WorkoutData;
  unresolved: UnresolvedExercise[];
  changed: boolean;
}

type ProgramExercise = Exercise | ExerciseWithSets;

interface Occurrence {
  exercise: ProgramExercise;
  dayNumber: number;
  split: string;
}

// Programs name a body part ("Legs", "Arms"), but the database names individual
// muscles. Anything not listed is passed through, so "glutes" or "chest"
// still work without an entry.
const MUSCLE_GROUPS: Record<string, string[]> = {
  legs: [
    "quadriceps",
    "hamstrings",
    "glutes",
    "calves",
    "adductors",
    "abductors",
  ],
  quads: ["quadriceps"],
  hams: ["hamstrings"],
  back: ["lats", "middle back", "lower back", "traps"],
  arms: ["biceps", "triceps", "forearms"],
  abs: ["abdominals"],
  core: ["abdominals"],
  delts: ["shoulders"],
};

// Lazy for the same reason getExercises() is: building this eagerly would
// force the 158KB database to parse during module evaluation.
let knownMuscles: Set<string> | undefined;
const getKnownMuscles = (): Set<string> =>
  (knownMuscles ??= new Set(
    getExercises().flatMap((exercise) =>
      exercise.primaryMuscles.map((primary) => primary.toLowerCase()),
    ),
  ));

// A label the database has no muscle for ("Push", "Upper") says nothing about
// the exercise, so it must not filter anything out.
const targetMuscles = (
  muscleGroup: string | undefined,
): string[] | null => {
  const key = muscleGroup?.trim().toLowerCase();
  if (!key) return null;
  const muscles = MUSCLE_GROUPS[key] ?? [key];
  return muscles.every((muscle) => getKnownMuscles().has(muscle))
    ? muscles
    : null;
};

// Labels the database recognises nothing about contribute no constraint, so a
// list of only-unknown labels narrows nothing rather than excluding everything.
export const targetMusclesOf = (
  muscleGroups: readonly string[] | undefined,
): string[] | null => {
  const known = (muscleGroups ?? [])
    .map((label) => targetMuscles(label))
    .filter((muscles): muscles is string[] => muscles !== null);
  return known.length ? [...new Set(known.flat())] : null;
};

const hitsMuscle = (candidate: ExerciseCandidate, muscles: string[]): boolean =>
  candidate.exercise.primaryMuscles.some((primary) =>
    muscles.includes(primary.toLowerCase()),
  );

// "Machine Hip Thrust" scores highest against "Smith Machine Hip Raise", an
// abdominal exercise. A name match that works the wrong muscle is the wrong
// exercise, so it is never suggested.
const onStatedMuscle = (
  candidates: ExerciseCandidate[],
  muscles: string[] | null,
): ExerciseCandidate[] =>
  muscles ? candidates.filter((c) => hitsMuscle(c, muscles)) : candidates;

// A spreadsheet puts the whole muscle list in one cell ("Chest / Triceps"),
// which matches nothing in the database as one label. Returns undefined
// when the list is already split, so untouched programs are not rewritten.
const relist = (muscles: string[] | undefined): string[] | undefined => {
  if (!muscles?.length) return undefined;
  const split = muscles
    .flatMap((label) => label.split(/[/,&+]/))
    .map((label) => label.trim())
    .filter(Boolean);
  return split.join("\u0000") === muscles.join("\u0000") ? undefined : split;
};

const relistMuscles = (exercise: ProgramExercise): boolean => {
  const primary = relist(exercise.primaryMuscles);
  if (primary) exercise.primaryMuscles = primary;
  const secondary = relist(exercise.secondaryMuscles);
  if (secondary) exercise.secondaryMuscles = secondary;
  return primary !== undefined || secondary !== undefined;
};

// NFC: the same accented name typed two ways must not be reviewed twice.
const norm = (value: string): string =>
  value.normalize("NFC").trim().toLowerCase();

const keyOf = (exercise: {
  name?: string;
  primaryMuscles?: string[];
}): string =>
  `${norm(exercise.name ?? "")}\u0000${(exercise.primaryMuscles ?? [])
    .map(norm)
    .join(",")}`;

// The parser writes every exercise twice: once per split under `day.split`,
// and once on `day.exercises` with its per-split set counts. An id written to
// only one of them makes the plan editor and the workout screen disagree.
const occurrences = (program: WorkoutData): Occurrence[] =>
  (program.days ?? []).flatMap((day, dayIdx) => {
    const dayNumber = day.dayNumber ?? dayIdx + 1;
    const fromSplits = Object.entries(day.split ?? {}).flatMap(
      ([split, splitWorkout]) =>
        (splitWorkout?.exercises ?? []).map((exercise) => ({
          exercise,
          dayNumber,
          split,
        })),
    );
    const fromDay = (day.exercises ?? []).map((exercise) => ({
      exercise,
      dayNumber,
      split: Object.keys(day.split ?? {})[0] ?? "",
    }));
    return [...fromSplits, ...fromDay];
  });

const autoMatch = (
  name: string,
  primaryMuscles: string[] | undefined,
): { id?: string; candidates: ExerciseCandidate[] } => {
  const { status, candidates: raw } = matchExercise(name);
  const report = (outcome: string): void => {
    metric.count("plan.match", 1, { attributes: { outcome } });
    metric.distribution("plan.match.confidence", raw[0]?.score ?? 0, {
      attributes: { outcome },
    });
  };

  // An exact database name or a known alias is not a guess, so a program's
  // body-part label ("Arms" against a bench press) must not veto it.
  if (status === "confident" && raw.length === 1 && raw[0].score === 1) {
    report("exact");
    return { id: raw[0].exercise.id, candidates: raw };
  }

  const muscles = targetMusclesOf(primaryMuscles);
  const candidates = onStatedMuscle(raw, muscles);
  const topSurvived = raw[0] === candidates[0];

  if (status === "confident" && topSurvived) {
    report("confident");
    return { id: candidates[0].exercise.id, candidates };
  }
  if (muscles && candidates.length === 1) {
    report("muscle_narrowed");
    return { id: candidates[0].exercise.id, candidates };
  }
  report("unresolved");
  return { candidates };
};

const indexKnownExercises = (entries: Occurrence[]): Map<string, string> => {
  const resolved = new Map<string, string>();
  for (const { exercise } of entries) {
    if (!exercise.name) continue;
    if (exercise.exerciseId) resolved.set(keyOf(exercise), exercise.exerciseId);
  }
  return resolved;
};

// An imported program usually lists a primary muscle and nothing else. The
// database entry it matched knows the rest, but the import is the user's own
// wording, so it only ever fills gaps and never overwrites what was stated.
const enrichFromDatabase = (exercise: ProgramExercise, id: string): boolean => {
  const entry = getExerciseById(id);
  if (!entry) return false;

  const stated = targetMusclesOf(exercise.primaryMuscles);
  const agreesOnPrimary =
    !stated ||
    entry.primaryMuscles.some((muscle) => stated.includes(muscle.toLowerCase()));
  if (!agreesOnPrimary) return false;

  let changed = false;
  if (!exercise.primaryMuscles?.length) {
    exercise.primaryMuscles = [...entry.primaryMuscles];
    changed = true;
  }
  if (!exercise.secondaryMuscles?.length) {
    exercise.secondaryMuscles = [...entry.secondaryMuscles];
    changed = true;
  }
  return changed;
};

const resolveOccurrence = (
  { exercise, dayNumber, split }: Occurrence,
  resolved: Map<string, string>,
  unresolved: Map<string, UnresolvedExercise>,
): boolean => {
  if (!exercise.name) return false;
  const key = keyOf(exercise);
  if (!resolved.has(key) && !unresolved.has(key)) {
    const { id, candidates } = autoMatch(
      exercise.name,
      exercise.primaryMuscles,
    );
    if (id) resolved.set(key, id);
    else
      unresolved.set(key, {
        dayNumber,
        split,
        name: exercise.name,
        primaryMuscles: exercise.primaryMuscles,
        candidates,
      });
  }
  const id = resolved.get(key);
  if (!id) return false;
  let changed = false;
  if (exercise.exerciseId !== id) {
    exercise.exerciseId = id;
    changed = true;
  }
  if (enrichFromDatabase(exercise, id)) changed = true;
  return changed;
};

export const matchProgram = (program: WorkoutData): MatchProgramResult => {
  const cloned = structuredClone(program);
  const entries = occurrences(cloned);
  let changed = false;
  for (const { exercise } of entries) {
    // Plain calls, not ||=, because a side-effecting call must not be skipped once
    // changed is true.
    if (relistMuscles(exercise)) changed = true;
  }
  const resolved = indexKnownExercises(entries);

  const unresolved = new Map<string, UnresolvedExercise>();
  for (const entry of entries) {
    if (resolveOccurrence(entry, resolved, unresolved)) changed = true;
  }

  return {
    program: cloned,
    unresolved: Array.from(unresolved.values()),
    changed,
  };
};

// The same exercise usually appears on several days and in several splits, and
// answering for one is answering for all of them.
export const applyResolution = (
  program: WorkoutData,
  target: UnresolvedExercise,
  exerciseId: string | null,
): WorkoutData => {
  const cloned = structuredClone(program);
  const key = keyOf(target);

  for (const { exercise } of occurrences(cloned)) {
    if (!exercise.name || keyOf(exercise) !== key) continue;
    exercise.exerciseId = exerciseId ?? CUSTOM_EXERCISE_ID;
  }

  return cloned;
};
