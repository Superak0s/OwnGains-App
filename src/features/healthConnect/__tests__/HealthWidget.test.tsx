import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { create, act } from "react-test-renderer";
import { aggregateRecord } from "react-native-health-connect";
import { getGrantedTypes } from "../healthConnect";
import { loadHealthHistory, readRecentDays } from "../dailyHealth";
import HealthWidget from "../HealthWidget";

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual("react").useEffect(effect, [effect]),
}));
jest.mock("react-native-health-connect", () => ({ aggregateRecord: jest.fn(), readRecords: jest.fn() }));
jest.mock("../healthConnect", () => ({ getGrantedTypes: jest.fn() }));
jest.mock("../dailyHealth", () => ({
  ...jest.requireActual("../dailyHealth"),
  loadHealthHistory: jest.fn(),
  readRecentDays: jest.fn(),
}));
jest.mock("@shared/context/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
jest.mock("@shared/components/ProgressChart", () => ({
  __esModule: true,
  default: ({ data }: { data: { datasets: { data: number[] }[] } }) =>
    `chart:${data.datasets[0].data.join(",")}`,
}));
jest.mock("@features/tracking/ui", () => ({
  Metric: ({ value }: { value: string }) => `metric:${value}`,
  Placeholder: ({ text }: { text: string }) => `placeholder:${text}`,
}));

beforeEach(() => {
  jest.spyOn(AppState, "addEventListener").mockReturnValue({ remove: jest.fn() } as never);
});

it("reads again when the app returns to the foreground", async () => {
  let onChange: (state: AppStateStatus) => void = () => {};
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    onChange = listener as typeof onChange;
    return { remove: jest.fn() } as never;
  });
  jest.mocked(getGrantedTypes).mockResolvedValue(["Steps"]);
  jest.mocked(aggregateRecord)
    .mockResolvedValueOnce({ COUNT_TOTAL: 100 } as never)
    .mockResolvedValueOnce({ COUNT_TOTAL: 250 } as never);

  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<HealthWidget type="health_steps" onOpenSettings={jest.fn()} />);
  });
  expect(tree.toJSON()).toBe("metric:100");

  await act(async () => onChange("active"));
  expect(tree.toJSON()).toBe("metric:250");
});

it("charts kept days older than Health Connect's window with the live ones", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["SleepSession"]);
  jest.mocked(loadHealthHistory).mockResolvedValue({
    "2026-06-01": { sleepMinutes: 420 },
    "2026-10-05": { sleepMinutes: 300, steps: 5000 },
  });
  jest.mocked(readRecentDays).mockResolvedValue({ "2026-10-05": { sleepMinutes: 450 } });

  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<HealthWidget type="health_sleep_trend" onOpenSettings={jest.fn()} />);
  });
  expect(readRecentDays).toHaveBeenCalledWith(["SleepSession"]);
  expect(tree.toJSON()).toBe("chart:7,7.5");
});
