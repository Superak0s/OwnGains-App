jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    getSessionHistory: jest.fn(),
    getSession: jest.fn(),
    updateSet: jest.fn(),
  },
}))

import { act, fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { workoutApi } from "@features/workout/services/index"
import EditWorkoutHistoryModal from "../EditWorkoutHistoryModal"

const api = workoutApi as unknown as Record<"getSessionHistory" | "getSession" | "updateSet", jest.Mock>
const endTime = "2026-10-20T18:30:00.000Z"
const session = { id: 9, dayNumber: 1, dayTitle: "Push", startTime: endTime, setCount: 1 }
const set = { id: 4, exerciseName: "Bench Press", setIndex: 1, weight: 100, reps: 5, startTime: endTime, endTime }

async function openSet() {
  api.getSessionHistory.mockResolvedValue([session])
  api.getSession.mockResolvedValue({ ...session, setTimings: [set] })
  api.updateSet.mockImplementation(async (_s, _id, patch) => ({ ...set, ...patch }))
  await renderWithProviders(
    <EditWorkoutHistoryModal visible onClose={jest.fn()} split="A" onDataChanged={jest.fn()} />,
    { workout: { weightUnit: "lbs" } },
  )
  await act(async () => {
    screen.container.queryAll((n) => typeof n.props.onShow === "function")[0].props.onShow()
  })
  await fireEvent.press(await screen.findByRole("button", { name: /^Edit .*Push/ }))
  expect(await screen.findByText(/220\.46 lbs × 5/)).toBeTruthy()
  await fireEvent.press(screen.getByLabelText("Edit set 1 of Bench Press"))
}

beforeEach(() => jest.clearAllMocks())

it("edits a set in pounds and stores the weight in kg", async () => {
  await openSet()
  const input = screen.getByLabelText("Weight in pounds")
  expect(input.props.value).toBe("220.46")

  await fireEvent.changeText(input, "225")
  await fireEvent.press(screen.getByText("Save"))

  expect(api.updateSet.mock.calls[0][2].weight).toBeCloseTo(102.06, 2)
})

it("keeps the stored kg exactly when the weight is left as shown", async () => {
  await openSet()
  await fireEvent.changeText(screen.getByLabelText("Reps"), "6")
  await fireEvent.press(screen.getByText("Save"))

  expect(api.updateSet.mock.calls[0][2]).toMatchObject({ weight: 100, reps: 6 })
})
