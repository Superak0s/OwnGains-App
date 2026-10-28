import { create, act } from "react-test-renderer";
import { traineeWriteRefused, useSessionOperations } from "../useSessionOperations";
import { workoutApi } from "@features/workout/services/index";
import { STORAGE_KEYS } from "@shared/services/storage";
import type { WorkoutData } from "../../../types";
import type { CompletedDays } from "../../../../utils/dayCompletion";

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
    deleteSet: jest.fn(),
    getSession: jest.fn(),
    updateSet: jest.fn(),
    endSession: jest.fn(),
  },
}));

const recordSet = workoutApi.recordSet as jest.Mock;
const deleteSet = workoutApi.deleteSet as jest.Mock;
const getSession = workoutApi.getSession as jest.Mock;
const updateSet = workoutApi.updateSet as jest.Mock;

const workoutData = {
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      split: { push: { exercises: [{ name: "Bench Press" }] } },
    },
  ],
} as unknown as WorkoutData;

const LOGGED = {
  weight: 1000,
  reps: 5,
  completedAt: "2026-10-14T09:10:00.000",
  startedAt: "2026-10-14T09:09:00.000",
  note: "",
  isWarmup: false,
};

type Options = Parameters<typeof useSessionOperations>[0];

async function render(overrides: Partial<Options>) {
  const options = {
    workoutStartTime: "2026-10-14T09:00:00.000",
    setWorkoutStartTime: jest.fn(),
    untimedSession: false,
    setUntimedSession: jest.fn(),
    currentSessionId: "42",
    setCurrentSessionId: jest.fn(),
    lastSetEndTime: "2026-10-14T09:30:00.000",
    setLastSetEndTime: jest.fn(),
    setLastActivityTime: jest.fn(),
    currentDay: 1,
    selectedSplit: "push",
    workoutData,
    completedDays: { 1: { 0: { 0: LOGGED } } } as unknown as CompletedDays,
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
    removePendingSyncs: jest.fn().mockResolvedValue(undefined),
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

describe("useSessionOperations editing a logged set", () => {
  it("patches the server's row instead of adding a second one", async () => {
    getSession.mockResolvedValue({
      setTimings: [
        { id: 7, exerciseName: "Bench Press", setIndex: 0 },
        { id: 8, exerciseName: "Bench Press", setIndex: 1 },
      ],
    });
    updateSet.mockResolvedValue({});
    const { ops, options } = await render({});

    let saved: boolean | undefined;
    await act(async () => {
      saved = await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(saved).toBe(true);
    expect(deleteSet).not.toHaveBeenCalled();
    expect(recordSet).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith(
      "42",
      7,
      expect.objectContaining({
        weight: 100,
        startTime: LOGGED.startedAt,
        endTime: LOGGED.completedAt,
      }),
    );
    expect(options.addPendingSync).not.toHaveBeenCalled();
    expect(options.setLastSetEndTime).not.toHaveBeenCalled();
  });

  it("records a set whose only copy was still queued", async () => {
    getSession.mockResolvedValue({ setTimings: [] });
    recordSet.mockResolvedValue({});
    const { ops, options } = await render({
      removePendingSyncs: jest.fn().mockResolvedValue(1),
    });

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(options.removePendingSyncs).toHaveBeenCalled();
    expect(updateSet).not.toHaveBeenCalled();
    expect(recordSet).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({ weight: 100, setIndex: 0 }),
      undefined,
    );
  });

  it("queues the edit as a patch when the server is unreachable", async () => {
    getSession.mockRejectedValue(new Error("Network request failed"));
    const { ops, options } = await render({});

    let saved: boolean | undefined;
    await act(async () => {
      saved = await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(saved).toBe(true);
    expect(options.setCompletedDays).toHaveBeenCalled();
    expect(recordSet).not.toHaveBeenCalled();
    expect(options.addPendingSync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recordSet",
        data: expect.objectContaining({ weight: 100, replacesExisting: true }),
      }),
    );
  });

  it("records a set kept from an earlier session as a new set of this one", async () => {
    recordSet.mockResolvedValue({});
    const { ops, options } = await render({
      workoutStartTime: "2026-10-15T09:00:00.000",
    });

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(getSession).not.toHaveBeenCalled();
    expect(options.removePendingSyncs).not.toHaveBeenCalled();
    expect(recordSet).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({ endTime: expect.not.stringContaining("2026-10-14") }),
    );
  });

  it("does not delete anything for a new set", async () => {
    recordSet.mockResolvedValue({});
    const { ops, options } = await render({ completedDays: {} });

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(deleteSet).not.toHaveBeenCalled();
    expect(getSession).not.toHaveBeenCalled();
    expect(options.setLastSetEndTime).toHaveBeenCalled();
  });
});

describe("useSessionOperations restoring a deleted set", () => {
  it("records it with its original times and leaves the rest timer alone", async () => {
    recordSet.mockResolvedValue({});
    const { ops, options } = await render({ completedDays: {} });

    await act(async () => {
      await ops.saveSetDetails(1, 0, 0, 1000, 5, { restoring: LOGGED });
    });

    expect(deleteSet).not.toHaveBeenCalled();
    expect(recordSet).toHaveBeenCalledWith(
      "42",
      expect.objectContaining({ startTime: LOGGED.startedAt, endTime: LOGGED.completedAt }),
    );
    expect(options.setLastSetEndTime).not.toHaveBeenCalled();
  });
});

describe("useSessionOperations unsaved set", () => {
  it("reports failure when the trainee refuses the write", async () => {
    recordSet.mockRejectedValue(new Error("offline"));
    const { ops } = await render({
      completedDays: {},
      addPendingSync: jest.fn().mockRejectedValue(traineeWriteRefused()),
    });

    let saved: boolean | undefined;
    await act(async () => {
      saved = await ops.saveSetDetails(1, 0, 0, 100, 5);
    });

    expect(saved).toBe(false);
  });
});
