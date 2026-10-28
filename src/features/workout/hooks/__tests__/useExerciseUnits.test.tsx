import { act, renderHook } from "@testing-library/react-native";
import { loadFromStorage, saveToStorage } from "@shared/services/storage";
import { useExerciseUnits } from "../useExerciseUnits";

jest.mock("@shared/services/storage", () => ({
  STORAGE_KEYS: { WEIGHT_UNIT_BY_EXERCISE: "units" },
  loadFromStorage: jest.fn(),
  saveToStorage: jest.fn(async () => {}),
}));

const load = loadFromStorage as jest.Mock;
const save = saveToStorage as jest.Mock;

describe("useExerciseUnits", () => {
  it("keeps stored units when a unit is picked before they load", async () => {
    let resolve!: (value: Record<string, string>) => void;
    load.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = await renderHook(() => useExerciseUnits("u1"));

    await act(async () => result.current.setExerciseUnit("Squat", "lbs"));
    await act(async () => resolve({ bench: "lbs", deadlift: "kg" }));

    const expected = { bench: "lbs", deadlift: "kg", squat: "lbs" };
    expect(result.current.units).toEqual(expected);
    expect(save).toHaveBeenLastCalledWith("units", expected, "u1");
  });
});
