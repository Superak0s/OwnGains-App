import { create, act } from "react-test-renderer";
import { useProgramOperations } from "../useProgramOperations";
import type { WorkoutData } from "../../../types";

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  }),
}));

jest.mock("@features/plan/services/index", () => ({
  programApi: {
    patchExerciseSets: jest.fn().mockResolvedValue(undefined),
  },
}));

const workoutData = {
  days: [
    { dayNumber: 1, split: { A: { totalSets: 3, exercises: [{ name: "Squat", sets: 3 }] } } },
  ],
} as unknown as WorkoutData;

it("keeps both of two edits fired before a re-render", async () => {
  const setWorkoutData = jest.fn();
  let api!: ReturnType<typeof useProgramOperations>;
  function Probe() {
    api = useProgramOperations({
      workoutData,
      setWorkoutData,
      userId: "u1",
      saveToStorage: jest.fn().mockResolvedValue(true),
      STORAGE_KEYS: { WORKOUT_DATA: "@workout_data" },
    });
    return null;
  }
  act(() => {
    create(<Probe />);
  });

  await act(async () => {
    await Promise.all([
      api.addExtraSetsToExercise(1, "A", 0, 1),
      api.addExtraSetsToExercise(1, "A", 0, 1),
    ]);
  });

  const saved = setWorkoutData.mock.calls.at(-1)![0].days[0].split.A;
  expect(saved.exercises[0].sets).toBe(5);
  expect(saved.totalSets).toBe(5);
});
