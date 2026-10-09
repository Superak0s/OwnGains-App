import { useEffect } from "react";
import { Text } from "react-native";
import { create, act } from "react-test-renderer";

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

import { WorkoutProvider, useWorkout, useWorkoutPick } from "../WorkoutContext";

const renders = { unit: 0, user: 0 };

function UnitProbe(): React.JSX.Element {
  const { weightUnit } = useWorkoutPick("weightUnit");
  renders.unit += 1;
  return <Text testID="unit">{weightUnit}</Text>;
}

function UserProbe(): React.JSX.Element {
  const { userId } = useWorkoutPick("userId");
  renders.user += 1;
  return <Text>{userId}</Text>;
}

const grabbed: { saveWeightUnit?: (unit: "kg" | "lbs") => Promise<void> } = {};
function Grab(): null {
  const { saveWeightUnit } = useWorkout();
  useEffect(() => {
    grabbed.saveWeightUnit = saveWeightUnit;
  }, [saveWeightUnit]);
  return null;
}

describe("useWorkoutPick", () => {
  it("re-renders only the consumers whose picked fields changed", async () => {
    let root!: ReturnType<typeof create>;
    await act(async () => {
      root = create(
        <WorkoutProvider>
          <Grab />
          <UnitProbe />
          <UserProbe />
        </WorkoutProvider>,
      );
    });
    const before = { ...renders };

    await act(async () => {
      await grabbed.saveWeightUnit!("lbs");
    });

    expect(root.root.findByProps({ testID: "unit" }).props.children).toBe("lbs");
    expect(renders.unit).toBeGreaterThan(before.unit);
    expect(renders.user).toBe(before.user);
  });

});
