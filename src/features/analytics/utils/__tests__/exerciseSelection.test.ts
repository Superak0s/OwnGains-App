import {
  subscribe,
  getSelection,
  setSelectedExercise,
  setSelectedMuscleGroup,
} from "../exerciseSelection";

describe("exerciseSelection store", () => {
  it("notifies every subscriber until it unsubscribes", () => {
    const seen: string[] = [];
    const unsubscribe = subscribe(() => {
      seen.push(getSelection().exercise ?? "none");
    });

    setSelectedExercise("Bench Press");
    setSelectedMuscleGroup("Chest");
    expect(getSelection()).toEqual({
      exercise: "Bench Press",
      muscleGroup: "Chest",
    });

    unsubscribe();
    setSelectedExercise("Squat");
    expect(seen).toEqual(["Bench Press", "Bench Press"]);
    expect(getSelection().exercise).toBe("Squat");
  });
});
