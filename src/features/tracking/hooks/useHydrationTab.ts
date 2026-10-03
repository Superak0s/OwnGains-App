import type { DayModalState } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useMemo } from "react";
import type { HydrationEntry } from "../services/types";
import { DEFAULT_HYDRATION_SETTINGS } from "../services/types";
import { hydrationApi } from "../services";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import { isoToLocalDateStr } from "../utils";
import { useRetryKey } from "./useRetryKey";
import { toDateString } from "@utils/format";

interface UseHydrationTabDeps {
  alert: UseAlertReturn["alert"];
  loadTabData: () => Promise<void>;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
  selectedLogDate: Date | null;
  setSelectedLogDate: (d: Date | null) => void;
  buildLocalISOForDate: (d: Date, t?: string) => string;
}

export function useHydrationTab(deps: UseHydrationTabDeps) {
  const { alert, loadTabData, setDayModal, selectedLogDate, setSelectedLogDate, buildLocalISOForDate } = deps;

  const [hydrationEntries, setHydrationEntries] = useState<HydrationEntry[]>([]);
  const [showHydrationModal, setShowHydrationModal] = useState(false);
  const [newHydrationAmount, setNewHydrationAmount] = useState("");
  const [hydrationGoal, setHydrationGoal] = useState(DEFAULT_HYDRATION_SETTINGS.goalMl);
  const retryKey = useRetryKey();

  const handleDeleteHydration = createDeleteHandler(
    "hydration",
    hydrationApi.deleteHydrationEntry,
    setHydrationEntries,
    setDayModal,
    alert,
  );

  const deleteHydrationEntry = withConfirm<HydrationEntry>(
    alert,
    () => "Remove this hydration entry?",
    handleDeleteHydration,
  );

  const handleLogHydration = useCallback(async () => {
    const amt = Number.parseFloat(newHydrationAmount);
    if (!newHydrationAmount || Number.isNaN(amt))
      return alert("Invalid Input", "Enter a valid amount in ml", [{ text: "OK" }], "error");
    try {
      const loggedAt = selectedLogDate
        ? buildLocalISOForDate(selectedLogDate, "08:00")
        : null;
      await hydrationApi.logHydration(
        amt,
        undefined,
        loggedAt,
        retryKey.keyFor(`${amt}|${loggedAt ?? ""}`),
      );
      retryKey.reset();
      setNewHydrationAmount("");
      setShowHydrationModal(false);
      setSelectedLogDate(null);
      loadTabData();
    } catch (err) {
      alert("Couldn't log hydration", describeError(err), [{ text: "OK" }], "error");
    }
  }, [newHydrationAmount, selectedLogDate, buildLocalISOForDate, alert, loadTabData, setSelectedLogDate, retryKey]);

  const hydrationDates = useMemo(
    () => new Set(hydrationEntries.map((h) => isoToLocalDateStr(h.loggedAt))),
    [hydrationEntries],
  );

  const hasHydrationData = useCallback(
    (date: Date) => hydrationDates.has(toDateString(date)),
    [hydrationDates],
  );

  return {
    hydrationEntries, setHydrationEntries,
    showHydrationModal, setShowHydrationModal,
    newHydrationAmount, setNewHydrationAmount,
    hydrationGoal, setHydrationGoal,
    handleDeleteHydration,
    deleteHydrationEntry,
    handleLogHydration,
    hasHydrationData,
  };
}
