jest.mock("@features/tracking/TrackingScreen", () => () => null)
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@features/analytics/components/ExerciseAnalytics", () => () => null)
jest.mock("@features/schedule/ScheduleWidget", () => () => null)
// The real calendar only renders the current month, so this stand-in exposes one button for the session date.
jest.mock("@shared/components/UniversalCalendar", () => {
  const { Pressable, Text } = require("react-native")
  return {
    __esModule: true,
    default: ({ onDatePress }: { onDatePress: (d: Date) => void }) => (
      <Pressable accessibilityRole="button" onPress={() => onDatePress(new Date(2026, 9, 13))}>
        <Text>Oct 13</Text>
      </Pressable>
    ),
  }
})
jest.mock("@features/friends/services", () => ({
  ...jest.requireActual("@features/friends/services"),
  sharingApi: {
    getFriendSessions: jest.fn(),
    getFriendSessionsWithTimings: jest.fn(),
    getFriendSessionDetails: jest.fn(),
    getReceivedPermissions: jest.fn().mockResolvedValue([]),
  },
}))

const mockFetchSavedProgram = jest.fn().mockResolvedValue(null)
jest.mock("@features/plan/services/programApiFactory", () => ({
  makeProgramApi: () => ({ fetchSavedProgram: mockFetchSavedProgram }),
}))

import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { SafeAreaProvider } from "react-native-safe-area-context"
import { sharingApi } from "@features/friends/services"
import ClientPage from "../ClientPage"

const sharing = sharingApi as unknown as Record<string, jest.Mock>

const client = (userId: string, username: string) => ({
  userId,
  username,
  lastWorkoutAt: null,
  sessionsThisWeek: 0,
  activeProgramDayCount: null,
  hasTrackingAccess: false,
})
const session = { id: 5, startTime: "2026-10-13T18:00:00Z", setTimings: [], exerciseCount: 1 }
const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }
const wrap = (ui: React.ReactElement) => <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
const props = {
  trainerId: "u1",
  now: new Date(2026, 9, 14, 12),
  onClose: jest.fn(),
  onStartSession: jest.fn(),
  onSendProgram: jest.fn(),
  onError: jest.fn(),
  dayChoices: [],
  splitChoices: ["A", "B"],
  onEditProgram: jest.fn(),
  onRemoveClient: jest.fn(),
  onAskTracking: jest.fn(),
}

it("drops a session that finishes loading after the trainer switched to another client", async () => {
  let resolveDetails: (v: unknown) => void = () => {}
  sharing.getFriendSessions.mockResolvedValue([session])
  sharing.getFriendSessionDetails.mockReturnValue(new Promise((r) => (resolveDetails = r)))
  const view = await render(wrap(<ClientPage {...props} client={client("1", "anna")} />))

  await fireEvent.press(await screen.findByRole("button", { name: "Oct 13" }))
  await view.rerender(wrap(<ClientPage {...props} client={null} />))
  await view.rerender(wrap(<ClientPage {...props} client={client("2", "bea")} />))
  await act(async () => resolveDetails({ ...session, setTimings: [] }))

  expect(screen.queryByText("Workout Details")).toBeNull()
  expect(screen.getByRole("button", { name: "Start a session for bea" })).toBeTruthy()
})

it.each([
  [["anna's program"], null],
  [["My program", "Day 1 · Push"], { dayTitle: "Push", exercises: [{ name: "Bench", sets: 3 }] }],
  [["Empty workout"], { dayTitle: "Empty workout", exercises: [] }],
])("starts the session from %j", async (path, start) => {
  sharing.getFriendSessions.mockResolvedValue([])
  const onStartSession = jest.fn()
  const dayChoices = [{ label: "Day 1 · Push", start: { dayTitle: "Push", exercises: [{ name: "Bench", sets: 3 }] } }]
  await render(
    wrap(<ClientPage {...props} onStartSession={onStartSession} dayChoices={dayChoices} client={client("1", "anna")} />),
  )

  await fireEvent.press(screen.getByRole("button", { name: "Start a session for anna" }))
  for (const choice of path) await fireEvent.press(screen.getByRole("button", { name: choice }))

  expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }), start)
})

it("sends only the splits the trainer keeps ticked", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  const onSendProgram = jest.fn()
  await render(wrap(<ClientPage {...props} onSendProgram={onSendProgram} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Send anna your program" }))
  await fireEvent.press(screen.getByRole("checkbox", { name: "B" }))
  await fireEvent.press(screen.getByRole("button", { name: "Send 1 split to anna" }))

  expect(onSendProgram).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }), ["A"])
})

it("sends a one-split program without asking which", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  const onSendProgram = jest.fn()
  await render(
    wrap(<ClientPage {...props} splitChoices={["A"]} onSendProgram={onSendProgram} client={client("1", "anna")} />),
  )

  await fireEvent.press(screen.getByRole("button", { name: "Send anna your program" }))

  expect(onSendProgram).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }), ["A"])
})

it("opens the client's program for editing", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  const onEditProgram = jest.fn()
  await render(wrap(<ClientPage {...props} onEditProgram={onEditProgram} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Edit anna's program" }))

  expect(onEditProgram).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }))
})

it("closes the session picker when the trainer opens the split picker", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  await render(wrap(<ClientPage {...props} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Start a session for anna" }))
  await fireEvent.press(screen.getByRole("button", { name: "Send anna your program" }))

  expect(screen.queryByText("Start which workout?")).toBeNull()
  expect(screen.getByText("Send which splits?")).toBeTruthy()
})

it("asks to remove the client", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  const onRemoveClient = jest.fn()
  await render(wrap(<ClientPage {...props} onRemoveClient={onRemoveClient} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Remove anna as a client" }))

  expect(onRemoveClient).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }))
})

it("disables My program when the trainer has no program days", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  await render(wrap(<ClientPage {...props} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Start a session for anna" }))

  expect(screen.getByRole("button", { name: "My program" })).toBeDisabled()
})

it("starts the client's program on the split the trainer picks", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  mockFetchSavedProgram.mockResolvedValue({ days: [{ day: 1, split: { Upper: { exercises: [] }, Lower: { exercises: [] } } }] })
  const onStartSession = jest.fn()
  await render(wrap(<ClientPage {...props} onStartSession={onStartSession} client={client("1", "anna")} />))

  await fireEvent.press(screen.getByRole("button", { name: "Start a session for anna" }))
  await screen.findByText("Pick one of their splits")
  await fireEvent.press(await screen.findByRole("button", { name: "anna's program" }))
  await fireEvent.press(screen.getByRole("button", { name: "Lower" }))

  expect(onStartSession).toHaveBeenCalledWith(expect.objectContaining({ userId: "1" }), null, "Lower")
})

it("lists the sessions of a calendar day that has more than one", async () => {
  sharing.getFriendSessions.mockResolvedValue([session, { ...session, id: 6, loggedByTrainerId: "u1" }])
  await render(wrap(<ClientPage {...props} client={client("1", "anna")} />))

  await fireEvent.press(await screen.findByRole("button", { name: "Oct 13" }))

  expect(screen.getByRole("button", { name: /on their own\. Open details/ })).toBeTruthy()
  expect(screen.getByRole("button", { name: /with you\. Open details/ })).toBeTruthy()
})

it("lists which permissions the client has granted, and asks for Tracking Access", async () => {
  sharing.getFriendSessions.mockResolvedValue([])
  sharing.getReceivedPermissions.mockResolvedValue([
    { fromUserId: "1", permissionType: "trainer" },
    { fromUserId: "9", permissionType: "tracking" },
  ])
  const c = client("1", "anna")
  await render(wrap(<ClientPage {...props} client={c} />))

  expect(await screen.findByLabelText("Trainer Access, granted")).toBeTruthy()
  expect(screen.getByLabelText("Tracking Access, not granted")).toBeTruthy()
  await fireEvent.press(screen.getByRole("button", { name: "Ask anna for Tracking Access" }))
  expect(props.onAskTracking).toHaveBeenCalledWith(c)
})
