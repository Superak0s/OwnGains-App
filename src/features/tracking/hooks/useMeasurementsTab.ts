import type { DayModalState } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useMemo } from "react";
import type { MeasurementEntry } from "../services/types";
import { bodyMeasurementsApi, customMeasurementsApi } from "../services";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import { isoToLocalDateStr } from "../utils";
import { toDateString } from "@utils/format";

interface UseMeasurementsTabDeps {
  alert: UseAlertReturn["alert"];
  loadTabData: () => Promise<void>;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
  selectedLogDate: Date | null;
  setSelectedLogDate: (d: Date | null) => void;
  buildLocalISOForDate: (d: Date, t?: string) => string;
}

export interface MeasurementInput {
  waist: string;
  armLeft: string;
  armRight: string;
  chest: string;
  customPart: string;
  customValue: string;
}

/** Which of the form's fields were saved, so a partial failure clears only what was saved. */
export type MeasurementLogResult = "all" | "standard" | "none";

const toOptionalNumber = (value: string) =>
  value ? Number.parseFloat(value) : undefined;

export function useMeasurementsTab(deps: UseMeasurementsTabDeps) {
  const { alert, loadTabData, setDayModal, selectedLogDate, setSelectedLogDate, buildLocalISOForDate } = deps;

  const [measurementHistory, setMeasurementHistory] = useState<MeasurementEntry[]>([]);
  const [showMeasurementModal, setShowMeasurementModal] = useState(false);

  const handleDeleteMeasurement = createDeleteHandler(
    "measurements",
    bodyMeasurementsApi.deleteMeasurementEntry,
    setMeasurementHistory,
    setDayModal,
    alert,
  );

  const deleteMeasurementEntry = withConfirm<MeasurementEntry>(
    alert,
    () => "Remove this measurement?",
    handleDeleteMeasurement,
  );

  const ensureCustomMeasurementType = async (label: string) => {
    const normalizedLabel = label.trim();
    const keyName = normalizedLabel.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
    try {
      return await customMeasurementsApi.createType(keyName, normalizedLabel, "cm");
    } catch (error) {
      const types = await customMeasurementsApi.listTypes();
      const existing = types?.data?.find(
        (type) => type.keyName === keyName || type.label.toLowerCase() === normalizedLabel.toLowerCase(),
      );
      if (existing) return existing;
      throw error;
    }
  };

  const handleLogMeasurement = useCallback(async (form: MeasurementInput): Promise<MeasurementLogResult> => {
    const { waist, armLeft, armRight, chest, customPart, customValue } = form;
    const hasStandard = [waist, armLeft, armRight, chest].some((v) => v.trim() !== "");
    const hasCustom = customPart.trim() !== "" && customValue.trim() !== "";
    const invalid = (message: string) => {
      alert("Invalid Input", message, [{ text: "OK" }], "error");
      return "none" as const;
    };

    if (!hasStandard && !hasCustom)
      return invalid("Enter at least one measurement or a custom body part");
    if (customValue.trim() !== "" && Number.isNaN(Number.parseFloat(customValue)))
      return invalid("Enter a valid value for the custom body part");
    for (const [label, value] of [
      ["waist", waist],
      ["left arm", armLeft],
      ["right arm", armRight],
      ["chest", chest],
    ] as const)
      if (value.trim() !== "" && Number.isNaN(Number.parseFloat(value)))
        return invalid(`Enter a valid ${label} value`);

    let standardSaved = false;
    try {
      const recordedAt = selectedLogDate ? buildLocalISOForDate(selectedLogDate, "08:00") : undefined;
      if (hasStandard) {
        await bodyMeasurementsApi.logMeasurement(
          toOptionalNumber(waist),
          toOptionalNumber(armLeft),
          toOptionalNumber(armRight),
          toOptionalNumber(chest),
          recordedAt,
        );
        standardSaved = true;
      }
      if (hasCustom) {
        const type = await ensureCustomMeasurementType(customPart);
        await customMeasurementsApi.logValue(type.keyName, Number.parseFloat(customValue), recordedAt);
      }
      setShowMeasurementModal(false);
      setSelectedLogDate(null);
      loadTabData();
      return "all";
    } catch (err) {
      alert("Couldn't save measurement", describeError(err), [{ text: "OK" }], "error");
      return standardSaved ? "standard" : "none";
    }
  }, [selectedLogDate, buildLocalISOForDate, alert, loadTabData, setSelectedLogDate]);

  const measurementsDates = useMemo(
    () => new Set(measurementHistory.map((m) => isoToLocalDateStr(m.measuredAt))),
    [measurementHistory],
  );

  const hasMeasurementsData = useCallback(
    (date: Date) => measurementsDates.has(toDateString(date)),
    [measurementsDates],
  );

  return {
    measurementHistory, setMeasurementHistory,
    showMeasurementModal, setShowMeasurementModal,
    handleDeleteMeasurement,
    deleteMeasurementEntry,
    handleLogMeasurement,
    hasMeasurementsData,
  };
}
