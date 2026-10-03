import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useMemo } from "react";
import { menstrualApi } from "../services";
import type { CycleEntry, CycleStats, MenstrualPrefs } from "../services/types";
import {
  saveToStorage,
  loadFromStorage,
  STORAGE_KEYS,
} from "@shared/services/storage";
import {
  parseSafeDate,
  getCycleStartIso,
  getCycleDuration,
  computeUpcomingPredictedDays,
  daysSinceLocal,
  isoToLocalDateStr,
} from "../utils";
import { toDateString, formatDate } from "@utils/format";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import type { DayModalState } from "../types";
import { captureException } from "@shared/services/crashReporting";

interface UseMenstrualTabDeps {
  alert: UseAlertReturn["alert"];
  user?: { id?: string } | null;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
}

export function useMenstrualTab(deps: UseMenstrualTabDeps) {
  const { alert, user, setDayModal } = deps;

  const [cycleEntries, setCycleEntries] = useState<CycleEntry[]>([]);
  const [menstrualPrefs, setMenstrualPrefs] = useState<MenstrualPrefs>({
    cycleLengthDays: 28,
    periodLengthDays: 5,
  });
  const [newCycleStart, setNewCycleStart] = useState("");

  const [cycleActualDays, setCycleActualDays] = useState<Set<string>>(
    new Set(),
  );
  const [cyclePredictedDays, setCyclePredictedDays] = useState<Set<string>>(
    new Set(),
  );
  const [cycleStats, setCycleStats] = useState<CycleStats | null>(null);
  const [expandedCycleIds, setExpandedCycleIds] = useState<Set<string>>(
    new Set(),
  );

  const loadMenstrualData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const cyclesResp = await menstrualApi.getMenstrualHistory(24);
      const cycles = [...(cyclesResp?.data || [])]
        .sort((a, b) => {
          const bStart = parseSafeDate(getCycleStartIso(b))?.getTime() ?? 0;
          const aStart = parseSafeDate(getCycleStartIso(a))?.getTime() ?? 0;
          return bStart - aStart;
        });
      setCycleEntries(cycles);

      // The closured `menstrualPrefs` is stuck at whatever it was when this
      // callback was created, so the day-range math below reads this instead.
      let currentPrefs = menstrualPrefs;

      try {
        const settingsResp = await menstrualApi.getSettings();
        const settings = settingsResp?.data;
        if (settings) {
          const prefs = {
            cycleLengthDays:
              settings.cycleLengthDays ?? menstrualPrefs.cycleLengthDays,
            periodLengthDays:
              settings.periodDays ?? menstrualPrefs.periodLengthDays,
          };
          setMenstrualPrefs(prefs);
          currentPrefs = prefs;
          await saveToStorage(
            STORAGE_KEYS.MENSTRUAL_PREFS,
            prefs,
            String(user.id),
          );
        }
      } catch (e) {
        console.warn("Failed to load menstrual settings from server:", e);
        captureException(e, { stage: "loadMenstrualSettings" });
      }

      try {
        const prefs = await loadFromStorage<MenstrualPrefs>(
          STORAGE_KEYS.MENSTRUAL_PREFS,
          String(user.id),
        );
        if (prefs) {
          setMenstrualPrefs(prefs);
          currentPrefs = prefs;
        }
      } catch (e) {
        console.warn("Failed to load menstrual prefs", e);
        captureException(e, { stage: "loadMenstrualPrefs" });
      }

      try {
        const statsResp = await menstrualApi.getCycleStats({
          periodDays: currentPrefs.periodLengthDays,
          cycleLengthDays: currentPrefs.cycleLengthDays,
        });
        const stats = statsResp?.data;
        setCycleStats(stats ?? null);

        const actualSet = new Set<string>();
        const pd = currentPrefs.periodLengthDays || 5;

        const addRangeToSet = (
          startDate: Date,
          length: number,
          set: Set<string>,
        ) => {
          for (let i = 0; i < length; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            set.add(toDateString(d));
          }
        };

        cycles.forEach((c) => {
          const startIso = getCycleStartIso(c);
          if (!startIso) return;
          const start = parseSafeDate(startIso);
          if (!start) return;
          addRangeToSet(start, getCycleDuration(c, pd), actualSet);
        });

        const mostRecentStartIso =
          cycles.length > 0 ? getCycleStartIso(cycles[0]) : null;
        setCycleActualDays(actualSet);
        setCyclePredictedDays(
          new Set(
            computeUpcomingPredictedDays(
              mostRecentStartIso,
              currentPrefs.cycleLengthDays,
              pd,
            ),
          ),
        );
      } catch (e) {
        console.warn("Failed to compute menstrual stats/marks:", e);
        captureException(e, { stage: "computeMenstrualStats" });
        setCycleStats(null);
        setCycleActualDays(new Set());
        setCyclePredictedDays(new Set());
      }
    } catch (e) {
      console.warn("Failed to load menstrual history:", e);
      captureException(e, { stage: "loadMenstrualHistory" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- menstrualPrefs is set here, so depending on it would re-trigger the load effect forever
  }, [user]);

  const runDeleteCycleEntry = createDeleteHandler<CycleEntry & { id: number }>(
    "menstrual",
    (id) => menstrualApi.deleteMenstrualEntry(id),
    (updater) => setCycleEntries((prev) => updater(prev)),
    setDayModal,
    alert,
  );

  const deleteCycleEntry = withConfirm<CycleEntry & { id: number }>(
    alert,
    (entry) => {
      const start = parseSafeDate(getCycleStartIso(entry));
      return `Delete the period starting ${start ? formatDate(start) : "on this day"}?`;
    },
    runDeleteCycleEntry,
    "Delete Period Entry",
  );

  const toggleExpandedCycle = useCallback(
    (id: number | string | null | undefined) => {
      if (id == null) return;
      const key = String(id);
      setExpandedCycleIds((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    },
    [],
  );

  const cycleDates = useMemo(
    () => new Set(cycleEntries.map((c) => isoToLocalDateStr(c.cycleStart))),
    [cycleEntries],
  );

  const hasCycleData = useCallback(
    (date: Date) => cycleDates.has(toDateString(date)),
    [cycleDates],
  );

  const isOnPeriod = useMemo(() => {
    const latest = cycleEntries[0];
    if (!latest || latest.cycleEnd) return false;
    const start = parseSafeDate(getCycleStartIso(latest));
    if (!start) return false;
    const daysSince = daysSinceLocal(start);
    return daysSince >= 0 && daysSince < menstrualPrefs.periodLengthDays;
  }, [cycleEntries, menstrualPrefs.periodLengthDays]);

  const markPeriodOver = useCallback(async () => {
    if (!user?.id || cycleEntries.length === 0) return;
    const latest = cycleEntries[0];
    if (typeof latest.id !== "number") return;
    try {
      await menstrualApi.updateMenstrualCycle(latest.id, {
        cycleEnd: toDateString(new Date()),
      });
      await loadMenstrualData();
    } catch (err) {
      alert(
        "Couldn't update cycle",
        describeError(err),
        [{ text: "OK" }],
        "error",
      );
    }
  }, [user, cycleEntries, loadMenstrualData, alert]);

  return {
    cycleEntries,
    setCycleEntries,
    menstrualPrefs,
    setMenstrualPrefs,
    newCycleStart,
    setNewCycleStart,
    cycleActualDays,
    setCycleActualDays,
    cyclePredictedDays,
    setCyclePredictedDays,
    cycleStats,
    setCycleStats,
    expandedCycleIds,
    setExpandedCycleIds,
    toggleExpandedCycle,
    hasCycleData,
    loadMenstrualData,
    isOnPeriod,
    markPeriodOver,
    deleteCycleEntry,
  };
}
