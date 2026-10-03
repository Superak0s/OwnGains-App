import { create, act } from "react-test-renderer";
import { useProgramOperations } from "../useProgramOperations";
import { programApi } from "@features/plan/services/index";
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
    renameExercise: jest.fn().mockResolvedValue(undefined),
    saveProgram: jest.fn().mockResolvedValue(undefined),
    updateExerciseMachines: jest.fn().mockResolvedValue(undefined),
  },
}));

const program = (exercise: Record<string, unknown>): WorkoutData =>
  ({
    days: [{ dayNumber: 1, split: { A: { exercises: [exercise] } } }],
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

const savedExercise = (setWorkoutData: jest.Mock) =>
  setWorkoutData.mock.calls.at(-1)![0].days[0].split.A.exercises[0];

describe("updateExerciseName", () => {
  it("renames without inventing machines", async () => {
    const { api, setWorkoutData } = mount(
      program({ name: "Chest Press", sets: 3, machines: ["Machine A"] }),
    );
    await act(async () => {
      await api.updateExerciseName(1, "A", 0, "Incline Chest Press");
    });
    const saved = savedExercise(setWorkoutData);
    expect(saved.name).toBe("Incline Chest Press");
    expect(saved.machines).toEqual(["Machine A"]);
  });
});

describe("updateExerciseMachines", () => {
  it("patches the machine list and syncs just that exercise", async () => {
    const { api, setWorkoutData } = mount(
      program({ name: "A", sets: 3, machines: ["A", "B"] }),
    );
    await act(async () => {
      await api.updateExerciseMachines(1, "A", 0, { machines: ["A"] });
    });
    expect(savedExercise(setWorkoutData).machines).toEqual(["A"]);
    // Must be the per-field PATCH, never saveProgram: /api/program/upload is a
    // whole-program replace and the server denies it to trainers, so syncing
    // this way would 403 silently in trainer mode.
    expect(programApi.updateExerciseMachines).toHaveBeenCalledWith(1, "A", 0, {
      machines: ["A"],
    });
    expect(programApi.saveProgram).not.toHaveBeenCalled();
  });

  it("patches the best-stats flag without touching the list", async () => {
    const { api, setWorkoutData } = mount(
      program({ name: "A", sets: 3, machines: ["A", "B"] }),
    );
    await act(async () => {
      await api.updateExerciseMachines(1, "A", 0, {
        bestAcrossMachines: true,
      });
    });
    const saved = savedExercise(setWorkoutData);
    expect(saved.bestAcrossMachines).toBe(true);
    expect(saved.machines).toEqual(["A", "B"]);
  });

  it("switches the selected machine without touching the name", async () => {
    const { api, setWorkoutData } = mount(
      program({
        name: "Chest Press",
        sets: 3,
        machines: ["Machine A", "Smith"],
        selectedMachine: "Machine A",
      }),
    );
    await act(async () => {
      await api.updateExerciseMachines(1, "A", 0, {
        selectedMachine: "Smith",
      });
    });
    const saved = savedExercise(setWorkoutData);
    expect(saved.name).toBe("Chest Press");
    expect(saved.selectedMachine).toBe("Smith");
  });

  it("ignores an exercise index that does not exist", async () => {
    const { api, setWorkoutData } = mount(program({ name: "A", sets: 3 }));
    await act(async () => {
      await api.updateExerciseMachines(1, "A", 7, { machines: [] });
    });
    expect(setWorkoutData).not.toHaveBeenCalled();
  });
});
