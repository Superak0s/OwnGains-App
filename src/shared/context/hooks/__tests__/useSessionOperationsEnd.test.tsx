import { create, act } from "react-test-renderer";
import { useSessionOperations } from "../useSessionOperations";
import { workoutApi } from "@features/workout/services/index";
import { STORAGE_KEYS } from "@shared/services/storage";
import type { PendingSync } from "../../../types";
import { ApiError } from "@shared/services/apiError";

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

const endSession = workoutApi.endSession as jest.Mock;

type Options = Parameters<typeof useSessionOperations>[0];

function makeOptions(overrides: Partial<Options>): Options {
  return {
    workoutStartTime: null,
    setWorkoutStartTime: jest.fn(),
    currentSessionId: null,
    setCurrentSessionId: jest.fn(),
    lastSetEndTime: null,
    setLastSetEndTime: jest.fn(),
    setLastActivityTime: jest.fn(),
    currentDay: 1,
    selectedSplit: "push",
    workoutData: null,
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
    fetchAnalytics: undefined,
    syncPendingData: undefined,
    pendingSyncs: [],
    ...overrides,
  } as Options;
}

async function renderEndWorkout(overrides: Partial<Options>) {
  const options = makeOptions(overrides);
  let endWorkout!: (autoCompleted?: boolean) => Promise<boolean>;

  function Harness() {
    ({ endWorkout } = useSessionOperations(options));
    return null;
  }

  await act(async () => {
    create(<Harness />);
  });

  return { endWorkout, options };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useSessionOperations endWorkout", () => {
  it("ends a server session and queues nothing on success", async () => {
    endSession.mockResolvedValue(undefined);
    const { endWorkout, options } = await renderEndWorkout({
      currentSessionId: "42",
    });

    let result: boolean | undefined;
    await act(async () => {
      result = await endWorkout(true);
    });

    expect(endSession).toHaveBeenCalledWith("42", expect.any(String));
    expect(options.addPendingSync).not.toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("queues an endSession sync when the server call fails transiently", async () => {
    endSession.mockRejectedValue(new Error("Network request failed"));
    const { endWorkout, options } = await renderEndWorkout({
      currentSessionId: "42",
    });

    await act(async () => {
      await endWorkout();
    });

    expect(options.addPendingSync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "endSession",
        data: { sessionId: "42" },
      }),
    );
  });

  it.each([
    new ApiError("Session not found or unauthorized", 403),
    new ApiError("Session not found", 404),
  ])(
    "does not queue a sync when the server rejects with $status $message",
    async (error) => {
      endSession.mockRejectedValue(error);
      const { endWorkout, options } = await renderEndWorkout({
        currentSessionId: "42",
      });

      await act(async () => {
        await endWorkout();
      });

      expect(options.addPendingSync).not.toHaveBeenCalled();
    },
  );

  it("queues the end when a proxy answers 403 Forbidden", async () => {
    endSession.mockRejectedValue(new ApiError("Forbidden", 403));
    const { endWorkout, options } = await renderEndWorkout({
      currentSessionId: "42",
    });

    await act(async () => {
      await endWorkout();
    });

    expect(options.addPendingSync).toHaveBeenCalledWith(
      expect.objectContaining({ type: "endSession" }),
    );
  });

  it("queues an endSession for a local session instead of calling the server", async () => {
    const pendingSyncs: PendingSync[] = [
      {
        type: "recordSet",
        data: { sessionId: "local_1", exerciseName: "Bench", setNumber: 1 },
        timestamp: "2026-01-01T00:00:00.000Z",
      },
    ] as unknown as PendingSync[];

    const { endWorkout, options } = await renderEndWorkout({
      currentSessionId: "local_1",
      pendingSyncs,
    });

    await act(async () => {
      await endWorkout();
    });

    expect(endSession).not.toHaveBeenCalled();
    expect(options.addPendingSync).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "endSession",
        data: { sessionId: "local_1" },
      }),
    );
  });
});
