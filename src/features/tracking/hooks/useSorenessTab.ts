import type { TabDeps } from "../types";
import { useState, useCallback, useMemo } from "react";
import type { SorenessEntry } from "../services/types";
import { useTrackingApis } from "../TrackingApisContext";
import { createDeleteHandler, withConfirm } from "../helpers";
import { isoToLocalDateStr } from "../utils";
import { toDateString } from "@utils/format";

type UseSorenessTabDeps = Pick<TabDeps, "alert" | "setDayModal">;

export function useSorenessTab(deps: UseSorenessTabDeps) {
  const { sorenessApi } = useTrackingApis();
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
