import React from "react"
import { act, fireEvent, screen, waitFor } from "@testing-library/react-native"
import { AppState } from "react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { TabBarProvider } from "@shared/context/TabBarContext"
import { current, renderWithProviders } from "test-utils/renderWithProviders"
import { workoutApi } from "@features/workout/services/index"
import HomeScreen from "../HomeScreen"

jest.mock("@shared/components/ZoomableImage", () => ({ __esModule: true, default: () => null }))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/JointSessionContext", () => require("test-utils/renderWithProviders").jointSessionModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/services/appMode", () => ({
  ...jest.requireActual("@shared/services/appMode"),
  isServerless: jest.fn(async () => false),
}))
jest.mock("@shared/services/serverVersion", () => ({
  ...jest.requireActual("@shared/services/serverVersion"),
  useOutdatedServer: () => null,
}))
jest.mock("@features/tutorial/TutorialContext", () => ({
  useTutorial: () => ({ offerTrainerTour: jest.fn() }),
}))
jest.mock("../ForeignWidget", () => () => null)
jest.mock("@features/healthConnect/HealthWidget", () => () => null)
jest.mock("@features/tracking/services", () => ({
  sorenessApi: { getActiveSoreness: jest.fn(async () => ({ data: [] })) },
}))
jest.mock("@features/workout/services/index", () => ({
  workoutApi: { getSession: jest.fn() },
}))
jest.mock("react-native/Libraries/Components/RefreshControl/RefreshControl", () => {
  const { Pressable } = require("react-native")
  return {
    __esModule: true,
    default: ({ onRefresh }: { onRefresh: () => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel="refresh" onPress={onRefresh} />
    ),
  }
})
jest.mock("@shared/components/toast", () => ({ showToast: jest.fn() }))
// The real calendar renders a whole month. This stand-in exposes one button for today.
jest.mock("@shared/components/UniversalCalendar", () => {
  const { Pressable, Text } = require("react-native")
  return {
    __esModule: true,
    default: ({ onDatePress }: { onDatePress: (d: Date) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onDatePress(new Date())}>
        <Text>calendar today</Text>
      </Pressable>
    ),
  }
})

const safeAreaMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
}

const tree = () => (
  <SafeAreaProvider initialMetrics={safeAreaMetrics}>
    <TabBarProvider>
      <HomeScreen />
    </TabBarProvider>
  </SafeAreaProvider>
)

const session = (startTime: Date) => ({
  id: 7,
  dayNumber: 1,
  startTime: startTime.toISOString(),
  completedSets: 12,
  totalDuration: 3600,
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it("reloads history on focus once a workout has started", async () => {
  const fetchSessionHistory = jest.fn(async () => [])
  const view = await renderWithProviders(<HomeScreen />, {
    workout: { fetchSessionHistory, hasActiveSession: jest.fn(() => false) },
  })
  await waitFor(() => expect(fetchSessionHistory).toHaveBeenCalledTimes(1))

  current.workout.hasActiveSession = jest.fn(() => true)
  await view.rerender(tree())

  await waitFor(() => expect(fetchSessionHistory).toHaveBeenCalledTimes(2))
})

it("moves the streak on to the new week when the app resumes after midnight", async () => {
  jest.useFakeTimers({ advanceTimers: true, now: new Date(2026, 9, 25, 12) })
  const listeners: ((state: string) => void)[] = []
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, listener) => {
    listeners.push(listener as (state: string) => void)
    return { remove: jest.fn() } as never
  })
  await renderWithProviders(<HomeScreen />, {
    workout: { fetchSessionHistory: jest.fn(async () => [session(new Date(2026, 9, 25, 10))]) },
  })
  expect(await screen.findByText("Logged this week")).toBeTruthy()

  jest.setSystemTime(new Date(2026, 9, 26, 8))
  await act(async () => listeners.forEach((listener) => listener("active")))

  expect(await screen.findByText("Log a workout this week to keep it going")).toBeTruthy()
})

it("tells the user when changing day fails", async () => {
  await renderWithProviders(<HomeScreen />, {
    workout: {
      selectedSplit: "A",
      workoutData: {
        days: [
          { dayNumber: 1, primaryMuscles: ["Chest"], exercises: [] },
          { dayNumber: 2, primaryMuscles: ["Back"], exercises: [] },
        ],
      },
      saveCurrentDay: jest.fn(async () => {
        throw new Error("disk full")
      }),
    },
  })

  await fireEvent.press(await screen.findByLabelText("Change day"))
  await fireEvent.press(await screen.findByLabelText("Day 2, Back"))

  expect(await screen.findByText("Couldn't Change Day")).toBeTruthy()
})

it("syncs before reloading history on pull to refresh", async () => {
  let finishSync: (synced: boolean) => void = () => {}
  const syncFromServer = jest.fn(() => new Promise<boolean>((resolve) => (finishSync = resolve)))
  const fetchSessionHistory = jest.fn(async () => [])
  await renderWithProviders(<HomeScreen />, { workout: { syncFromServer, fetchSessionHistory } })
  await waitFor(() => expect(fetchSessionHistory).toHaveBeenCalledTimes(1))

  const refreshing = fireEvent.press(screen.getByLabelText("refresh"))
  expect(syncFromServer).toHaveBeenCalled()
  expect(fetchSessionHistory).toHaveBeenCalledTimes(1)

  finishSync(true)
  await refreshing
  await waitFor(() => expect(fetchSessionHistory).toHaveBeenCalledTimes(2))
})

it("opens a session once when it is tapped twice quickly", async () => {
  jest.mocked(workoutApi.getSession).mockReturnValue(new Promise(() => {}))
  await renderWithProviders(<HomeScreen />, {
    workout: { fetchSessionHistory: jest.fn(async () => [session(new Date())]) },
  })

  await fireEvent.press(await screen.findByText("calendar today"))
  const row = await screen.findByLabelText(/12 sets/)
  await act(async () => {
    fireEvent.press(row)
    fireEvent.press(row)
  })

  expect(workoutApi.getSession).toHaveBeenCalledTimes(1)
})
