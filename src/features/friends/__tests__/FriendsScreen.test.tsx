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
jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, jest.fn()],
}))
jest.mock("react-native-qrcode-svg", () => () => null)
jest.mock("@features/analytics/components/ExerciseAnalytics", () => () => null)
jest.mock("@shared/components/ScrollTabBar", () => {
  const { Pressable, Text } = require("react-native")
  return {
    __esModule: true,
    default: ({ tabs, onTabChange }: { tabs: { key: string; label: string }[]; onTabChange: (k: string) => void }) =>
      tabs.map((t) => (
        <Pressable key={t.key} accessibilityRole="button" onPress={() => onTabChange(t.key)}>
          <Text>{`${t.label} tab`}</Text>
        </Pressable>
      )),
  }
})
// The real calendar only renders the current month, so this stand-in exposes one button for the session date.
jest.mock("@shared/components/UniversalCalendar", () => {
  const { Pressable, Text } = require("react-native")
  return {
    __esModule: true,
    default: ({ onDatePress }: { onDatePress: (d: Date) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onDatePress(new Date("2026-10-01T12:00:00.000Z"))}>
        <Text>Oct 1</Text>
      </Pressable>
    ),
  }
})
jest.mock("@features/friends/services", () => ({
  ...jest.requireActual("@features/friends/services"),
  friendsApi: {
    getFriends: jest.fn(),
    getPendingRequests: jest.fn(),
    getSentRequests: jest.fn(),
    acceptFriendRequest: jest.fn(),
    removeFriend: jest.fn(),
  },
  sharingApi: {
    getGrantedPermissions: jest.fn(),
    getReceivedPermissions: jest.fn(),
    getFriendSessionStatuses: jest.fn(),
    getFriendSessions: jest.fn(),
    getFriendSessionDetails: jest.fn(),
  },
}))

import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { friend, friendWithNoSharedData } from "test-utils/fixtures"
import { friendsApi, sharingApi } from "@features/friends/services"
import FriendsScreen from "../FriendsScreen"

const friends = friendsApi as unknown as Record<string, jest.Mock>
const sharing = sharingApi as unknown as Record<string, jest.Mock>

const pendingFromAlex = { id: 31, senderId: 9, senderUsername: "alex", createdAt: "2026-10-01T00:00:00.000Z" }
const historyFromBuddy = {
  id: 1,
  fromUserId: friend.id,
  fromUsername: friend.username,
  permissionType: "history",
  payload: null,
  hasPayload: false,
  createdAt: "2026-01-01T00:00:00.000Z",
}

const mount = async (data: { friends?: unknown[]; pending?: unknown[]; received?: unknown[] } = {}) => {
  friends.getFriends.mockResolvedValue(data.friends ?? [])
  friends.getPendingRequests.mockResolvedValue(data.pending ?? [])
  friends.getSentRequests.mockResolvedValue([])
  sharing.getGrantedPermissions.mockResolvedValue([])
  sharing.getReceivedPermissions.mockResolvedValue(data.received ?? [])
  sharing.getFriendSessionStatuses.mockResolvedValue({})
  await renderWithProviders(<FriendsScreen />)
}

const openBuddy = async () => fireEvent.press(await screen.findByText(friend.username))

beforeEach(() => {
  require("test-utils/memorySqlite").resetMemorySqlite()
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation(() => {})
})

describe("mounting with edge-case data", () => {
  it("shows the empty state instead of a blank list for a user with no friends", async () => {
    await mount()

    expect(await screen.findByText("No friends yet")).toBeTruthy()
    expect(screen.getByText("Your Friends (0)")).toBeTruthy()
  })

  it("offers a retry rather than 'No friends yet' when the friends list fails to load", async () => {
    friends.getFriends.mockRejectedValue(new Error("Network request failed"))
    friends.getPendingRequests.mockResolvedValue([])
    friends.getSentRequests.mockResolvedValue([])
    sharing.getGrantedPermissions.mockResolvedValue([])
    sharing.getReceivedPermissions.mockResolvedValue([])
    await renderWithProviders(<FriendsScreen />)

    expect(await screen.findByText("Couldn't load your friends")).toBeTruthy()
    expect(screen.queryByText("No friends yet")).toBeNull()
  })

  it("opens a friend who shares nothing on the actions tab without fetching their history", async () => {
    await mount({ friends: [friend] })

    await openBuddy()

    expect(await screen.findByText("Danger Zone")).toBeTruthy()
    expect(sharing.getFriendSessions).not.toHaveBeenCalled()
  })

  it("opens a shared workout that has no logged sets", async () => {
    sharing.getFriendSessions.mockResolvedValue([friendWithNoSharedData.emptySession])
    sharing.getFriendSessionDetails.mockResolvedValue({ ...friendWithNoSharedData.emptySession })
    await mount({ friends: [friend], received: [historyFromBuddy] })

    await openBuddy()
    await fireEvent.press(await screen.findByRole("button", { name: "Oct 1" }))

    expect(await screen.findByText("Workout Details")).toBeTruthy()
    expect(sharing.getFriendSessionDetails).toHaveBeenCalledWith(friend.id, 99)
    expect(screen.queryByText("Exercises")).toBeNull()
  })

  it("tells the user when a shared workout's details are gone", async () => {
    sharing.getFriendSessions.mockResolvedValue([friendWithNoSharedData.emptySession])
    sharing.getFriendSessionDetails.mockResolvedValue(null)
    await mount({ friends: [friend], received: [historyFromBuddy] })

    await openBuddy()
    await fireEvent.press(await screen.findByRole("button", { name: "Oct 1" }))

    expect(await screen.findByText("Failed to load session details")).toBeTruthy()
  })
})

describe("friend requests", () => {
  it("accepts a pending request and reloads the friends list", async () => {
    friends.acceptFriendRequest.mockResolvedValue(undefined)
    await mount({ pending: [pendingFromAlex] })

    await fireEvent.press(await screen.findByText("Requests tab"))
    await fireEvent.press(await screen.findByRole("button", { name: "Accept friend request from alex" }))

    await waitFor(() => expect(friends.acceptFriendRequest).toHaveBeenCalledWith(31))
    await waitFor(() => expect(friends.getFriends).toHaveBeenCalledTimes(2))
  })

  it("tells the user when accepting a request fails", async () => {
    friends.acceptFriendRequest.mockRejectedValue(new Error("Network request failed"))
    await mount({ pending: [pendingFromAlex] })

    await fireEvent.press(await screen.findByText("Requests tab"))
    await fireEvent.press(await screen.findByRole("button", { name: "Accept friend request from alex" }))

    await waitFor(() => expect(friends.acceptFriendRequest).toHaveBeenCalled())
    expect(friends.getFriends).toHaveBeenCalledTimes(1)
  })
})

describe("removing a friend", () => {
  it("keeps the friend when the confirmation is cancelled", async () => {
    await mount({ friends: [friend] })

    await openBuddy()
    await fireEvent.press(await screen.findByText("Remove Friend"))
    expect(await screen.findByText("Remove buddy from your friends list?")).toBeTruthy()
    await fireEvent.press(screen.getByText("Cancel"))

    expect(friends.removeFriend).not.toHaveBeenCalled()
  })

  it("removes the friend only after the user confirms", async () => {
    friends.removeFriend.mockResolvedValue(undefined)
    await mount({ friends: [friend] })

    await openBuddy()
    await fireEvent.press(await screen.findByText("Remove Friend"))
    await fireEvent.press(await screen.findByText("Remove"))

    await waitFor(() => expect(friends.removeFriend).toHaveBeenCalledWith(friend.id))
  })
})
