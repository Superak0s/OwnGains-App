import { useCallback, useEffect, useState } from "react";
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { normalizeExerciseName } from "@utils/exerciseMatching";
import type { ExerciseUnitMap, WeightUnit } from "../utils";

/** Display unit per exercise. Weights stay stored in kg, so this never syncs. */
export function useExerciseUnits(userId: string | null) {
  const [units, setUnits] = useState<ExerciseUnitMap>({});

  useEffect(() => {
    let cancelled = false;
    loadFromStorage<ExerciseUnitMap>(STORAGE_KEYS.WEIGHT_UNIT_BY_EXERCISE, userId).then((stored) => {
      if (!cancelled) setUnits(stored ?? {});
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setExerciseUnit = useCallback(
    (exerciseName: string, unit: WeightUnit) => {
      const key = normalizeExerciseName(exerciseName);
      if (!key) return;
      setUnits((prev) => {
        const next = { ...prev, [key]: unit };
        void saveToStorage(STORAGE_KEYS.WEIGHT_UNIT_BY_EXERCISE, next, userId);
        return next;
      });
    },
    [userId],
  );

  return { units, setExerciseUnit };
}
