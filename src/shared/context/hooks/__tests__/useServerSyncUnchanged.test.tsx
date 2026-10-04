import { useState } from "react";
import { create, act } from "react-test-renderer";
import { useServerSync } from "../useServerSync";
import { STORAGE_KEYS } from "@shared/services/storage";
import type { CompletedDays, LockedDays, WorkoutData } from "../../../types";

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  }),
}));

jest.mock("@shared/services/programDirty", () => ({
  isProgramDirty: jest.fn(async () => false),
  clearProgramDirty: jest.fn(),
}));

const program = {
  days: [{ dayNumber: 1, split: { push: { exercises: [{ name: "Bench" }] } } }],
} as unknown as WorkoutData;

const session = {
  id: 7,
  dayNumber: 1,
  startTime: new Date().toISOString(),
  endTime: new Date().toISOString(),
  setTimings: [
    { exerciseName: "Bench", setIndex: 0, weight: 100, reps: 5, endTime: new Date().toISOString() },
  ],
};

const workoutApi = { getSessionHistory: jest.fn(async () => [session]) };
const programApi = { fetchSavedProgram: jest.fn(async () => null) };

it("writes and sets completed and locked days only when a sync changes them", async () => {
  const saveToStorage = jest.fn().mockResolvedValue(true);
  const setCompleted = jest.fn();
  const setLocked = jest.fn();
  let sync!: () => Promise<unknown>;

  function Harness() {
    const [completedDays, setCompletedDays] = useState<CompletedDays>({});
    const [lockedDays, setLockedDays] = useState<LockedDays>({});
    ({ syncFromServer: sync } = useServerSync({
      userId: "u1",
      selectedSplit: "push",
      workoutData: program,
      setWorkoutData: jest.fn(),
      completedDays,
      lockedDays,
      setCompletedDays: (d) => {
        setCompleted(d);
        setCompletedDays(d);
      },
      setLockedDays: (d) => {
        setLocked(d);
        setLockedDays(d);
      },
      currentSessionId: null,
      unlockedOverrides: {},
      saveToStorage,
      STORAGE_KEYS,
      clearActiveWorkout: jest.fn(),
      workoutApi: workoutApi as never,
      programApi: programApi as never,
    }));
    return null;
  }

  await act(async () => {
    create(<Harness />);
  });
  await act(async () => {
    await sync();
  });
  await act(async () => {
    await sync();
  });

  const writes = (key: string) =>
    saveToStorage.mock.calls.filter(([k]) => k === key).length;
  expect(writes(STORAGE_KEYS.COMPLETED_DAYS)).toBe(1);
  expect(writes(STORAGE_KEYS.LOCKED_DAYS)).toBe(1);
  expect(setCompleted).toHaveBeenCalledTimes(1);
  expect(setLocked).toHaveBeenCalledTimes(1);
});
