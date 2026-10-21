import React from "react"
import { screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import SessionDetailsSheet from "../SessionDetailsSheet"
import type { SessionRecord } from "../../types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

const session: SessionRecord = {
  id: 1,
  dayNumber: 2,
  dayTitle: "Day 2 — Push",
  startTime: "2026-10-01T09:00:00.000Z",
  completedSets: 1,
  groupedExercises: [
    { exerciseName: "Bench Press", sets: [{ setIndex: 0, endTime: "2026-10-01T09:05:00.000Z", weight: 100, reps: 5 }] },
  ],
}

describe("SessionDetailsSheet", () => {
  it("shows a friend's sets in the viewer's weight unit", async () => {
    await renderWithProviders(<SessionDetailsSheet session={session} visible onClose={jest.fn()} />, {
      workout: { weightUnit: "lbs" },
    })

    expect(screen.getByText("220.5lbs × 5")).toBeTruthy()
    expect(screen.queryByText(/100kg/)).toBeNull()
  })
})
