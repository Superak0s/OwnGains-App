import React from "react";
import { create, act } from "react-test-renderer";
import type { ReactTestRenderer } from "react-test-renderer";

const mockGetAppMode = jest.fn(async () => "online");
jest.mock("@shared/services/appMode", () => ({
  getAppMode: () => mockGetAppMode(),
  onAppModeChange: { subscribe: () => () => {} },
}));

jest.mock("@shared/components/ScrollTabBar", () => {
  const { Text: T } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: ({ onTabChange }: { onTabChange: (t: string) => void }) => (
      <T testID="tabbar" onPress={() => onTabChange("trainees")}>
        tabs
      </T>
    ),
  };
});

const mockProviderMounts: string[] = [];
const mockProviderUnmounts: string[] = [];
jest.mock("@shared/context/WorkoutContext", () => {
  const actualReact = jest.requireActual("react");
  return {
    useWorkout: () => mockWorkoutStub,
    useWorkoutPick: () => mockWorkoutStub,
    WorkoutProvider: ({
      actAs,
      children,
    }: {
      actAs?: { userId: string };
      children: React.ReactNode;
    }) => {
      actualReact.useEffect(() => {
        mockProviderMounts.push(actAs!.userId);
        return () => {
          mockProviderUnmounts.push(actAs!.userId);
        };
      }, []);
      return children;
    },
  };
});

const mockWorkoutStub = {
  userId: "me-1",
  activeTrainer: null,
  workoutData: null,
  sessionWorkoutData: null,
  selectedSplit: null,
  currentDay: 1,
  completedDays: {},
  saveSetDetails: jest.fn(),
  deleteSetDetails: jest.fn(),
  isSetComplete: () => false,
  getSetDetails: () => null,
  getExerciseCompletedSets: () => 0,
  isDayComplete: () => false,
  isDayLocked: () => false,
  getEstimatedTimeRemaining: () => 0,
  getEstimatedEndTime: () => null,
  workoutStartTime: null,
  endWorkout: jest.fn(),
  updateExerciseName: jest.fn(),
  updateExerciseMachines: jest.fn(),
  addExtraSetsToExercise: jest.fn(),
  addNewExercise: jest.fn(),
  lastActivityTime: null,
  weightUnit: "kg",
  saveWeightUnit: jest.fn(),
  fetchSessionHistory: jest.fn(async () => []),
  hasActiveSession: () => false,
  saveCurrentDay: jest.fn(),
};

jest.mock("@shared/context/JointSessionContext", () => ({
  useJointSessionContextOptional: () => undefined,
}));
jest.mock("@shared/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "me-1", username: "coach" } }),
}));
jest.mock("@shared/context/TabBarContext", () => ({
  useTabBar: () => ({ isTabBarCollapsed: false }),
}));
jest.mock("@shared/context/ThemeContext", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#000000" }) }),
}));
jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));
jest.mock("@shared/context/hooks/useWidgets", () => ({
  useWidgets: () => ({
    widgets: [],
    isLoaded: true,
    availableToAdd: [],
    addWidget: jest.fn(),
    removeWidget: jest.fn(),
    cycleWidgetSize: jest.fn(),
    reorderWidgets: jest.fn(),
  }),
  useWidgetBoard: () => ({
    panHandlers: {},
    isPulling: false,
    pullArmed: false,
    isEditing: false,
    showGallery: false,
    startEditing: jest.fn(),
    stopEditing: jest.fn(),
    openGallery: jest.fn(),
    closeGallery: jest.fn(),
    handleAdd: jest.fn(),
  }),
}));
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("@shared/components/CustomAlert", () => ({
  useAlert: () => ({ alert: jest.fn(), AlertComponent: null }),
}));
jest.mock("@shared/services/storage", () => ({
  STORAGE_KEYS: new Proxy({}, { get: (_t, k) => String(k) }),
  loadFromStorage: jest.fn(async () => null),
  saveToStorage: jest.fn(async () => true),
}));

import { setActiveTrainee } from "@shared/services/trainerEvents";
import WorkoutScreen from "../WorkoutScreen";

let root!: ReactTestRenderer;
beforeEach(() => {
  mockProviderMounts.length = 0;
  mockProviderUnmounts.length = 0;
  jest.clearAllMocks();
  mockGetAppMode.mockResolvedValue("online");
  act(() => {
    setActiveTrainee(null);
  });
});
afterEach(() => {
  act(() => {
    root?.unmount();
  });
});

const tabbarCount = (r: ReactTestRenderer): number =>
  JSON.stringify(r.toJSON()).match(/"testID":"tabbar"/g)?.length ?? 0;

it("shows the tabs only while a trainer session is active", async () => {
  await act(async () => {
    root = create(<WorkoutScreen />);
  });
  expect(tabbarCount(root)).toBe(0);
  expect(mockProviderMounts).toHaveLength(0);

  await act(async () => {
    setActiveTrainee({ userId: "1", username: "ana" });
  });
  // One per body: the trainee tab needs its own way back to "Me".
  expect(tabbarCount(root)).toBe(2);
  expect(mockProviderMounts).toEqual(["1"]);

  await act(async () => {
    setActiveTrainee({ userId: "2", username: "bo" });
  });
  expect(mockProviderUnmounts).toEqual(["1"]);
  expect(mockProviderMounts).toEqual(["1", "2"]);

  await act(async () => {
    root
      .root.findByProps({ accessibilityLabel: "Stop trainer session" })
      .props.onPress();
  });
  expect(tabbarCount(root)).toBe(0);
  expect(mockProviderUnmounts).toEqual(["1", "2"]);
});

it("hides the tabs in offline mode even with an active session", async () => {
  mockGetAppMode.mockResolvedValue("offline");
  await act(async () => {
    setActiveTrainee({ userId: "1", username: "ana" });
  });
  await act(async () => {
    root = create(<WorkoutScreen />);
  });
  expect(tabbarCount(root)).toBe(0);
  expect(mockProviderMounts).toHaveLength(0);
});
