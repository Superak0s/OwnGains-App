import { useCallback, useEffect, useMemo, useState } from "react";
import {
  loadFromStorage,
  removeFromStorage,
  saveToStorage,
  STORAGE_KEYS,
} from "@shared/services/storage";
import { useAuth } from "@shared/context/AuthContext";
import { DEFAULT_CHART_SETTINGS, type ChartSettings } from "./chartMath";

/** Only the user's changes are stored, so a chart's own defaults can still change underneath them. */
export function useChartSettings(
  chartId: string | undefined,
  defaults: Partial<ChartSettings>,
) {
  const { user } = useAuth();
  const userId = user?.id == null ? null : String(user.id);
  const key = chartId ? `${STORAGE_KEYS.CHART_SETTINGS}_${chartId}` : null;
  const [saved, setSaved] = useState<Partial<ChartSettings>>({});
  const defaultsKey = JSON.stringify(defaults);

  useEffect(() => {
    setSaved({});
    if (!key) return;
    let cancelled = false;
    loadFromStorage<Partial<ChartSettings>>(key, userId).then((stored) => {
      if (!cancelled && stored) setSaved(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [key, userId]);

  const settings = useMemo<ChartSettings>(
    () => ({ ...DEFAULT_CHART_SETTINGS, ...JSON.parse(defaultsKey), ...saved }),
    [defaultsKey, saved],
  );

  const update = useCallback(
    (patch: Partial<ChartSettings>) => {
      const next = { ...saved, ...patch };
      setSaved(next);
      if (key) saveToStorage(key, next, userId);
    },
    [key, saved, userId],
  );

  const reset = useCallback(() => {
    setSaved({});
    if (key) removeFromStorage(key, userId);
  }, [key, userId]);

  return { settings, update, reset };
}
