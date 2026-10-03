import type { DayModalState } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useMemo } from "react";
import type { SorenessEntry } from "../services/types";
import { sorenessApi } from "../services";
import { createDeleteHandler, withConfirm } from "../helpers";
import { isoToLocalDateStr } from "../utils";
import { toDateString } from "@utils/format";

interface UseSorenessTabDeps {
  alert: UseAlertReturn["alert"];
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
}

export function useSorenessTab(deps: UseSorenessTabDeps) {
  const { alert, setDayModal } = deps;

  const [sorenessEntries, setSorenessEntries] = useState<SorenessEntry[]>([]);

  const handleDeleteSoreness = createDeleteHandler(
    "soreness",
    sorenessApi.deleteSorenessEntry,
    setSorenessEntries,
    setDayModal,
    alert,
  );

  const deleteSorenessEntry = withConfirm<SorenessEntry>(
    alert,
    () => "Remove this soreness entry?",
    handleDeleteSoreness,
  );

  const sorenessDates = useMemo(
    () => new Set(sorenessEntries.map((s) => isoToLocalDateStr(s.loggedAt))),
    [sorenessEntries],
  );

  const hasSorenessData = useCallback(
    (date: Date) => sorenessDates.has(toDateString(date)),
    [sorenessDates],
  );

  return {
    sorenessEntries, setSorenessEntries,
    handleDeleteSoreness,
    deleteSorenessEntry,
    hasSorenessData,
  };
}
