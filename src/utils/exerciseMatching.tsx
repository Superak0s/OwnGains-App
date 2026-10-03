import type { WorkoutData } from "@shared/types";

export interface SimilarityMatch {
  name: string;
  similarity: number;
}

interface TypoCheckResult {
  isLikelyTypo: boolean;
  suggestions: SimilarityMatch[];
  exactMatch?: string | null;
}

const SIMILARITY_THRESHOLD = 0.7;
const TYPO_THRESHOLD = 0.75;
const MAX_SUGGESTIONS = 3;

const levenshteinDistance = (s1: string, s2: string): number => {
  let previous = Array.from({ length: s1.length + 1 }, (_, j) => j);
  let current = new Array<number>(s1.length + 1);

  for (let i = 1; i <= s2.length; i++) {
    current[0] = i;
    for (let j = 1; j <= s1.length; j++) {
      current[j] =
        s2.codePointAt(i - 1) === s1.codePointAt(j - 1)
          ? previous[j - 1]
          : Math.min(previous[j - 1], current[j - 1], previous[j]) + 1;
    }
    [previous, current] = [current, previous];
  }

  return previous[s1.length];
};

const calculateSimilarity = (s1: string, s2: string): number => {
  if (s1 === s2) return 1;
  return 1 - levenshteinDistance(s1, s2) / Math.max(s1.length, s2.length);
};

/**
 * Normalize an exercise name for case-insensitive matching / keying.
 * Single source of truth so session set-matching stays consistent everywhere.
 */
export const normalizeExerciseName = (name: string): string =>
  name.trim().toLowerCase();

export const splitExercises = (
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
) => {
  if (!workoutData?.days || !selectedSplit) return [];
  return workoutData.days.flatMap(
    (day) => day.split?.[selectedSplit]?.exercises ?? [],
  );
};

export const getAllExerciseNames = (
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
): string[] =>
  Array.from(
    new Set(
      splitExercises(workoutData, selectedSplit)
        .map((exercise) => exercise.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );

export const getAllMuscleGroups = (
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
): string[] =>
  Array.from(
    new Set([
      ...CANONICAL_MUSCLE_GROUPS,
      ...splitExercises(workoutData, selectedSplit).flatMap((exercise) =>
        [
          ...(exercise.primaryMuscles ?? []),
          ...(exercise.secondaryMuscles ?? []),
        ]
          .map((m) => m?.trim())
          .filter((m): m is string => Boolean(m)),
      ),
    ]),
  );
/**
 * Find exercise names from the plan that share a muscle group, for
 * swap-suggestion UI. Excludes a given exercise name (case-insensitive).
 * `muscleGroup` may be a comma-separated list ("Chest, Triceps"), as the
 * muscle fields in the edit-exercise form are. Any match counts.
 */
export const getExercisesByMuscleGroup = (
  workoutData: WorkoutData | null | undefined,
  selectedSplit: string | null,
  muscleGroup: string,
  excludeName?: string,
): string[] => {
  if (!muscleGroup?.trim()) return [];

  const normalizedGroups = new Set(
    muscleGroup
      .split(",")
      .map((m) => normalizeExerciseName(m))
      .filter(Boolean),
  );
  if (normalizedGroups.size === 0) return [];
  const excludedName = excludeName ? normalizeExerciseName(excludeName) : null;

  return Array.from(
    new Set(
      splitExercises(workoutData, selectedSplit)
        .filter(
          (exercise) =>
            (exercise.primaryMuscles ?? []).some((m) =>
              normalizedGroups.has(normalizeExerciseName(m)),
            ) && normalizeExerciseName(exercise.name ?? "") !== excludedName,
        )
        .map((exercise) => exercise.name?.trim())
        .filter((name): name is string => Boolean(name)),
    ),
  );
};

export const CANONICAL_MUSCLE_GROUPS: readonly string[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Abs",
  "Obliques",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Hip Flexors",
  "Adductors",
  "Abductors",
  "Lats",
  "Traps",
  "Rhomboids",
  "Lower Back",
  "Upper Back",
  "Upper Chest",
  "Inner Chest",
  "Rear Delts",
  "Front Delts",
  "Side Delts",
  "Full Body",
  "Legs",
  "Arms",
  "Push",
  "Pull",
];

const findExactMatch = (
  name: string,
  allNames: string[],
): string | undefined => {
  const normalized = normalizeExerciseName(name);
  return allNames.find((n) => normalizeExerciseName(n) === normalized);
};

const findSimilarNames = (
  name: string,
  allNames: string[],
): SimilarityMatch[] => {
  if (name.trim().length < 3) return [];

  const normalized = normalizeExerciseName(name);

  return allNames
    .map((n) => {
      const candidate = normalizeExerciseName(n);
      const similarity = calculateSimilarity(normalized, candidate);
      return {
        name: n,
        // A name the user is still typing is a prefix, not a typo, so score it
        // high enough to stay in the suggestion list.
        similarity: candidate.startsWith(normalized)
          ? Math.max(similarity, 0.8)
          : similarity,
      };
    })
    .filter(
      (match) =>
        match.similarity >= SIMILARITY_THRESHOLD && match.similarity < 1,
    )
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_SUGGESTIONS);
};

export const checkForTypo = (
  name: string,
  allNames: string[],
): TypoCheckResult => {
  if (!name?.trim()) {
    return { isLikelyTypo: false, suggestions: [] };
  }

  const exactMatch = findExactMatch(name, allNames);
  if (exactMatch) {
    return { isLikelyTypo: false, suggestions: [], exactMatch };
  }

  const suggestions = findSimilarNames(name, allNames);
  return {
    isLikelyTypo: suggestions.some((s) => s.similarity > TYPO_THRESHOLD),
    suggestions,
    exactMatch: null,
  };
};

export const getCanonicalName = (name: string, allNames: string[]): string =>
  findExactMatch(name, allNames) ?? name;
