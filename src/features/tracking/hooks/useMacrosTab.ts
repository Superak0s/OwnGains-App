import type { DayModalState , MacrosEntryWithFields, SavedMacroFood } from "../types";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { useState, useCallback, useEffect, useMemo } from "react";
import type { MacrosEntry } from "@shared/types";

import { macrosTrackingApi } from "../services";
import { createDeleteHandler, withConfirm, describeError } from "../helpers";
import { isoToLocalDateStr, toNumberOrUndefined } from "../utils";
import { toDateString , generateId } from "@utils/format";

import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { useAuth } from "@shared/context/AuthContext";

interface MacrosStat {
  total: number;
  min: number;
  max: number;
  goal: number | null;
  percentage: number;
}

interface NormalizedMacrosEntry {
  id: string | number;
  name?: string;
  date?: string;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  calories: number | null;
  errorMargin: number;
}

export interface DailyMacrosStats {
  protein: MacrosStat | null;
  carbs: MacrosStat | null;
  fat: MacrosStat | null;
  calories: MacrosStat | null;
  entries: number;
  entriesList: NormalizedMacrosEntry[];
}

export interface MacrosEntryInput {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  time: string;
  errorMargin: string;
  remember: boolean;
}

export interface MacrosGoalInput {
  protein: string;
  carbs: string;
  fat: string;
  calories: string;
}

interface UseMacrosTabDeps {
  alert: UseAlertReturn["alert"];
  loadData: () => void;
  setDayModal: (updater: (prev: DayModalState | null) => DayModalState | null) => void;
  selectedLogDate: Date | null;
  setSelectedLogDate: (d: Date | null) => void;
}

export function useMacrosTab(deps: UseMacrosTabDeps) {
  const { alert, loadData, setDayModal, selectedLogDate, setSelectedLogDate } = deps;
  const { user } = useAuth();

  const [macrosEntries, setMacrosEntries] = useState<MacrosEntryWithFields[]>([]);
  const [savedFoods, setSavedFoods] = useState<SavedMacroFood[]>([]);
  const [dailyMacrosGoals, setDailyMacrosGoals] = useState({
    protein: 150,
    carbs: 250,
    fat: 65,
    calories: 2000,
  });
  const [showMacrosModal, setShowMacrosModal] = useState(false);
  const [showMacrosGoalModal, setShowMacrosGoalModal] = useState(false);

  useEffect(() => {
    loadFromStorage<SavedMacroFood[]>(STORAGE_KEYS.MACROS_SAVED_FOODS, user?.id ?? null).then(
      (saved) => setSavedFoods(saved ?? []),
    );
  }, [user?.id]);

  // Saved goals, or the defaults for whichever the user never set. Without this
  // setMacrosGoals was write-only: the stats bars fell back to the hardcoded
  // numbers on every app start.
  useEffect(() => {
    macrosTrackingApi
      .getMacrosGoals()
      .then((saved) =>
        setDailyMacrosGoals((current) => ({
          protein: saved.protein ?? current.protein,
          carbs: saved.carbs ?? current.carbs,
          fat: saved.fat ?? current.fat,
          calories: saved.calories ?? current.calories,
        })),
      )
      .catch(() => {});
  }, [user?.id]);

  const handleDeleteMacro = createDeleteHandler(
    "macros",
    macrosTrackingApi.deleteMacrosEntry,
    setMacrosEntries,
    setDayModal,
    alert,
    () => loadData(),
  );

  const deleteMacroEntry = withConfirm<MacrosEntry>(
    alert,
    (entry) => (entry.name ? `Remove "${entry.name}"?` : "Remove this entry?"),
    handleDeleteMacro,
  );

  const addMacrosEntry = useCallback(async (form: MacrosEntryInput): Promise<boolean> => {
    const protein = toNumberOrUndefined(form.protein);
    const carbs = toNumberOrUndefined(form.carbs);
    const fat = toNumberOrUndefined(form.fat);
    const calories = toNumberOrUndefined(form.calories);
    const name = form.name.trim();

    const hasValue = protein != null || carbs != null || fat != null || calories != null;
    if (!hasValue && !name) {
      alert("Nothing to log", "Enter at least a name or one value", [{ text: "OK" }], "warning");
      return false;
    }

    try {
      const dateStr = selectedLogDate ? toDateString(selectedLogDate) : null;
      const errorMargin = Number.parseFloat(form.errorMargin) || 0;
      await macrosTrackingApi.logMacros({
        name: name || undefined,
        protein,
        carbs,
        fat,
        calories,
        errorMargin,
        time: form.time,
        date: dateStr,
      });

      if (form.remember && name) {
        const food: SavedMacroFood = {
          id: generateId(),
          name,
          protein,
          carbs,
          fat,
          calories,
          errorMargin,
        };
        const next = [food, ...savedFoods.filter((f) => f.name !== food.name)];
        setSavedFoods(next);
        saveToStorage(STORAGE_KEYS.MACROS_SAVED_FOODS, next, user?.id ?? null);
      }

      setShowMacrosModal(false);
      setSelectedLogDate(null);
      loadData();
      return true;
    } catch (error) {
      alert("Couldn't log macros", describeError(error), [{ text: "OK" }], "error");
      return false;
    }
  }, [savedFoods, user?.id, selectedLogDate, alert, loadData, setSelectedLogDate]);

  const quickLogSavedFood = useCallback(
    async (food: SavedMacroFood) => {
      try {
        await macrosTrackingApi.logMacros({
          name: food.name,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          calories: food.calories,
          errorMargin: food.errorMargin ?? 0,
          time: new Date().toTimeString().slice(0, 5),
          date: selectedLogDate ? toDateString(selectedLogDate) : null,
        });
        setShowMacrosModal(false);
        setSelectedLogDate(null);
        loadData();
      } catch (error) {
        alert("Couldn't log food", describeError(error), [{ text: "OK" }], "error");
      }
    },
    [selectedLogDate, alert, loadData, setSelectedLogDate],
  );

  const removeSavedFood = useCallback(
    (id: string) => {
      const next = savedFoods.filter((f) => f.id !== id);
      setSavedFoods(next);
      saveToStorage(STORAGE_KEYS.MACROS_SAVED_FOODS, next, user?.id ?? null);
    },
    [savedFoods, user?.id],
  );

  const getDailyMacrosStats = useCallback((date: Date): DailyMacrosStats | null => {
    const dateStr = toDateString(date);
    const entries = macrosEntries.filter(
      (e) => isoToLocalDateStr(e.date ?? e.loggedAt) === dateStr,
    );
    if (entries.length === 0) return null;
    const normed: NormalizedMacrosEntry[] = entries.map((e: MacrosEntryWithFields) => ({
      id: e.id,
      name: e.name,
      date: e.date ?? e.loggedAt,
      protein: e.protein == null ? null : Number.parseFloat(String(e.protein)),
      carbs: e.carbs == null ? null : Number.parseFloat(String(e.carbs)),
      fat: e.fat == null ? null : Number.parseFloat(String(e.fat)),
      calories:
        e.calories == null ? null : Number.parseFloat(String(e.calories)),
      errorMargin: Number.parseFloat(String(e.errorMargin ?? 0)) || 0,
    }));
    type MacroField = "protein" | "carbs" | "fat" | "calories";
    const avgError = normed.reduce((s, e) => s + e.errorMargin, 0) / normed.length;
    const makeStat = (field: MacroField, goal: number | null) => {
      if (normed.every((e) => e[field] == null)) return null;
      const total = normed.reduce((s, e) => s + (e[field] ?? 0), 0);
      return {
        total,
        min: total * (1 - avgError / 100),
        max: total * (1 + avgError / 100),
        goal,
        percentage: goal != null && goal > 0 ? (total / goal) * 100 : 0,
      };
    };
    return {
      protein: makeStat("protein", dailyMacrosGoals.protein),
      carbs: makeStat("carbs", dailyMacrosGoals.carbs),
      fat: makeStat("fat", dailyMacrosGoals.fat),
      calories: makeStat("calories", dailyMacrosGoals.calories),
      entries: normed.length,
      entriesList: normed,
    };
  }, [macrosEntries, dailyMacrosGoals]);

  const updateMacrosGoals = useCallback(async (input: MacrosGoalInput): Promise<boolean> => {
    const goals = {
      protein: Number.parseFloat(input.protein),
      carbs: Number.parseFloat(input.carbs),
      fat: Number.parseFloat(input.fat),
      calories: Number.parseFloat(input.calories),
    };
    if (Object.values(goals).some((value) => Number.isNaN(value) || value <= 0)) {
      alert("Invalid Input", "Please enter valid goals", [{ text: "OK" }], "error");
      return false;
    }
    try {
      await macrosTrackingApi.setMacrosGoals(goals);
      setDailyMacrosGoals(goals);
      setShowMacrosGoalModal(false);
      return true;
    } catch (error) {
      alert("Couldn't save goals", describeError(error), [{ text: "OK" }], "error");
      return false;
    }
  }, [alert]);

  const macrosDates = useMemo(
    () => new Set(macrosEntries.map((e) => isoToLocalDateStr(e.date ?? e.loggedAt))),
    [macrosEntries],
  );

  const hasMacrosData = useCallback(
    (date: Date) => macrosDates.has(toDateString(date)),
    [macrosDates],
  );

  const openMacrosModal = useCallback(() => setShowMacrosModal(true), []);

  return {
    macrosEntries, setMacrosEntries,
    dailyMacrosGoals, setDailyMacrosGoals,
    showMacrosModal, setShowMacrosModal,
    showMacrosGoalModal, setShowMacrosGoalModal,
    handleDeleteMacro,
    deleteMacroEntry,
    addMacrosEntry,
    getDailyMacrosStats,
    updateMacrosGoals,
    hasMacrosData,
    openMacrosModal,
    savedFoods,
    quickLogSavedFood,
    removeSavedFood,
  };
}
