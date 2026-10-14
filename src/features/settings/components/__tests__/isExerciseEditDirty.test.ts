import { isExerciseEditDirty } from "../EditWorkoutHistoryModal";

const group = { exerciseName: "Bench Press", primaryMuscles: ["Chest", "Triceps"] };

describe("isExerciseEditDirty", () => {
  it("is clean when the inputs match the saved exercise", () => {
    expect(isExerciseEditDirty(group, " Bench Press ", "Chest, Triceps")).toBe(false);
    expect(isExerciseEditDirty(null, "anything", "")).toBe(false);
  });

  it("is dirty when the name or muscles change", () => {
    expect(isExerciseEditDirty(group, "Incline Bench", "Chest, Triceps")).toBe(true);
    expect(isExerciseEditDirty(group, "Bench Press", "Chest")).toBe(true);
  });
});
