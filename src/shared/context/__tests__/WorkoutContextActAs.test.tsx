import { useState } from "react";
import { Text } from "react-native";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";

const mockSaveToStorage = jest.fn<
  Promise<boolean>,
  [string, unknown, string?]
>(async () => true);

const mockRemoveFromStorage = jest.fn<Promise<boolean>, [string, string?]>(
  async () => true,
);

jest.mock("../../services/storage", () => ({
  STORAGE_KEYS: {
    WORKOUT_DATA: "@workout_data",
    SELECTED_SPLIT: "@selected_split",
    CURRENT_DAY: "@current_day",
    COMPLETED_DAYS: "@completed_days",
    LOCKED_DAYS: "@locked_days",
    UNLOCKED_OVERRIDES: "@unlocked_overrides",
    TIME_BETWEEN_SETS: "@time_between_sets",
    USE_MANUAL_TIME: "@use_manual_time",
    WORKOUT_START_TIME: "@workout_start_time",
    CURRENT_SESSION_ID: "@current_session_id",
    LAST_SET_END_TIME: "@last_set_end_time",
    LAST_ACTIVITY_TIME: "@last_activity_time",
    PENDING_SYNCS: "@pending_syncs",
    LAST_RESET_DATE: "@last_reset_date",
    WEIGHT_UNIT: "@weight_unit",
    WORKOUT_WIDGETS: "@workout_widgets",
  },
  saveToStorage: (key: string, value: unknown, userId?: string) =>
    mockSaveToStorage(key, value, userId),
  getUserKey: (key: string, userId?: string | null) =>
    userId ? `${key}_user_${userId}` : key,
  loadFromStorage: jest.fn(async () => null),
  loadMultipleFromStorage: jest.fn(async () => ({
    "@workout_data": JSON.stringify({
      days: [{ dayNumber: 1, dayTitle: "Day 1", split: {} }],
    }),
  })),
  removeFromStorage: (key: string, userId?: string) =>
    mockRemoveFromStorage(key, userId),
  removeMultipleFromStorage: jest.fn(async () => true),
}));

jest.mock("../AuthContext", () => ({
  useAuthToken: () => "",
  useAuth: () => ({
    user: { id: "trainer-1", username: "coach" },
    logout: jest.fn(),
    consented: true,
  }),
}));

jest.mock("../hooks/useRealtimeSocket", () => ({
  useRealtimeSocket: jest.fn(() => ({ send: jest.fn(), isConnected: false, onReconnect: () => () => {} })),
}));

jest.mock("@features/auth/services", () => ({
  authService: { getToken: jest.fn(async () => "token") },
}));

// traineeFetch wraps authenticatedFetch, so failing it here fails every
// trainee-scoped request without touching the real network layer.
const mockAuthenticatedFetch = jest.fn(async (_url: string) => {
  throw new Error("network unreachable");
}) as jest.Mock;

jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: (url: string, options?: RequestInit) =>
    mockAuthenticatedFetch(url, options),
  routeOf: (url: string) => url.split("?")[0],
}));

import { Alert } from "react-native";
import { useRealtimeSocket } from "../hooks/useRealtimeSocket";
import { WorkoutProvider, useWorkout } from "../WorkoutContext";
import { TRAINEE_WRITE_REFUSED_MESSAGE } from "../hooks/useSessionOperations";

const mockSocket = useRealtimeSocket as jest.Mock;

function Probe(): React.JSX.Element {
  const { userId, startWorkout, saveSetDetails } = useWorkout();
  const [result, setResult] = useState<string>("unset");
  return (
    <>
      <Text testID="target">{userId ?? "none"}</Text>
      <Text
        testID="start"
        onPress={() => {
          startWorkout().then(
            (id) => setResult(id ?? "null"),
            (error: Error) => setResult(error.message),
          );
        }}
      >
        start
      </Text>
      <Text
        testID="save"
        onPress={() => {
          void saveSetDetails(1, 0, 0, 60, 10);
        }}
      >
        save
      </Text>
      <Text testID="result">{result}</Text>
    </>
  );
}

const targetText = (root: ReactTestRenderer) =>
  root.root.findByProps({ testID: "target" }).props.children;

describe("WorkoutProvider actAs", () => {
  beforeEach(() => {
    mockSaveToStorage.mockClear();
    mockRemoveFromStorage.mockClear();
    mockSocket.mockClear();
    mockAuthenticatedFetch.mockReset();
    mockAuthenticatedFetch.mockImplementation(async () => {
      throw new Error("network unreachable");
    });
    jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it("targets the signed-in user by default", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });
    expect(targetText(root)).toBe("trainer-1");
  });

  it("targets the trainee when actAs is set", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });
    expect(targetText(root)).toBe("trainee-9");
  });

  it("does not open a second socket for a trainee provider", async () => {
    await act(async () => {
      create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });
    expect(mockSocket).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    );
  });

  it("persists under the trainee's id, not the trainer's", async () => {
    await act(async () => {
      create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });
    const trainerWrites = mockSaveToStorage.mock.calls.filter(
      (call) => call[2] === "trainer-1",
    );
    expect(trainerWrites).toEqual([]);
  });

  it("refuses to queue a set for a trainee while offline", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });

    mockSaveToStorage.mockClear();

    await act(async () => {
      root.root.findByProps({ testID: "start" }).props.onPress();
    });

    const pendingSyncWrites = mockSaveToStorage.mock.calls.filter(
      (call) => call[0] === "@pending_syncs",
    );
    expect(pendingSyncWrites).toEqual([]);

    const localIdWritesForTrainee = mockSaveToStorage.mock.calls.filter(
      (call) => call[2] === "trainee-9" && String(call[1]).startsWith("local_"),
    );
    expect(localIdWritesForTrainee).toEqual([]);

    const resultText = root.root.findByProps({ testID: "result" }).props
      .children as string;
    expect(resultText).toBe(TRAINEE_WRITE_REFUSED_MESSAGE);
    expect(resultText.startsWith("local_")).toBe(false);

    root.unmount();
  });

  it("clears the trainee's session start keys when the write is refused", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });

    mockRemoveFromStorage.mockClear();

    await act(async () => {
      root.root.findByProps({ testID: "save" }).props.onPress();
    });

    expect(mockRemoveFromStorage).toHaveBeenCalledWith(
      "@workout_start_time",
      "trainee-9",
    );
    expect(mockRemoveFromStorage).toHaveBeenCalledWith(
      "@last_activity_time",
      "trainee-9",
    );

    root.unmount();
  });

  it("alerts and does not mark the set completed when the write is refused", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });

    mockSaveToStorage.mockClear();

    await act(async () => {
      root.root.findByProps({ testID: "save" }).props.onPress();
    });

    const completedWrites = mockSaveToStorage.mock.calls.filter(
      (call) => call[0] === "@completed_days",
    );
    expect(completedWrites).toEqual([]);
    expect(Alert.alert).toHaveBeenCalledWith(
      "Set not saved",
      TRAINEE_WRITE_REFUSED_MESSAGE,
    );

    root.unmount();
  });

  it("rolls back the optimistic set when only the record call is refused", async () => {
    mockAuthenticatedFetch.mockImplementation(async (url: string) => {
      if (url === "/api/sessions/start")
        return new Response(JSON.stringify({ session: { id: "server-1" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      throw new Error("network unreachable");
    });

    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });

    mockSaveToStorage.mockClear();

    await act(async () => {
      root.root.findByProps({ testID: "save" }).props.onPress();
    });

    const completedWrites = mockSaveToStorage.mock.calls.filter(
      (call) => call[0] === "@completed_days",
    );
    expect(completedWrites.length).toBeGreaterThan(1);
    expect(completedWrites[completedWrites.length - 1][1]).toEqual({});
    expect(Alert.alert).toHaveBeenCalledWith(
      "Set not saved",
      TRAINEE_WRITE_REFUSED_MESSAGE,
    );

    const lastSetEndWrites = mockSaveToStorage.mock.calls.filter(
      (call) => call[0] === "@last_set_end_time",
    );
    expect(lastSetEndWrites).toEqual([]);

    root.unmount();
  });
});
