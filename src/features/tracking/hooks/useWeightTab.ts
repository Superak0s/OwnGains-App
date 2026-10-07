import type { DayModalState } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useEffect, useMemo } from "react";
import type { WeightEntry, HeightData } from "@shared/types";
import { bodyTrackingApi } from "../services";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import { isoToLocalDateStr, toTrendChartData } from "../utils";
import { toDateString } from "@utils/format";
import { getUserKey as sharedGetUserKey } from "@shared/services/storage";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import { authService } from "@features/auth/services/index";
import { isFeatureLocal } from "@shared/services/localOnlyFeatures";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { parseDecimal, MAX_WEIGHT_KG, displayToKg } from "@features/workout/utils";
import { log, metric } from "@shared/services/crashReporting";

interface UseWeightTabDeps {
  alert: UseAlertReturn["alert"];
  loadData: () => void;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
  selectedLogDate: Date | null;
  setSelectedLogDate: (d: Date | null) => void;
  buildLocalISOForDate: (d: Date, t?: string) => string;
  user?: { id?: string; heightCm?: number | null } | null;
}

export interface HeightInput {
  cm: string;
  ft: string;
  in: string;
}

const MIN_HEIGHT_CM = 50;
const MAX_HEIGHT_CM = 260;

export function useWeightTab(deps: UseWeightTabDeps) {
  const { alert, loadData, setDayModal, selectedLogDate, setSelectedLogDate, buildLocalISOForDate, user } = deps;

  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const { weightUnit, saveWeightUnit } = useWorkoutPick(
    "weightUnit",
    "saveWeightUnit",
  );
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightEntriesShown, setWeightEntriesShown] = useState(10);
  const [trendAverageDays, setTrendAverageDays] = useState(7);

  const [height, setHeight] = useState<HeightData | null>(null);
  const [heightUnit, setHeightUnit] = useState<string>("cm");
  const [showHeightModal, setShowHeightModal] = useState(false);

  const getUserKey = useCallback(
    (key: string) => sharedGetUserKey(key, user?.id ?? null),
    [user?.id],
  );

  useEffect(() => {
    (async () => {
      const stored = await getStorageItem(getUserKey("height_cm"));
      const cm = stored ? Number.parseFloat(stored) : Number.NaN;
      if (!Number.isNaN(cm)) setHeight({ heightCm: cm });
      else if (user?.heightCm) setHeight({ heightCm: user.heightCm });
    })();
  }, [getUserKey, user?.heightCm]);

  const saveHeight = useCallback(async (input: HeightInput): Promise<boolean> => {
    const feet = parseDecimal(input.ft || "0");
    const inches = parseDecimal(input.in || "0");
    let cm: number | null = null;
    if (heightUnit === "cm") cm = parseDecimal(input.cm);
    else if (feet !== null && inches !== null) cm = (feet * 12 + inches) * 2.54;
    if (cm === null || cm < MIN_HEIGHT_CM || cm > MAX_HEIGHT_CM) {
      alert(
        "Invalid Input",
        `Enter a height between ${MIN_HEIGHT_CM} cm and ${MAX_HEIGHT_CM} cm`,
        [{ text: "OK" }],
        "error",
      );
      return false;
    }
    await setStorageItem(getUserKey("height_cm"), String(cm));
    setHeight({ heightCm: cm });
    // The server stamps body-fat entries with it. Height remains useful locally
    // whether or not that write succeeds, so don't block or revert on failure.
    if (!(await isFeatureLocal("tracking")))
      authService
        .updateProfile({ heightCm: cm })
        .catch((err) => {
          console.warn("Failed to sync height:", err);
          metric.count("tracking.height_sync_failed");
          log.warn("tracking.height_sync_failed");
        });
    setShowHeightModal(false);
    return true;
  }, [heightUnit, alert, getUserKey]);

  const handleDeleteWeight = createDeleteHandler(
    "weight",
    bodyTrackingApi.deleteWeightEntry,
    setWeightHistory,
    setDayModal,
    alert,
  );

  const deleteWeightEntry = withConfirm<WeightEntry>(
    alert,
    (entry) =>
      weightUnit === "kg"
        ? `Remove ${Number(entry.weightKg).toFixed(1)} kg?`
        : `Remove ${(Number(entry.weightKg) * 2.20462).toFixed(1)} lbs?`,
    handleDeleteWeight,
  );

  const addWeight = useCallback(async (value: string): Promise<boolean> => {
    const parsed = parseDecimal(value);
    if (parsed === null || parsed <= 0) {
      alert("Invalid Input", "Enter a valid weight, e.g. 80 or 82.5", [{ text: "OK" }], "error");
      return false;
    }
    if (displayToKg(value, weightUnit) > MAX_WEIGHT_KG) {
      alert(
        "Invalid Input",
        `That's over ${MAX_WEIGHT_KG} kg. Check the number.`,
        [{ text: "OK" }],
        "error",
      );
      return false;
    }
    try {
      const recordedAt = selectedLogDate
        ? buildLocalISOForDate(selectedLogDate, "08:00")
        : null;
      await bodyTrackingApi.logWeight(
        parsed,
        weightUnit,
        null,
        recordedAt,
      );
      setShowWeightModal(false);
      setSelectedLogDate(null);
      loadData();
      return true;
    } catch (err) {
      alert("Couldn't log weight", describeError(err), [{ text: "OK" }], "error");
      return false;
    }
  }, [weightUnit, selectedLogDate, buildLocalISOForDate, alert, loadData, setSelectedLogDate]);

  const getWeightTrend = useCallback(() => {
    if (weightHistory.length < 2) return null;
    const currentEntry = weightHistory[0];
    const currentWeight = Number(currentEntry.weightKg);
    // The window is the N days before the latest weigh-in, so an irregular
    // log compares against a date window, not the last N entries, and a
    // weekly weigh-in still lands inside the 7-day window.
    const windowStart = new Date(currentEntry.recordedAt);
    windowStart.setHours(0, 0, 0, 0);
    windowStart.setDate(windowStart.getDate() - trendAverageDays);
    const compareEntries = weightHistory.slice(1).filter((entry) => {
      const recorded = new Date(entry.recordedAt);
      recorded.setHours(0, 0, 0, 0);
      return recorded >= windowStart;
    });
    if (compareEntries.length === 0) return null;
    const avgWeight =
      compareEntries.reduce((sum, e) => sum + Number(e.weightKg), 0) /
      compareEntries.length;
    if (!Number.isFinite(currentWeight) || !Number.isFinite(avgWeight) || avgWeight <= 0)
      return null;
    const diff = currentWeight - avgWeight;
    const percentChange = (diff / avgWeight) * 100;
    let direction: "up" | "down" | "stable" = "stable";
    if (diff > 0) direction = "up";
    else if (diff < 0) direction = "down";
    return {
      diff,
      percentChange,
      direction,
      avgWeight,
    };
  }, [weightHistory, trendAverageDays]);

  const getWeightChartData = useCallback(() => {
    if (weightHistory.length < 2) return { labels: [], datasets: [{ data: [] }] };
    return toTrendChartData(
      weightHistory.map((entry) => ({
        at: entry.recordedAt,
        value:
          weightUnit === "kg"
            ? Number(entry.weightKg)
            : Number(entry.weightKg) * 2.20462,
      })),
    );
  }, [weightHistory, weightUnit]);

  const loadMoreWeightEntries = useCallback(() => {
    setWeightEntriesShown((prev) => Math.min(prev + 10, weightHistory.length));
  }, [weightHistory.length]);

  const weightDates = useMemo(
    () => new Set(weightHistory.map((e) => isoToLocalDateStr(e?.recordedAt))),
    [weightHistory],
  );

  const hasWeightData = useCallback(
    (date: Date) => weightDates.has(toDateString(date)),
    [weightDates],
  );

  const openWeightModal = useCallback(() => setShowWeightModal(true), []);

  return {
    weightHistory, setWeightHistory,
    weightUnit, setWeightUnit: saveWeightUnit,
    showWeightModal, setShowWeightModal,
    weightEntriesShown, setWeightEntriesShown,
    trendAverageDays, setTrendAverageDays,
    height, setHeight,
    heightUnit, setHeightUnit,
    showHeightModal, setShowHeightModal,
    getUserKey,
    handleDeleteWeight,
    deleteWeightEntry,
    addWeight,
    getWeightTrend,
    getWeightChartData,
    loadMoreWeightEntries,
    hasWeightData,
    openWeightModal,
    saveHeight,
  };
}
