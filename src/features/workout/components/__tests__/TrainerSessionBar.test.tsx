jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

import { fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { TrainerSessionBar } from "../TrainerSessionBar"

async function stopWith(ended: boolean) {
  const onStop = jest.fn()
  await renderWithProviders(<TrainerSessionBar username="sam" onStop={onStop} />, {
    workout: {
      workoutStartTime: "2026-10-20T10:00:00.000Z",
      endWorkout: jest.fn(async () => ended),
      hasActiveSession: () => true,
    },
  })
  await fireEvent.press(screen.getByLabelText("Stop trainer session"))
  await fireEvent.press(screen.getByText("End workout"))
  return onStop
}

it("leaves the session once the workout has ended", async () => {
  expect(await stopWith(true)).toHaveBeenCalledTimes(1)
})

it("stays in the session and says so when ending the workout fails", async () => {
  const onStop = await stopWith(false)

  expect(onStop).not.toHaveBeenCalled()
  expect(screen.getByText("Workout not ended")).toBeTruthy()
})
