import { create, act } from "react-test-renderer";
import { useProgramOperations } from "../useProgramOperations";
import { markProgramDirty } from "../../../services/programDirty";
import { captureException } from "../../../services/crashReporting";
import { CUSTOM_EXERCISE_ID, type WorkoutData } from "../../../types";
import type { ProgramApi } from "@features/plan/services/programApiFactory";

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  }),
}));
jest.mock("../../../services/programDirty", () => ({
  markProgramDirty: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../../services/crashReporting", () => ({
  captureException: jest.fn(),
  log: { warn: jest.fn() },
  metric: { count: jest.fn() },
}));

const program = (): WorkoutData =>
  ({
    days: [
      {
        dayNumber: 1,
        split: {
          A: {
            exercises: [
              {
                name: "Ab Roller",
                exerciseId: "Ab_Roller",
                sets: 3,
                primaryMuscles: ["abdominals"],
              },
            ],
            totalSets: 3,
          },
        },
      },
    ],
  }) as unknown as WorkoutData;

const offline = () => Promise.reject(new Error("Network request failed"));

function mount(
  overrides: Partial<Record<keyof ProgramApi, jest.Mock>> = {},
  saveToStorage = jest.fn().mockResolvedValue(true),
) {
  const setWorkoutData = jest.fn();
  const programApi = {
    renameExercise: jest.fn().mockResolvedValue(undefined),
    updateExerciseMachines: jest.fn().mockResolvedValue(undefined),
    patchExerciseSets: jest.fn().mockResolvedValue(undefined),
    addExercise: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  let api: ReturnType<typeof useProgramOperations>;
  function Probe() {
    api = useProgramOperations({
      workoutData: program(),
      setWorkoutData,
      userId: "u1",
      saveToStorage,
      STORAGE_KEYS: { WORKOUT_DATA: "@workout_data" },
      programApi: programApi as unknown as ProgramApi,
    });
    return null;
  }
  act(() => {
    create(<Probe />);
  });
  return { api: api!, setWorkoutData, programApi };
}

const savedSplit = (setWorkoutData: jest.Mock) =>
  (setWorkoutData.mock.calls.at(-1)![0] as WorkoutData).days[0].split;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("a program edit whose server write fails", () => {
  const edits: [string, keyof ProgramApi, (api: ReturnType<typeof useProgramOperations>) => Promise<void>][] = [
    ["rename", "renameExercise", (a) => a.updateExerciseName(1, "A", 0, "Air Bike")],
    ["machines", "updateExerciseMachines", (a) => a.updateExerciseMachines(1, "A", 0, { machines: ["M1"] })],
    ["set count", "patchExerciseSets", (a) => a.addExtraSetsToExercise(1, "A", 0, 1)],
    ["new exercise", "addExercise", (a) => a.addNewExercise(1, "A", { name: "Air Bike", sets: 2 })],
  ];

  it.each(edits)(
    "keeps the %s edit locally and marks the program dirty so the next sync doesn't revert it",
    async (_label, method, run) => {
      const { api, setWorkoutData } = mount({ [method]: jest.fn(offline) });
      await act(async () => {
        await run(api);
      });
      expect(setWorkoutData).toHaveBeenCalled();
      expect(markProgramDirty).toHaveBeenCalledWith("u1");
    },
  );

  it("does not mark the program dirty when the server write succeeds", async () => {
    const { api } = mount();
    await act(async () => {
      await api.addExtraSetsToExercise(1, "A", 0, 1);
    });
    expect(markProgramDirty).not.toHaveBeenCalled();
  });
});

describe("a program edit whose local save throws", () => {
  it("reports the failure instead of rejecting into the screen", async () => {
    const { api, setWorkoutData, programApi } = mount(
      {},
      jest.fn().mockRejectedValue(new Error("disk full")),
    );
    await act(async () => {
      await expect(api.addExtraSetsToExercise(1, "A", 0, 1)).resolves.toBeUndefined();
    });
    expect(setWorkoutData).not.toHaveBeenCalled();
    expect(programApi.patchExerciseSets).not.toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error), { op: "patchExerciseSets" });
  });
});

describe("addExtraSetsToExercise", () => {
  it("never removes the last set, sending the clamped change to the server", async () => {
    const { api, setWorkoutData, programApi } = mount();
    await act(async () => {
      await api.addExtraSetsToExercise(1, "A", 0, -5);
    });
    const split = savedSplit(setWorkoutData).A;
    expect(split.exercises[0].sets).toBe(1);
    expect(split.totalSets).toBe(1);
    expect(programApi.patchExerciseSets).toHaveBeenCalledWith(1, "A", 0, -2);
  });

  it("does nothing for a zero change", async () => {
    const { api, setWorkoutData, programApi } = mount();
    await act(async () => {
      await api.addExtraSetsToExercise(1, "A", 0, 0);
    });
    expect(setWorkoutData).not.toHaveBeenCalled();
    expect(programApi.patchExerciseSets).not.toHaveBeenCalled();
  });
});

describe("updateExerciseName", () => {
  it("re-resolves the id to the renamed database exercise and keeps muscles that weren't passed", async () => {
    const { api, setWorkoutData, programApi } = mount();
    await act(async () => {
      await api.updateExerciseName(1, "A", 0, "Air Bike");
    });
    const ex = savedSplit(setWorkoutData).A.exercises[0];
    expect(ex.exerciseId).toBe("Air_Bike");
    expect(ex.primaryMuscles).toEqual(["abdominals"]);
    expect(programApi.renameExercise).toHaveBeenCalledWith(1, "A", 0, "Air Bike", undefined, undefined, "Air_Bike");
  });

  it("marks a name with no database entry custom and stores the passed muscles", async () => {
    const { api, setWorkoutData } = mount();
    await act(async () => {
      await api.updateExerciseName(1, "A", 0, "My Weird Move", ["chest"], ["triceps"]);
    });
    const ex = savedSplit(setWorkoutData).A.exercises[0];
    expect(ex).toMatchObject({
      exerciseId: CUSTOM_EXERCISE_ID,
      primaryMuscles: ["chest"],
      secondaryMuscles: ["triceps"],
    });
  });
});

describe("updateExerciseMachines", () => {
  it("removes a machine cleared with null rather than storing null", async () => {
    const { api, setWorkoutData } = mount();
    await act(async () => {
      await api.updateExerciseMachines(1, "A", 0, { selectedMachine: null, defaultMachine: null });
    });
    const ex = savedSplit(setWorkoutData).A.exercises[0];
    expect(ex).not.toHaveProperty("selectedMachine");
    expect(ex).not.toHaveProperty("defaultMachine");
  });
});

describe("addNewExercise", () => {
  it("creates a split the day doesn't have yet", async () => {
    const { api, setWorkoutData } = mount();
    await act(async () => {
      await api.addNewExercise(1, "B", { name: "Air Bike", sets: 2 });
    });
    expect(savedSplit(setWorkoutData).B).toMatchObject({
      totalSets: 2,
      exercises: [{ name: "Air Bike", primaryMuscles: [], secondaryMuscles: [] }],
    });
  });

  it("ignores a day that isn't in the program", async () => {
    const { api, setWorkoutData, programApi } = mount();
    await act(async () => {
      await api.addNewExercise(9, "A", { name: "Air Bike", sets: 2 });
    });
    expect(setWorkoutData).not.toHaveBeenCalled();
    expect(programApi.addExercise).not.toHaveBeenCalled();
  });
});
