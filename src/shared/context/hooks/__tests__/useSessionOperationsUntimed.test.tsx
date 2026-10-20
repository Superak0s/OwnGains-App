import { create, act } from "react-test-renderer";
import { useSessionOperations } from "../useSessionOperations";
import { workoutApi } from "@features/workout/services/index";
import { STORAGE_KEYS } from "@shared/services/storage";
import type { WorkoutData } from "../../../types";
import type { CompletedDays } from "../../../../utils/dayCompletion";
import type { RecordSetParams } from "@features/workout/services/workoutApiFactory";

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  }),
}));

jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    startSession: jest.fn(),
    recordSet: jest.fn(),
    endSession: jest.fn(),
  },
}));

const recordSet = workoutApi.recordSet as jest.Mock;
const endSession = workoutApi.endSession as jest.Mock;
const startSession = workoutApi.startSession as jest.Mock;

const START = "2026-10-14T09:00:00.000";

const workoutData = {
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      split: { push: { exercises: [{ name: "Bench Press" }] } },
    },
  ],
} as unknown as WorkoutData;

type Options = Parameters<typeof useSessionOperations>[0];

async function render(overrides: Partial<Options>) {
  const options = {
    workoutStartTime: START,
    setWorkoutStartTime: jest.fn(),
    untimedSession: true,
    setUntimedSession: jest.fn(),
    currentSessionId: "42",
    setCurrentSessionId: jest.fn(),
    lastSetEndTime: "2026-10-14T09:30:00.000",
    setLastSetEndTime: jest.fn(),
    setLastActivityTime: jest.fn(),
    currentDay: 1,
    selectedSplit: "push",
    workoutData,
    completedDays: {},
    setCompletedDays: jest.fn(),
    lockedDays: {},
    setLockedDays: jest.fn(),
    unlockedOverrides: {},
    setUnlockedOverrides: jest.fn(),
    userId: "user-1",
    saveToStorage: jest.fn().mockResolvedValue(true),
    removeFromStorage: jest.fn().mockResolvedValue(true),
    STORAGE_KEYS,
    addPendingSync: jest.fn().mockResolvedValue(undefined),
    useManualTime: true,
    pendingSyncs: [],
    ...overrides,
  } as Options;
  let ops!: ReturnType<typeof useSessionOperations>;
  function Harness() {
    ops = useSessionOperations(options);
    return null;
  }
  await act(async () => {
    create(<Harness />);
  });
  return { ops, options };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSessionOperations untimed session", () => {
  it("stamps every set at the session start so no duration or rest is recorded", async () => {
    recordSet.mockResolvedValue({});
    const { ops, options } = await render({});

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(recordSet).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({ startTime: START, endTime: START }),
    );
    const [[completed]] = (options.setCompletedDays as jest.Mock<void, [CompletedDays]>).mock.calls;
    expect(completed[1][0][0].completedAt).toBe(START);
    expect(options.setLastSetEndTime).not.toHaveBeenCalledWith(START);
  });

  it("ends the session at its start time", async () => {
    endSession.mockResolvedValue(undefined);
    const { ops } = await render({});

    await act(async () => {
      await ops.endWorkout();
    });

    expect(endSession).toHaveBeenCalledWith("42", START);
  });

  it("times sets normally when the session is not untimed", async () => {
    recordSet.mockResolvedValue({});
    const { ops } = await render({ untimedSession: false });

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    const [[, params]] = (recordSet as jest.Mock<unknown, [string, RecordSetParams]>).mock.calls;
    expect(params.startTime).toBe("2026-10-14T09:30:00.000");
    expect(params.endTime).not.toBe(START);
  });

  it("persists the untimed flag when started from the log-past-workout button", async () => {
    startSession.mockResolvedValue(7);
    const { ops, options } = await render({
      workoutStartTime: null,
      currentSessionId: null,
      untimedSession: false,
    });

    await act(async () => {
      await ops.startWorkout(true);
    });

    expect(options.saveToStorage).toHaveBeenCalledWith(
      STORAGE_KEYS.UNTIMED_SESSION,
      true,
      "user-1",
    );
    expect(options.setUntimedSession).toHaveBeenCalledWith(true);
    expect(options.saveToStorage).toHaveBeenCalledWith(
      STORAGE_KEYS.LAST_SET_END_TIME,
      expect.any(String),
      "user-1",
    );
  });

  it("starts the session on the picked date", async () => {
    startSession.mockResolvedValue(7);
    const { ops } = await render({
      workoutStartTime: null,
      currentSessionId: null,
      untimedSession: false,
    });

    await act(async () => {
      await ops.startWorkout(true, new Date(2026, 9, 10, 18, 15));
    });

    const [[, , , , startTime]] = startSession.mock.calls as [[string, number, string, boolean, string]];
    expect(startTime).toMatch(/^2026-10-10T18:15/);
  });

  it("does not count a workout from an earlier week toward this week", async () => {
    endSession.mockResolvedValue(undefined);
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 8);
    const completedDays = { 1: { 0: { 0: { weight: 100, reps: 5 } } } } as unknown as CompletedDays;
    const { ops, options } = await render({
      workoutStartTime: lastWeek.toISOString(),
      completedDays,
    });

    await act(async () => {
      await ops.endWorkout();
    });

    expect(options.setLockedDays).not.toHaveBeenCalled();
    expect(options.setCompletedDays).toHaveBeenCalledWith({});
  });

  it("locks the day for a workout logged earlier this week", async () => {
    endSession.mockResolvedValue(undefined);
    const { ops, options } = await render({ workoutStartTime: new Date().toISOString() });

    await act(async () => {
      await ops.endWorkout();
    });

    expect(options.setLockedDays).toHaveBeenCalledWith({ 1: true });
  });
});
