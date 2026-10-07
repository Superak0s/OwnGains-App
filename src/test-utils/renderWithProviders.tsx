/**
 * Mounts a screen with stand-ins for the app's context providers.
 *
 * The real Auth/Workout providers sync, open sockets and schedule timers, so
 * each suite swaps their modules for these mutable mocks, then renders:
 *
 *   jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
 *   jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
 *   jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
 *   jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
 *   jest.mock("@shared/context/JointSessionContext", () => require("test-utils/renderWithProviders").jointSessionModule)
 *   jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
 *
 *   await renderWithProviders(<PlanScreen />, { workout: { workoutData: null } })
 */
import React, { type ReactElement } from "react"
import { render } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { TabBarProvider } from "@shared/context/TabBarContext"

type Overrides = Record<string, unknown>

const resolved = <T,>(value: T) => jest.fn(async () => value)

export const makeAuth = (overrides: Overrides = {}): Overrides => ({
  user: { id: "u1", username: "tester", name: "Tester" },
  isAuthenticated: true,
  isLoading: false,
  signup: resolved({ success: true }),
  signin: resolved({ success: true }),
  logout: resolved(undefined),
  updateProfile: resolved({ success: true }),
  refreshUser: resolved({ success: true }),
  refreshToken: resolved(true),
  consented: true,
  markConsented: jest.fn(),
  recheckConsent: jest.fn(),
  ...overrides,
})

export const makeWorkout = (overrides: Overrides = {}): Overrides => ({
  userId: "u1",
  activeTrainer: null,
  actAs: null,
  workoutData: null,
  sessionWorkoutData: null,
  selectedSplit: null,
  currentDay: 1,
  completedDays: {},
  lockedDays: {},
  unlockedOverrides: {},
  isLoading: false,
  timeBetweenSets: 90,
  workoutStartTime: null,
  currentSessionId: null,
  serverAnalytics: null,
  useManualTime: false,
  lastActivityTime: null,
  lastSetEndTime: null,
  weightUnit: "kg",
  saveWorkoutData: resolved(undefined),
  saveSelectedSplit: resolved(undefined),
  saveCurrentDay: resolved(undefined),
  saveCompletedDays: resolved(undefined),
  saveLockedDays: resolved(undefined),
  saveUnlockedOverrides: resolved(undefined),
  saveTimeBetweenSets: resolved(undefined),
  toggleUseManualTime: resolved(undefined),
  hasActiveSession: jest.fn(() => false),
  startWorkout: resolved("s1"),
  endWorkout: resolved(true),
  saveWeightUnit: resolved(undefined),
  saveSetDetails: resolved(undefined),
  deleteSetDetails: resolved(true),
  clearActiveWorkout: resolved(undefined),
  isSetComplete: jest.fn(() => false),
  getSetDetails: jest.fn(() => null),
  getExerciseCompletedSets: jest.fn(() => []),
  isDayComplete: jest.fn(() => false),
  isDayLocked: jest.fn(() => false),
  getEstimatedTimeRemaining: jest.fn(() => null),
  getEstimatedEndTime: jest.fn(() => null),
  getTotalSessionTime: jest.fn(() => 0),
  getCurrentRestTime: jest.fn(() => 0),
  getSessionAverageRestTime: jest.fn(() => 0),
  getExerciseRestTime: jest.fn(() => null),
  getLastSetExercise: jest.fn(() => null),
  getSessionStats: jest.fn(() => null),
  updateExerciseName: resolved(undefined),
  updateExerciseMachines: resolved(undefined),
  addExtraSetsToExercise: resolved(undefined),
  addNewExercise: resolved(undefined),
  fetchSessionHistory: resolved([]),
  fetchRecordSessions: resolved([]),
  syncFromServer: resolved(undefined),
  syncPendingData: resolved(undefined),
  clearAllData: resolved(undefined),
  ...overrides,
})

export const makeSyncStatus = (overrides: Overrides = {}): Overrides => ({
  pendingSyncs: [],
  isSyncing: false,
  droppedSyncs: [],
  droppedSyncCount: 0,
  acknowledgeDroppedSyncs: jest.fn(),
  ...overrides,
})

export const makeJointSession = (overrides: Overrides = {}): Overrides => ({
  subscribeToSocket: jest.fn(() => jest.fn()),
  jointSession: null,
  isInJointSession: false,
  partnerProgress: null,
  partnerExerciseList: [],
  myJointProgress: null,
  pendingJointInvite: null,
  jointInviteStatus: "idle",
  isPartnerReady: false,
  syncPulse: false,
  sendJointInvite: resolved(true),
  acceptJointInvite: resolved(true),
  declineJointInvite: resolved(undefined),
  leaveJointSession: resolved(undefined),
  pushJointProgress: resolved(undefined),
  partnerCompletedSets: [],
  isWatching: false,
  watchTarget: null,
  watchSession: null,
  watchLoading: false,
  watchError: null,
  startWatching: resolved(true),
  stopWatching: jest.fn(),
  watchers: [],
  blockWatcher: resolved(undefined),
  ...overrides,
})

/** What the mocked hooks return. Reset by every renderWithProviders call. */
export const current = {
  auth: makeAuth(),
  token: "test-token",
  workout: makeWorkout(),
  syncStatus: makeSyncStatus(),
  jointSession: makeJointSession(),
  route: { key: "r1", name: "Test", params: undefined as unknown },
  navigation: {} as Record<string, jest.Mock>,
}

const makeNavigation = (): Record<string, jest.Mock> => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  reset: jest.fn(),
  setOptions: jest.fn(),
  setParams: jest.fn(),
  dispatch: jest.fn(),
  getParent: jest.fn(() => undefined),
  isFocused: jest.fn(() => true),
  canGoBack: jest.fn(() => true),
  addListener: jest.fn(() => jest.fn()),
  removeListener: jest.fn(),
})
current.navigation = makeNavigation()

// A Proxy so a hook the screen reads that isn't listed above still returns a
// no-op instead of crashing the mount with "x is not a function".
const withNoopFallback = <T extends Overrides>(value: T): T =>
  new Proxy(value, {
    get: (target, key) =>
      key in target || typeof key === "symbol" ? target[key as keyof T] : jest.fn(),
  })

export const authModule = {
  __esModule: true,
  useAuth: () => current.auth,
  useAuthToken: () => current.token,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}

export const workoutModule = {
  __esModule: true,
  useWorkout: () => withNoopFallback(current.workout),
  useWorkoutPick: () => withNoopFallback(current.workout),
  useWorkoutSyncStatus: () => current.syncStatus,
  WorkoutProvider: ({ children }: { children: React.ReactNode }) => children,
}

export const jointSessionModule = {
  __esModule: true,
  useJointSessionContext: () => withNoopFallback(current.jointSession),
  useJointSessionContextOptional: () => withNoopFallback(current.jointSession),
  JointSessionProvider: ({ children }: { children: React.ReactNode }) => children,
}

export const themeModule = (() => {
  const actual = jest.requireActual("@shared/context/ThemeContext")
  const colors = actual.LIGHT_COLORS
  const value = {
    theme: { id: "light", name: "Light", colors },
    colors,
    isDark: false,
    activeThemeId: "light",
    allThemes: [],
    setTheme: resolved(undefined),
    saveCustomTheme: resolved(undefined),
    deleteCustomTheme: resolved(undefined),
    chartColorOverride: null,
    chartColorDarkOverride: null,
    setChartColorOverride: resolved(undefined),
    resolvedChartColor: colors.accent,
    resolvedChartColorDark: colors.accent,
  }
  return {
    ...actual,
    __esModule: true,
    useTheme: () => value,
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  }
})()

export const navigationModule = (() => {
  const actual = jest.requireActual("@react-navigation/native")
  const { useEffect } = jest.requireActual("react")
  return {
    ...actual,
    __esModule: true,
    useNavigation: () => current.navigation,
    useRoute: () => current.route,
    useIsFocused: () => true,
    useScrollToTop: () => {},
    useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]),
  }
})()

export interface ProviderOptions {
  auth?: Overrides
  token?: string
  workout?: Overrides
  syncStatus?: Overrides
  jointSession?: Overrides
  routeParams?: unknown
}

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

export async function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  current.auth = makeAuth(options.auth)
  current.token = options.token ?? "test-token"
  current.workout = makeWorkout(options.workout)
  current.syncStatus = makeSyncStatus(options.syncStatus)
  current.jointSession = makeJointSession(options.jointSession)
  current.route = { key: "r1", name: "Test", params: options.routeParams }
  current.navigation = makeNavigation()
  return render(
    <SafeAreaProvider initialMetrics={safeAreaMetrics}>
      <TabBarProvider>{ui}</TabBarProvider>
    </SafeAreaProvider>,
  )
}
