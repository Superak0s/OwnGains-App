import { create, act } from "react-test-renderer";
import { useSessionOperations } from "../useSessionOperations";
import { workoutApi } from "@features/workout/services/index";
import { STORAGE_KEYS } from "@shared/services/storage";
import type { PendingSync } from "../../../types";
import { ApiError } from "@shared/services/apiError";
import { CUSTOM_DAY } from "@utils/dayCarryOver";

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
    new ApiError("Session not found or unauthorized", 403, null, "SESSION_NOT_FOUND"),
    new ApiError("Session has already ended", 409, null, "SESSION_ALREADY_ENDED"),
  ])(
    "does not queue a sync when the server rejects with $code",
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

describe("useSessionOperations custom day", () => {
  const startSession = workoutApi.startSession as jest.Mock;

  it("ends a custom-day session without locking it or keeping its logs", async () => {
    endSession.mockResolvedValue(undefined);
    const { endWorkout, options } = await renderEndWorkout({
      currentSessionId: "42",
      currentDay: CUSTOM_DAY,
      workoutStartTime: "2099-01-01T10:00:00",
      completedDays: { 1: { 0: {} }, [CUSTOM_DAY]: { 0: {} } },
    });

    await act(async () => {
      await endWorkout();
    });

    expect(options.setLockedDays).not.toHaveBeenCalled();
    expect(options.setCompletedDays).toHaveBeenCalledWith({ 1: { 0: {} } });
  });

  it("starts the session on the day it is given rather than the current one", async () => {
    startSession.mockResolvedValue(7);
    const options = makeOptions({ currentDay: 1, workoutData: null });
    let startWorkout!: ReturnType<typeof useSessionOperations>["startWorkout"];
    function Harness() {
      ({ startWorkout } = useSessionOperations(options));
      return null;
    }
    await act(async () => {
      create(<Harness />);
    });

    let id: string | null = null;
    await act(async () => {
      id = await startWorkout(false, undefined, {
        split: "Free",
        day: { dayNumber: CUSTOM_DAY, dayTitle: "Empty workout", split: {} },
      });
    });

    expect(id).toBe("7");
    expect(startSession).toHaveBeenCalledWith(
      "Free",
      CUSTOM_DAY,
      "Empty workout",
      false,
      expect.any(String),
    );
  });
});
