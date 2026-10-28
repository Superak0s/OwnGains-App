import { useCallback, useEffect, useRef, useState } from "react";
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { normalizeExerciseName } from "@utils/exerciseMatching";
import type { ExerciseUnitMap, WeightUnit } from "../utils";

/** Display unit per exercise. Weights stay stored in kg, so this never syncs. */
export function useExerciseUnits(userId: string | null) {
  const [units, setUnits] = useState<ExerciseUnitMap>({});
  // Picks made before the stored map arrives, merged on top of it so saving
  // them can't overwrite every other exercise's unit.
  const pendingPicks = useRef<ExerciseUnitMap | null>(null);

  useEffect(() => {
    let cancelled = false;
    pendingPicks.current = {};
    setUnits({});
    loadFromStorage<ExerciseUnitMap>(STORAGE_KEYS.WEIGHT_UNIT_BY_EXERCISE, userId).then((stored) => {
      if (cancelled) return;
      const picks = pendingPicks.current ?? {};
      pendingPicks.current = null;
      const merged = { ...stored, ...picks };
      setUnits(merged);
      if (Object.keys(picks).length > 0) {
        void saveToStorage(STORAGE_KEYS.WEIGHT_UNIT_BY_EXERCISE, merged, userId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setExerciseUnit = useCallback(
    (exerciseName: string, unit: WeightUnit) => {
      const key = normalizeExerciseName(exerciseName);
      if (!key) return;
      if (pendingPicks.current) {
        pendingPicks.current[key] = unit;
        setUnits((prev) => ({ ...prev, [key]: unit }));
        return;
      }
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
