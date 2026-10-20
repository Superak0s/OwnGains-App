jest.mock("@features/tracking/TrackingScreen", () => () => null)
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@features/analytics/components/ExerciseAnalytics", () => () => null)
jest.mock("@features/trainer/services", () => ({
  ...jest.requireActual("@features/trainer/services"),
  trainerApi: {
    getClients: jest.fn(),
    getSentRequests: jest.fn(),
    sendRequest: jest.fn(),
    cancelRequest: jest.fn(),
  },
}))
jest.mock("@features/friends/services", () => ({
  ...jest.requireActual("@features/friends/services"),
  friendsApi: { searchUsers: jest.fn() },
  sharingApi: {
    getFriendSessions: jest.fn(),
    getFriendSessionsWithTimings: jest.fn(),
    getFriendSessionDetails: jest.fn(),
    grantPermission: jest.fn(),
  },
}))

import React from "react"
import { fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { trainerApi } from "@features/trainer/services"
import { getActiveTrainee, setActiveTrainee } from "@shared/services/trainerEvents"
import ClientsScreen from "../ClientsScreen"

const trainer = trainerApi as unknown as Record<string, jest.Mock>

const neverTrained = { userId: "1", username: "nikos", lastWorkoutAt: null, sessionsThisWeek: 0, activeProgramDayCount: 3, hasTrackingAccess: false }
const maria = {
  userId: "2",
  username: "maria",
  lastWorkoutAt: new Date(2026, 9, 13, 18).toISOString(),
  sessionsThisWeek: 2,
  activeProgramDayCount: 3,
  hasTrackingAccess: false,
}
const sentToAlex = {
  id: "9",
  fromUserId: "u1",
  fromUsername: "tester",
  toUserId: "3",
  toUsername: "alex",
  includeTracking: false,
  createdAt: "2026-10-12T10:00:00Z",
}

beforeEach(() => {
  jest.clearAllMocks()
  // Wednesday, so a 3-day target expects one session by now.
  jest.useFakeTimers({
    now: new Date(2026, 9, 14, 12),
    doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "queueMicrotask", "clearTimeout", "clearInterval"],
  })
  trainer.getSentRequests.mockResolvedValue([sentToAlex])
})

afterEach(() => jest.useRealTimers())

it("splits clients into needs attention and on track, and lists sent requests", async () => {
  trainer.getClients.mockResolvedValue([maria, neverTrained])
  await renderWithProviders(<ClientsScreen />)

  expect(await screen.findByText("Needs attention")).toBeTruthy()
  expect(screen.getByText("No workouts yet · 0 of 3 this week")).toBeTruthy()
  expect(screen.getByText("On track")).toBeTruthy()
  expect(screen.queryByText("Inactive")).toBeNull()
  expect(screen.getByText("Last workout yesterday · 2 of 3 this week")).toBeTruthy()
  expect(screen.getByText("alex")).toBeTruthy()
  expect(screen.getByText("Sent 2 days ago")).toBeTruthy()
  expect(trainer.getClients).toHaveBeenCalledWith("2026-10-12")
})

it("shows the empty state when there are no clients", async () => {
  trainer.getClients.mockResolvedValue([])
  trainer.getSentRequests.mockResolvedValue([])
  await renderWithProviders(<ClientsScreen />)

  expect(await screen.findByText("No clients yet")).toBeTruthy()
})

it("stops a trainer session for someone who is no longer a client", async () => {
  setActiveTrainee({ userId: "7", username: "gone" })
  trainer.getClients.mockResolvedValue([maria])
  await renderWithProviders(<ClientsScreen />)

  await screen.findByText("maria")
  expect(getActiveTrainee()).toBeNull()
})

it("keeps the trainer session for a current client", async () => {
  setActiveTrainee({ userId: "2", username: "maria" })
  trainer.getClients.mockResolvedValue([maria])
  await renderWithProviders(<ClientsScreen />)

  await screen.findByText("maria")
  expect(getActiveTrainee()).toEqual({ userId: "2", username: "maria" })
})

it("retries a failed load and keeps the roster it already had on screen", async () => {
  trainer.getClients.mockRejectedValueOnce(new Error("offline")).mockResolvedValue([maria])
  await renderWithProviders(<ClientsScreen />)

  await fireEvent.press(await screen.findByRole("button", { name: "Retry" }))

  expect(await screen.findByText("maria")).toBeTruthy()
  expect(screen.queryByRole("button", { name: "Retry" })).toBeNull()
})

it("cancels a sent request after confirming", async () => {
  trainer.getClients.mockResolvedValue([maria])
  trainer.cancelRequest.mockResolvedValue(undefined)
  await renderWithProviders(<ClientsScreen />)

  await fireEvent.press(await screen.findByRole("button", { name: "Cancel request to alex" }))
  await fireEvent.press(screen.getByText("Cancel request"))

  expect(trainer.cancelRequest).toHaveBeenCalledWith("9")
})
