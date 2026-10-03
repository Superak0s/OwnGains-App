import { create, act } from "react-test-renderer";
import { useProgramOperations } from "../useProgramOperations";
import { programApi } from "@features/plan/services/index";
import { CUSTOM_EXERCISE_ID, type WorkoutData } from "../../../types";

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
    addExercise: jest.fn().mockResolvedValue(undefined),
    saveProgram: jest.fn().mockResolvedValue(undefined),
  },
}));

const program = (): WorkoutData =>
  ({
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [
              { name: "Ab Crunch Machine", exerciseId: "Ab_Crunch_Machine", sets: 3 },
              { name: "Air Bike", exerciseId: "Air_Bike", sets: 4 },
            ],
            totalSets: 7,
          },
        },
      },
    ],
  }) as unknown as WorkoutData;

function mount(workoutData: WorkoutData) {
  const setWorkoutData = jest.fn();
  let api: ReturnType<typeof useProgramOperations>;
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
  return { api: api!, setWorkoutData };
}

const savedSplit = (setWorkoutData: jest.Mock) =>
  setWorkoutData.mock.calls.at(-1)![0].days[0].split.A;

const add = async (
  name: string,
  extra: { exerciseId?: string } = {},
): Promise<{ split: ReturnType<typeof savedSplit> }> => {
  const { api, setWorkoutData } = mount(program());
  await act(async () => {
    await api.addNewExercise(1, "A", { name, sets: 2, ...extra });
  });
  return { split: savedSplit(setWorkoutData) };
};

describe("addNewExercise", () => {
  // completedDays is keyed by position, so a mid-session insert that shifted
  // indices would re-attach logged sets to the wrong exercise.
  it("appends, leaving the indices of already-logged exercises untouched", async () => {
    const { split } = await add("Air Bike Two");
    expect(split.exercises.map((e: { name: string }) => e.name)).toEqual([
      "Ab Crunch Machine",
      "Air Bike",
      "Air Bike Two",
    ]);
    expect(split.exercises[0].exerciseId).toBe("Ab_Crunch_Machine");
    expect(split.exercises[1].exerciseId).toBe("Air_Bike");
    expect(split.totalSets).toBe(9);
  });

  it("resolves an exact database name so the new exercise shows its photos", async () => {
    const { split } = await add("Ab Roller");
    expect(split.exercises.at(-1).exerciseId).toBe("Ab_Roller");
  });

  it("keeps an explicitly picked id", async () => {
    const { split } = await add("Whatever I Call It", {
      exerciseId: "Ab_Roller",
    });
    expect(split.exercises.at(-1).exerciseId).toBe("Ab_Roller");
  });

  it("marks a name with no database entry custom", async () => {
    const { split } = await add("Kostas Special Lift");
    expect(split.exercises.at(-1).exerciseId).toBe(CUSTOM_EXERCISE_ID);
  });

  it("syncs only the added exercise to the server", async () => {
    await add("Ab Roller");
    expect(programApi.addExercise).toHaveBeenCalledWith(
      1,
      "A",
      expect.objectContaining({ name: "Ab Roller", sets: 2 }),
    );
  });
});
