import React from "react";
import { AppState, type AppStateStatus } from "react-native";
import { create, act } from "react-test-renderer";
import { aggregateRecord } from "react-native-health-connect";
import { getGrantedTypes } from "../healthConnect";
import HealthWidget from "../HealthWidget";

jest.mock("@react-navigation/native", () => ({
  useFocusEffect: (effect: () => void | (() => void)) =>
    jest.requireActual("react").useEffect(effect, [effect]),
}));
jest.mock("react-native-health-connect", () => ({ aggregateRecord: jest.fn(), readRecords: jest.fn() }));
jest.mock("../healthConnect", () => ({ getGrantedTypes: jest.fn() }));
jest.mock("@features/tracking/ui", () => ({
  Metric: ({ value }: { value: string }) => `metric:${value}`,
  Placeholder: ({ text }: { text: string }) => `placeholder:${text}`,
}));

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
