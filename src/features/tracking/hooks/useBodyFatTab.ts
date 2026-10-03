import type { DayModalState , BodyFatEntryWithFields } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useEffect, useMemo } from "react";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage"

import type { HeightData } from "@shared/types";
import { bodyFatApi } from "../services";
import { authService } from "@features/auth/services/index";
import { isFeatureLocal } from "@shared/services/localOnlyFeatures";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import { isoToLocalDateStr } from "../utils";
import { toDateString } from "@utils/format";
import { log, metric } from "@shared/services/crashReporting";

interface UseBodyFatTabDeps {
  alert: UseAlertReturn["alert"];
  loadData: () => void;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
  selectedLogDate: Date | null;
  setSelectedLogDate: (d: Date | null) => void;
  height: HeightData | null;
  getUserKey: (key: string) => string;
  savedFormulaSex?: "male" | "female" | null;
  openHeightModal: () => void;
}

export interface BodyFatInput {
  waist: string;
  neck: string;
  hip: string;
}

export function useBodyFatTab(deps: UseBodyFatTabDeps) {
  const { alert, loadData, setDayModal, selectedLogDate, setSelectedLogDate, height, getUserKey, savedFormulaSex, openHeightModal } = deps;

  const [bodyFatHistory, setBodyFatHistory] = useState<BodyFatEntryWithFields[]>([]);
  const [showBodyFatModal, setShowBodyFatModal] = useState(false);
  const [gender, setGender] = useState("male");
  const [measurementUnit, setMeasurementUnit] = useState("cm");

  useEffect(() => {
    (async () => {
      const stored = await getStorageItem(getUserKey("gender"));
      if (stored === "male" || stored === "female") setGender(stored);
      else if (savedFormulaSex) setGender(savedFormulaSex);
    })();
  }, [getUserKey, savedFormulaSex]);

  const handleDeleteBodyFat = createDeleteHandler(
    "bodyFat",
    bodyFatApi.deleteBodyFatEntry,
    setBodyFatHistory,
    setDayModal,
    alert,
  );

  const deleteBodyFatEntry = withConfirm<BodyFatEntryWithFields>(
    alert,
    (entry) =>
      `Remove ${entry.percentage ?? (entry as { bodyFatPercentage?: number }).bodyFatPercentage ?? 0}% reading?`,
    handleDeleteBodyFat,
  );

  const calculateBodyFat = useCallback(async ({ waist, neck, hip }: BodyFatInput): Promise<boolean> => {
    if (!waist || !neck || (gender === "female" && !hip)) {
      alert("Missing Data", "Please enter all measurements", [{ text: "OK" }], "error");
      return false;
    }
    const heightCm = height?.heightCm ? Number.parseFloat(String(height.heightCm)) : null;
    if (!heightCm) {
      alert(
        "Height Required",
        "Please set your height first.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Height",
            onPress: () => {
              setShowBodyFatModal(false);
              openHeightModal();
            },
          },
        ],
        "warning",
      );
      return false;
    }
    let waistCm = Number.parseFloat(waist);
    let neckCm = Number.parseFloat(neck);
    let hipCm = hip ? Number.parseFloat(hip) : 0;
    if (measurementUnit === "in") {
      waistCm *= 2.54;
      neckCm *= 2.54;
      hipCm *= 2.54;
    }
    let bodyFatPercentage;
    if (gender === "male") {
      bodyFatPercentage = 495 / (1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm)) - 450;
    } else {
      bodyFatPercentage = 495 / (1.29579 - 0.35004 * Math.log10(waistCm + hipCm - neckCm) + 0.221 * Math.log10(heightCm)) - 450;
    }
    if (!Number.isFinite(bodyFatPercentage) || bodyFatPercentage <= 0) {
      alert("Invalid Measurements", "Check your entries. Waist must be larger than neck.", [{ text: "OK" }], "error");
      return false;
    }
    try {
      const dateStr = selectedLogDate ? toDateString(selectedLogDate) : null;
      await bodyFatApi.logBodyFat(
        Number.parseFloat(bodyFatPercentage.toFixed(1)),
        { waist: waistCm, neck: neckCm, hip: hipCm, unit: "cm" },
        gender as "male" | "female",
        dateStr,
      );
      setSelectedLogDate(null);
      setShowBodyFatModal(false);
      alert("Body Fat Calculated", `Your body fat is ${bodyFatPercentage.toFixed(1)}%`, [{ text: "OK" }], "success");
      loadData();
      return true;
    } catch (error) {
      alert("Couldn't save result", describeError(error), [{ text: "OK" }], "error");
      return false;
    }
  }, [gender, measurementUnit, height, selectedLogDate, alert, loadData, setSelectedLogDate, openHeightModal]);

  const bodyFatDates = useMemo(
    () =>
      new Set(
        bodyFatHistory.map((b) => isoToLocalDateStr(b.date ?? b.recordedAt ?? b.calculatedAt)),
      ),
    [bodyFatHistory],
  );

  const hasBodyFatData = useCallback(
    (date: Date) => bodyFatDates.has(toDateString(date)),
    [bodyFatDates],
  );

  const openBodyFatModal = useCallback(() => setShowBodyFatModal(true), []);

  const setGenderPersist = useCallback(async (g: string) => {
    setGender(g);
    await setStorageItem(getUserKey("gender"), g);
    // Server falls back to this when a log omits bfFormulaSex. Save it
    // whether or not the write succeeds. A server that keeps tracking off its
    // disk must not receive body data through the profile either.
    if (await isFeatureLocal("tracking")) return;
    authService
      .updateProfile({ bfFormulaSex: g as "male" | "female" })
      .catch((err) => {
        console.warn("Failed to sync bfFormulaSex:", err);
        metric.count("tracking.bf_formula_sex_sync_failed");
        log.warn("tracking.bf_formula_sex_sync_failed");
      });
  }, [getUserKey]);

  return {
    bodyFatHistory, setBodyFatHistory,
    showBodyFatModal, setShowBodyFatModal,
    gender, setGender, setGenderPersist,
    measurementUnit, setMeasurementUnit,
    handleDeleteBodyFat,
    deleteBodyFatEntry,
    calculateBodyFat,
    hasBodyFatData,
    openBodyFatModal,
  };
}
