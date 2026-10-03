import { useSyncExternalStore } from "react";

// The analytics widgets are independent component instances once they're
// spread over other boards (each foreign widget mounts its own
// AnalyticsScreen), so the picked exercise is kept outside React state,
// otherwise a pick in the select widget never updates the charts beside it.

interface ExerciseSelection {
  readonly exercise: string | null;
  readonly muscleGroup: string | null;
}

let selection: ExerciseSelection = { exercise: null, muscleGroup: null };
let autoSelected = false;
const listeners = new Set<() => void>();

export const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const emit = (next: ExerciseSelection): void => {
  selection = next;
  listeners.forEach((listener) => listener());
};

export const getSelection = (): ExerciseSelection => selection;

export const useExerciseSelection = (): ExerciseSelection =>
  useSyncExternalStore(subscribe, getSelection);

export const setSelectedExercise = (name: string | null): void =>
  emit({ ...selection, exercise: name });

export const setSelectedMuscleGroup = (group: string | null): void =>
  emit({ ...selection, muscleGroup: group });

export const hasAutoSelectedExercise = (): boolean => autoSelected;

export const setAutoSelectedExercise = (value: boolean): void => {
  autoSelected = value;
};
