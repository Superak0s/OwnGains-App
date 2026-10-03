import exercises from "./exercises.json";

export interface CanonicalExercise {
  id: string;
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string | null;
  category: string;
}

export const EXERCISES = exercises as CanonicalExercise[];
