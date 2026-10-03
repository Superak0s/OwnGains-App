import React from "react";
import { create, act } from "react-test-renderer";
import { useWeightTab } from "../useWeightTab";
import type { WeightEntry } from "@shared/types";

jest.mock("../../services", () => ({ bodyTrackingApi: {} }));
jest.mock("@features/auth/services/index", () => ({
  authService: { updateProfile: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);
jest.mock("@shared/services/storage", () => ({
  getUserKey: (key: string, userId: string | null) => `${userId}_${key}`,
}));
jest.mock("@shared/services/localOnlyFeatures", () => ({
  isFeatureLocal: jest.fn().mockResolvedValue(false),
}));
jest.mock("@shared/context/WorkoutContext", () => ({
  useWorkoutPick: () => ({ weightUnit: "kg", saveWeightUnit: jest.fn() }),
}));

type Control = ReturnType<typeof useWeightTab>;

function Harness({
  controlRef,
}: {
  controlRef: React.MutableRefObject<Control | null>;
}) {
  controlRef.current = useWeightTab({
    alert: jest.fn(),
    loadData: jest.fn(),
    setDayModal: jest.fn(),
    selectedLogDate: null,
    setSelectedLogDate: jest.fn(),
    buildLocalISOForDate: jest.fn(),
    user: { id: "u1" },
  });
  return null;
}

const entry = (recordedAt: string, weightKg: number) =>
  ({ recordedAt, weightKg }) as unknown as WeightEntry;

async function trendFor(history: WeightEntry[]) {
  const controlRef: React.MutableRefObject<Control | null> = { current: null };
  await act(async () => {
    create(<Harness controlRef={controlRef} />);
  });
  await act(async () => {
    controlRef.current!.setWeightHistory(history);
  });
  return controlRef.current!.getWeightTrend();
}

it("compares a weekly weigh-in against the one a week earlier", async () => {
  const trend = await trendFor([
    entry("2026-09-14T08:00:00", 79),
    entry("2026-09-07T08:00:00", 80),
  ]);
  expect(trend?.avgWeight).toBe(80);
  expect(trend?.direction).toBe("down");
});

it("leaves out weigh-ins older than the window", async () => {
  const trend = await trendFor([
    entry("2026-09-14T08:00:00", 79),
    entry("2026-09-06T08:00:00", 80),
  ]);
  expect(trend).toBeNull();
});

describe("useWeightTab input handlers", () => {
  async function mount() {
    const controlRef: React.MutableRefObject<Control | null> = { current: null };
    await act(async () => {
      create(<Harness controlRef={controlRef} />);
    });
    return controlRef;
  }

  it("refuses a weight that isn't a positive number or is over the ceiling", async () => {
    const controlRef = await mount();
    for (const value of ["", "abc", "-3", "900"]) {
      let saved = true;
      await act(async () => {
        saved = await controlRef.current!.addWeight(value);
      });
      expect(saved).toBe(false);
    }
  });

  it("converts feet and inches to centimetres and rejects an implausible height", async () => {
    const controlRef = await mount();
    await act(async () => {
      controlRef.current!.setHeightUnit("ft");
    });
    let saved = false;
    await act(async () => {
      saved = await controlRef.current!.saveHeight({ cm: "", ft: "5", in: "10" });
    });
    expect(saved).toBe(true);
    expect(controlRef.current!.height?.heightCm).toBeCloseTo(177.8, 1);

    await act(async () => {
      saved = await controlRef.current!.saveHeight({ cm: "", ft: "1", in: "0" });
    });
    expect(saved).toBe(false);
    expect(controlRef.current!.height?.heightCm).toBeCloseTo(177.8, 1);
  });
});
