import React from "react";
import { create, act } from "react-test-renderer";
import { useMacrosTab, type MacrosEntryInput } from "../useMacrosTab";
import { macrosTrackingApi } from "../../services";
import { saveToStorage, loadFromStorage } from "@shared/services/storage";
import type { MacrosEntryWithFields, SavedMacroFood } from "../../types";

jest.mock("../../services", () => ({
  macrosTrackingApi: {
    logMacros: jest.fn().mockResolvedValue(undefined),
    deleteMacrosEntry: jest.fn(),
    setMacrosGoals: jest.fn(),
    getMacrosGoals: jest
      .fn()
      .mockResolvedValue({ protein: null, carbs: null, fat: null, calories: null }),
  },
}));

jest.mock("@shared/services/storage", () => ({
  saveToStorage: jest.fn().mockResolvedValue(undefined),
  loadFromStorage: jest.fn().mockResolvedValue([]),
  STORAGE_KEYS: { MACROS_SAVED_FOODS: "tracking_macros_saved_foods" },
}));

jest.mock("@shared/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

const logMacros = macrosTrackingApi.logMacros as jest.Mock;
const saveToStorageMock = saveToStorage as jest.Mock;
const loadFromStorageMock = loadFromStorage as jest.Mock;

type Control = ReturnType<typeof useMacrosTab>;

const entry = (fields: Partial<MacrosEntryInput>): MacrosEntryInput => ({
  name: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  time: "12:00",
  errorMargin: "5",
  remember: false,
  ...fields,
});

function Harness({ controlRef }: { controlRef: React.MutableRefObject<Control | null> }) {
  const macros = useMacrosTab({
    alert: jest.fn(),
    loadData: jest.fn(),
    setDayModal: jest.fn(),
    selectedLogDate: null,
    setSelectedLogDate: jest.fn(),
  });
  controlRef.current = macros;
  return null;
}

async function mount() {
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} />);
  });
  return controlRef;
}

describe("useMacrosTab saved foods", () => {
  beforeEach(() => {
    logMacros.mockClear();
    saveToStorageMock.mockClear();
    loadFromStorageMock.mockResolvedValue([]);
  });

  it("saves a food to quick log when rememberMacrosEntry is on", async () => {
    const controlRef = await mount();

    await act(async () => {
      await controlRef.current!.addMacrosEntry(entry({ name: "Chicken & rice", protein: "40", remember: true }));
    });

    expect(saveToStorageMock).toHaveBeenCalledWith(
      "tracking_macros_saved_foods",
      [expect.objectContaining({ name: "Chicken & rice", protein: 40 })],
      "u1",
    );
  });

  it("does not save a food when rememberMacrosEntry is off", async () => {
    const controlRef = await mount();

    await act(async () => {
      await controlRef.current!.addMacrosEntry(entry({ name: "Oatmeal", calories: "300" }));
    });

    expect(saveToStorageMock).not.toHaveBeenCalled();
  });

  it("replaces an existing saved food with the same name instead of duplicating", async () => {
    const existing: SavedMacroFood = { id: "old", name: "Chicken & rice", protein: 30 };
    loadFromStorageMock.mockResolvedValue([existing]);
    const controlRef = await mount();

    await act(async () => {
      await controlRef.current!.addMacrosEntry(entry({ name: "Chicken & rice", protein: "40", remember: true }));
    });

    const savedList = saveToStorageMock.mock.calls[0][1] as SavedMacroFood[];
    expect(savedList).toHaveLength(1);
    expect(savedList[0]).toMatchObject({ name: "Chicken & rice", protein: 40 });
  });

  it("removeSavedFood drops only the matching id and persists the rest", async () => {
    loadFromStorageMock.mockResolvedValue([
      { id: "a", name: "Food A" },
      { id: "b", name: "Food B" },
    ]);
    const controlRef = await mount();

    await act(async () => {
      controlRef.current!.removeSavedFood("a");
    });

    expect(controlRef.current!.savedFoods).toEqual([{ id: "b", name: "Food B" }]);
    expect(saveToStorageMock).toHaveBeenCalledWith(
      "tracking_macros_saved_foods",
      [{ id: "b", name: "Food B" }],
      "u1",
    );
  });

  it("quickLogSavedFood logs the saved food's stored macros as-is", async () => {
    const controlRef = await mount();
    const food: SavedMacroFood = {
      id: "a",
      name: "Protein Shake",
      protein: 25,
      carbs: 5,
      fat: 2,
      calories: 150,
      errorMargin: 10,
    };

    await act(async () => {
      await controlRef.current!.quickLogSavedFood(food);
    });

    expect(logMacros).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Protein Shake",
        protein: 25,
        carbs: 5,
        fat: 2,
        calories: 150,
        errorMargin: 10,
      }),
    );
  });
});

describe("useMacrosTab getDailyMacrosStats", () => {
  it("computes totals, error-margin min/max, and goal percentage", async () => {
    const controlRef = await mount();
    const target = new Date("2026-08-14T12:00:00");

    await act(async () => {
      controlRef.current!.setMacrosEntries([
        {
          id: "1",
          date: target.toISOString(),
          protein: "50",
          calories: "500",
          errorMargin: "10",
        } as unknown as MacrosEntryWithFields,
        {
          id: "2",
          date: target.toISOString(),
          protein: "50",
          calories: "500",
          errorMargin: "10",
        } as unknown as MacrosEntryWithFields,
      ]);
    });

    const stats = controlRef.current!.getDailyMacrosStats(target);
    expect(stats).not.toBeNull();
    expect(stats!.protein!.total).toBe(100);
    expect(stats!.protein!.min).toBeCloseTo(90);
    expect(stats!.protein!.max).toBeCloseTo(110);
    expect(stats!.calories!.percentage).toBeCloseTo((1000 / 2000) * 100);
    expect(stats!.fat).toBeNull();
    expect(stats!.entries).toBe(2);
  });

  it("returns null when there are no entries for the date", async () => {
    const controlRef = await mount();
    expect(controlRef.current!.getDailyMacrosStats(new Date())).toBeNull();
  });
});
