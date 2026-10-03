import { Text } from "react-native";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";
import type { TrainerEvent } from "@shared/services/trainerEvents";

const mockSaveToStorage = jest.fn<
  Promise<boolean>,
  [string, unknown, string?]
>(async () => true);

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
  removeFromStorage: jest.fn(async () => true),
  removeMultipleFromStorage: jest.fn(async () => true),
}));

let mockUser: { id: string; username: string } | null = {
  id: "trainee-9",
  username: "sam",
};
jest.mock("../AuthContext", () => ({
  useAuthToken: () => "",
  useAuth: () => ({ user: mockUser, logout: jest.fn(), consented: true }),
}));

jest.mock("../hooks/useRealtimeSocket", () => ({
  useRealtimeSocket: jest.fn(() => ({ send: jest.fn(), isConnected: false })),
}));

jest.mock("@features/auth/services", () => ({
  authService: { getToken: jest.fn(async () => "token") },
}));

jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(async () => {
    throw new Error("network unreachable");
  }),
  routeOf: (url: string) => url,
}));

const mockSyncFromServer = jest.fn(async () => ({}));
jest.mock("../hooks/useServerSync", () => ({
  useServerSync: () => ({
    fetchSessionHistory: jest.fn(),
    syncFromServer: mockSyncFromServer,
  }),
}));

import { WorkoutProvider, useWorkout } from "../WorkoutContext";
import { onTrainerEvent } from "@shared/services/trainerEvents";

function Probe(): React.JSX.Element {
  const { activeTrainer } = useWorkout();
  return <Text testID="trainer">{activeTrainer ?? "none"}</Text>;
}

const trainerText = (root: ReactTestRenderer) =>
  root.root.findByProps({ testID: "trainer" }).props.children;

const setRecorded = (over: Partial<TrainerEvent> = {}): TrainerEvent => ({
  type: "trainer_set_recorded",
  traineeId: "trainee-9",
  trainerId: "trainer-1",
  trainerUsername: "coach",
  sessionId: "1",
  ...over,
});

describe("WorkoutContext trainer events", () => {
  beforeEach(() => {
    mockSaveToStorage.mockClear();
    mockSyncFromServer.mockClear();
    mockUser = { id: "trainee-9", username: "sam" };
  });

  it("sets activeTrainer for an event matching the logged-in user", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    await act(async () => {
      onTrainerEvent.trigger(setRecorded());
    });

    expect(trainerText(root)).toBe("coach");
    root.unmount();
  });

  it("ignores an event for a different traineeId", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    await act(async () => {
      onTrainerEvent.trigger(setRecorded({ traineeId: "someone-else" }));
    });

    expect(trainerText(root)).toBe("none");
    root.unmount();
  });

  it("clears activeTrainer on trainer_session_ended", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    await act(async () => {
      onTrainerEvent.trigger(setRecorded());
    });
    expect(trainerText(root)).toBe("coach");

    await act(async () => {
      onTrainerEvent.trigger(setRecorded({ type: "trainer_session_ended" }));
    });
    expect(trainerText(root)).toBe("none");
    root.unmount();
  });

  it("clears activeTrainer once the logged-in user changes", async () => {
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    await act(async () => {
      onTrainerEvent.trigger(setRecorded());
    });
    expect(trainerText(root)).toBe("coach");

    mockUser = { id: "trainee-10", username: "alex" };
    await act(async () => {
      root.update(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    expect(trainerText(root)).toBe("none");
    root.unmount();
  });

  it("never banners a trainer at themselves in an actAs provider", async () => {
    mockUser = { id: "trainer-1", username: "coach" };
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider actAs={{ userId: "trainee-9", username: "sam" }}>
          <Probe />
        </WorkoutProvider>,
      );
    });

    await act(async () => {
      onTrainerEvent.trigger(setRecorded());
    });

    expect(trainerText(root)).toBe("none");
    root.unmount();
  });

  it("coalesces rapid trainer events into one sync", async () => {
    jest.useFakeTimers();
    let root!: ReactTestRenderer;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Probe />
        </WorkoutProvider>,
      );
    });

    mockSyncFromServer.mockClear();

    act(() => {
      onTrainerEvent.trigger(setRecorded({ sessionId: "1" }));
      onTrainerEvent.trigger(setRecorded({ sessionId: "2" }));
      onTrainerEvent.trigger(setRecorded({ sessionId: "3" }));
    });

    await act(async () => {
      jest.advanceTimersByTime(1100);
    });

    expect(mockSyncFromServer).toHaveBeenCalledTimes(1);

    root.unmount();
    jest.useRealTimers();
  });
});
