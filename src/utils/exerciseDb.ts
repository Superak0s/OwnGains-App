import type { CanonicalExercise } from "../data/exercises";
import { EXERCISE_ALIASES } from "./exerciseAliases";

export type { CanonicalExercise };

let cachedExercises: CanonicalExercise[] | undefined;

/**
 * The bundled database is ~158KB of JSON. Importing it statically parses it
 * while the module graph is evaluated, before the first frame, for data no
 * startup path reads. Every read below is already inside a function or a
 * `once()` builder, so the require can wait for one of those to run.
 */
export const getExercises = (): CanonicalExercise[] =>
  (cachedExercises ??= require("../data/exercises.json") as CanonicalExercise[]);

const AUTO_ACCEPT_SCORE = 0.85;
const SUGGEST_SCORE = 0.5;

const MAX_CANDIDATES = 3;

const ABBREVIATIONS: Record<string, string> = {
  db: "dumbbell",
  bb: "barbell",
  kb: "kettlebell",
  bw: "bodyweight",
  ohp: "overhead press",
  rdl: "romanian deadlift",
  sldl: "stiff leg deadlift",
  gm: "good morning",
  ez: "e z curl bar",
  // The dataset calls plate-loaded machines "Leverage ...", which nobody
  // writes on a program.
  leverage: "machine",
};

// Users write "Tricep Pushdown" where the dataset says "Triceps Pushdown".
// Mangling both sides identically ("press" -> "pres") costs nothing, since
// tokens are only ever compared against other normalized tokens.
const singularize = (token: string): string =>
  token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;

const normalizeTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (ABBREVIATIONS[token] ?? token).split(" "))
    .map(singularize);

const diceSets = (setA: Set<string>, setB: Set<string>): number => {
  if (setA.size === 0 || setB.size === 0) return 0;
  const [small, large] = setA.size < setB.size ? [setA, setB] : [setB, setA];
  let overlap = 0;
  for (const token of small) if (large.has(token)) overlap += 1;
  return (2 * overlap) / (setA.size + setB.size);
};

// Dataset names have qualifier suffixes ("Barbell Bench Press - Medium Grip").
// Scoring against the full name dilutes the overlap so badly that a plain
// "Barbell Bench Press" loses to "Decline Barbell Bench Press".
const baseName = (name: string): string => name.split(" - ")[0];

// Building these costs ~15ms of pure tokenisation over the whole dataset. Every
// screen module reaches this file, most only for muscleLabel, so paying it at
// import time blocks startup for work the first frame never needs.
const once = <T>(build: () => T): (() => T) => {
  let value: T | undefined;
  return () => (value ??= build());
};

const getTokenIndex = once(() =>
  getExercises().map((exercise) => ({
    exercise,
    tokens: new Set(normalizeTokens(baseName(exercise.name))),
    fullTokens: new Set(normalizeTokens(exercise.name)),
  })),
);

// Scoring every entry meant ~900 comparisons per name, which stalls the Plan
// screen when a whole program is matched at once. Only entries sharing a token
// can score above zero, and those are the only ones the result keeps.
const getPostings = once(() => {
  const postings = new Map<string, number[]>();
  getTokenIndex().forEach((entry, index) => {
    for (const token of entry.tokens) {
      const bucket = postings.get(token);
      if (bucket) bucket.push(index);
      else postings.set(token, [index]);
    }
  });
  return postings;
});

export interface ExerciseCandidate {
  exercise: CanonicalExercise;
  score: number;
}

interface MatchResult {
  status: "confident" | "uncertain";
  candidates: ExerciseCandidate[];
}

const getById = once(
  () => new Map(getExercises().map((exercise) => [exercise.id, exercise])),
);

export const getExerciseById = (id: string): CanonicalExercise | undefined =>
  getById().get(id);

// An exact database name is not a guess. Scoring one is actively harmful:
// qualifier variants tie on their shared base name ("Bench Press - Powerlifting"
// against "- With Bands"), so a name copied straight out of the database would
// otherwise be sent to the review queue as ambiguous.
const getNameIndex = once(() => {
  const nameIndex = new Map<string, string>();
  for (const exercise of getExercises()) {
    const key = normalizeTokens(exercise.name).join(" ");
    if (!nameIndex.has(key)) nameIndex.set(key, exercise.id);
  }
  for (const [alias, id] of Object.entries(EXERCISE_ALIASES)) {
    nameIndex.set(normalizeTokens(alias).join(" "), id);
  }
  return nameIndex;
});

const computeMatch = (name: string): MatchResult => {
  const tokens = normalizeTokens(name);
  if (tokens.length === 0) return { status: "uncertain", candidates: [] };

  const named = getNameIndex().get(tokens.join(" "));
  if (named) {
    const exercise = getById().get(named);
    if (exercise) {
      return { status: "confident", candidates: [{ exercise, score: 1 }] };
    }
  }

  const queryTokens = new Set(tokens);
  const postings = getPostings();
  const index = getTokenIndex();
  const candidateIndices = new Set<number>();
  for (const token of queryTokens) {
    const bucket = postings.get(token);
    if (bucket) for (const i of bucket) candidateIndices.add(i);
  }

  // Equal scores fall back to the dataset's own order, so restore it before
  // the stable sort.
  const scored = Array.from(candidateIndices)
    .sort((a, b) => a - b)
    .map((i) => {
      const { exercise, tokens: dbTokens, fullTokens } = index[i];
      return {
        exercise,
        score: diceSets(queryTokens, dbTokens),
        fullScore: diceSets(queryTokens, fullTokens),
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.fullScore - a.fullScore ||
        a.exercise.name.length - b.exercise.name.length,
    )
    .slice(0, MAX_CANDIDATES);

  const best = scored[0];
  if (!best) return { status: "uncertain", candidates: [] };

  // Stripping qualifiers makes variants collide ("Bench Press - Powerlifting"
  // and "Bench Press - With Bands" both score 1 for "Bench Press"), so a tie at
  // the top is truly ambiguous and must be asked about, not guessed at.
  const isSoleWinner = !scored[1] || scored[1].score < best.score;

  // Confidence is based on the full name, not the qualifier-stripped one:
  // "Squats - With Bands" scores 1 against "Squat" on its base name alone,
  // and auto-accepting it would silently turn a barbell squat into a band one.
  const isConfident =
    best.fullScore >= AUTO_ACCEPT_SCORE &&
    best.score >= AUTO_ACCEPT_SCORE &&
    isSoleWinner;

  const candidates = scored.map(({ exercise, score }) => ({ exercise, score }));

  return {
    status: isConfident ? "confident" : "uncertain",
    candidates: best.score >= SUGGEST_SCORE ? candidates : [],
  };
};

// A program is re-matched on every Plan screen mount, and the same exercise
// name usually repeats across days.
const matchCache = new Map<string, MatchResult>();
// Names come from free-text program entries, so the key space is unbounded.
const MATCH_CACHE_MAX = 500;

export const matchExercise = (name: string): MatchResult => {
  const cached = matchCache.get(name);
  if (cached) return cached;
  const result = computeMatch(name);
  if (matchCache.size >= MATCH_CACHE_MAX) {
    const oldest = matchCache.keys().next().value;
    if (oldest !== undefined) matchCache.delete(oldest);
  }
  matchCache.set(name, result);
  return result;
};

// Secondaries are what separates otherwise identical-looking picks, so they
// are shown, marked as assistance rather than the target.
// Free-text "Chest, Triceps" -> ["Chest", "Triceps"], trimmed and de-blanked.
export const parseMuscleList = (text: string): string[] =>
  text
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

export const muscleLabel = (
  primaryMuscles?: readonly string[],
  secondaryMuscles?: readonly string[],
): string =>
  [
    (primaryMuscles ?? []).join(", "),
    secondaryMuscles?.length ? `+ ${secondaryMuscles.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");

export interface ExerciseSuggestion {
  id: string;
  label: string;
  meta: string;
}

// A blank query means "no suggestions yet", not "the first `limit` exercises",
// which is what filterExercises returns for an empty needle.
export const toSuggestions = (query: string, limit = 8): ExerciseSuggestion[] =>
  (query.trim() ? filterExercises({ query, limit }) : []).map((exercise) => ({
    id: exercise.id,
    label: exercise.name,
    meta: [
      muscleLabel(exercise.primaryMuscles, exercise.secondaryMuscles),
      exercise.equipment,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

export const muscleGroups = once<string[]>(() =>
  Array.from(
    new Set(
      getExercises().flatMap((exercise) => [
        ...exercise.primaryMuscles,
        ...exercise.secondaryMuscles,
      ]),
    ),
  ).sort((a, b) => a.localeCompare(b)),
);

interface ExerciseFilter {
  query?: string;
  include?: readonly string[];
  exclude?: readonly string[];
  limit?: number;
}

export const filterExercises = ({
  query = "",
  include = [],
  exclude = [],
  limit = 50,
}: ExerciseFilter): CanonicalExercise[] => {
  const needle = query.trim().toLowerCase();
  const results: CanonicalExercise[] = [];
  for (const exercise of getExercises()) {
    if (needle && !exercise.name.toLowerCase().includes(needle)) continue;
    // Excluding a muscle means "don't work it", so assistance counts. Including
    // one means "train it", which only the primary target does.
    if (
      exclude.some(
        (m) =>
          exercise.primaryMuscles.includes(m) ||
          exercise.secondaryMuscles.includes(m),
      )
    )
      continue;
    if (
      include.length > 0 &&
      !include.some((m) => exercise.primaryMuscles.includes(m))
    )
      continue;
    results.push(exercise);
    if (results.length >= limit) break;
  }
  return results;
};
