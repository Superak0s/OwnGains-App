import { create, act } from "react-test-renderer";

const kv: Record<string, string> = {};

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(async (k: string) => kv[k] ?? null),
  getStorageItems: jest.fn(async () => ({})),
  setStorageItem: jest.fn(async (k: string, v: string) => {
    kv[k] = v;
  }),
  removeStorageItem: jest.fn(async () => {}),
  removeStorageItems: jest.fn(async () => {}),
}));

import { useProgramOperations } from "../useProgramOperations";
import { programApi } from "@features/plan/services/off/program";
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { setRecordStoreUser } from "@shared/services/offlineHelpers";
import type { WorkoutData } from "../../../types";

const program = (): WorkoutData =>
  ({
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [{ name: "Air Bike", exerciseId: "Air_Bike", sets: 3 }],
            totalSets: 3,
          },
        },
      },
    ],
  }) as unknown as WorkoutData;

async function mount() {
  setRecordStoreUser("u1");
  await saveToStorage(STORAGE_KEYS.WORKOUT_DATA, program(), "u1");
  let api: ReturnType<typeof useProgramOperations>;
  function Probe() {
    api = useProgramOperations({
      workoutData: program(),
      setWorkoutData: jest.fn(),
      userId: "u1",
      saveToStorage,
      STORAGE_KEYS,
      programApi,
    });
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return api!;
}

const storedSplit = async () =>
  (await loadFromStorage<WorkoutData>(STORAGE_KEYS.WORKOUT_DATA, "u1"))!.days[0].split.A;

describe("offline program edits", () => {
  it("stores an added exercise once", async () => {
    const api = await mount();
    await act(() => api.addNewExercise(1, "A", { name: "Ab Roller", sets: 2 }));
    const split = await storedSplit();
    expect(split.exercises.map((e) => e.name)).toEqual(["Air Bike", "Ab Roller"]);
    expect(split.totalSets).toBe(5);
  });

  it("applies a set change once", async () => {
    const api = await mount();
    await act(() => api.addExtraSetsToExercise(1, "A", 0, 2));
    const split = await storedSplit();
    expect(split.exercises[0].sets).toBe(5);
    expect(split.totalSets).toBe(5);
  });
});
