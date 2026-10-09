import { act, renderHook, waitFor } from "@testing-library/react-native";
import { loadFromStorage, saveToStorage } from "@shared/services/storage";
import { useChartSettings } from "../useChartSettings";

jest.mock("@shared/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));
jest.mock("@shared/services/storage", () => ({
  STORAGE_KEYS: { CHART_SETTINGS: "chartSettings" },
  loadFromStorage: jest.fn(async () => ({ goal: 80 })),
  saveToStorage: jest.fn(async () => true),
  removeFromStorage: jest.fn(async () => true),
}));

it("keeps each account's chart settings apart", async () => {
  const { result } = await renderHook(() => useChartSettings("weight", {}));
  await waitFor(() => expect(result.current.settings.goal).toBe(80));
  expect(loadFromStorage).toHaveBeenCalledWith("chartSettings_weight", "7");

  await act(async () => result.current.update({ goal: 75 }));
  expect(saveToStorage).toHaveBeenCalledWith("chartSettings_weight", { goal: 75 }, "7");
});
