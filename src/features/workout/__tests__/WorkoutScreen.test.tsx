jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/JointSessionContext", () => require("test-utils/renderWithProviders").jointSessionModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/components/ScrollTabBar", () => ({ __esModule: true, default: () => null }))

import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { program, noPlanSelected, programWithEmptyDay, traineeWithNoProgram } from "test-utils/fixtures"
import type { SetDetail } from "@shared/types"
import WorkoutScreen from "../WorkoutScreen"

const press = async (label: string | RegExp) => fireEvent.press(await screen.findByRole("button", { name: label }))

const withProgram = (overrides: Record<string, unknown> = {}) => ({
  workout: { workoutData: program, sessionWorkoutData: program, selectedSplit: "A", ...overrides },
})

const loggedBench: SetDetail = { weight: 80, reps: 8, completedAt: "2026-10-01T10:05:00.000Z" } as SetDetail

// What WorkoutContext restores after Android kills the app mid-workout:
// the start time and the first Bench Press set come back from storage.
const resumedSession = (overrides: Record<string, unknown> = {}) =>
  withProgram({
    workoutStartTime: Date.parse("2026-10-01T10:00:00.000Z"),
    currentSessionId: 12,
    hasActiveSession: jest.fn(() => true),
    isSetComplete: jest.fn((_d: number, ex: number, set: number) => ex === 0 && set === 0),
    getSetDetails: jest.fn((_d: number, ex: number, set: number) => (ex === 0 && set === 0 ? loggedBench : null)),
    ...overrides,
  })

const benchSet1Logged = /^Set 1, completed, 80 kg for 8 reps/

beforeEach(() => {
  require("test-utils/memorySqlite").resetMemorySqlite()
  jest.spyOn(console, "error").mockImplementation(() => {})
})

describe("mounting with edge-case data", () => {
  it("opens with no plan and sends the user to Plan", async () => {
    await renderWithProviders(<WorkoutScreen />)

    expect(await screen.findByText("No Workout Plan")).toBeTruthy()
    await press("Go to Plan Screen")
    expect(current.navigation.navigate).toHaveBeenCalledWith("Plan")
  })

  it("opens with a program but no split selected", async () => {
    await renderWithProviders(<WorkoutScreen />, { workout: { ...noPlanSelected, sessionWorkoutData: program } })

    expect(await screen.findByText("No Split Selected")).toBeTruthy()
  })

  it("opens on a split day with no exercises and still lets the user add one", async () => {
    await renderWithProviders(<WorkoutScreen />, {
      workout: { workoutData: programWithEmptyDay, sessionWorkoutData: programWithEmptyDay, selectedSplit: "A", currentDay: 2 },
    })

    expect(await screen.findByLabelText("0 of 0 sets completed")).toBeTruthy()
    expect(screen.getByText("Add New Exercise")).toBeTruthy()
  })

  it("opens a trainee's workout when the trainee has no program", async () => {
    await renderWithProviders(<WorkoutScreen />, { workout: { ...traineeWithNoProgram, sessionWorkoutData: null } })

    expect(await screen.findByText("trainee hasn't set up a workout program yet.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Go to Plan Screen" })).toBeNull()
  })

  it("shows the restored sets and the finish button after the app is restarted mid-workout", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    expect(await screen.findByRole("button", { name: benchSet1Logged })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Complete workout" })).toBeTruthy()
  })
})

describe("recording a set", () => {
  const fillSet = async (weight: string, reps: string) => {
    await fireEvent.changeText(await screen.findByLabelText("Weight in kg, leave zero for bodyweight"), weight)
    await fireEvent.changeText(screen.getByLabelText("Reps"), reps)
    await press("Save set")
  }

  it("saves the weight in kg and the reps for the tapped set", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    await fireEvent.press((await screen.findAllByRole("button", { name: "Set 1, not logged" }))[0])
    await fillSet("80", "8")

    await waitFor(() =>
      expect(current.workout.saveSetDetails).toHaveBeenCalledWith(1, 0, 0, 80, 8, { note: "", isWarmup: false, rir: undefined }),
    )
  })

  it("refuses a blank weight instead of storing it as a bodyweight set", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    await fireEvent.press((await screen.findAllByRole("button", { name: "Set 1, not logged" }))[0])
    await fillSet("", "8")

    expect(await screen.findByText("Weight missing")).toBeTruthy()
    expect(current.workout.saveSetDetails).not.toHaveBeenCalled()
  })

  it("keeps the entry open and tells the user when the save fails", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram({ saveSetDetails: jest.fn(async () => { throw new Error("disk full") }) }))

    await fireEvent.press((await screen.findAllByRole("button", { name: "Set 1, not logged" }))[0])
    await fillSet("80", "8")

    expect(await screen.findByText("Set Not Saved")).toBeTruthy()
    expect(screen.getByLabelText("Reps").props.value).toBe("8")
  })

  it("edits a logged set in place rather than adding a second one", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press(benchSet1Logged)
    await press("Edit")
    expect((await screen.findByLabelText("Reps")).props.value).toBe("8")
    await fireEvent.changeText(screen.getByLabelText("Reps"), "10")
    await press("Save set")

    await waitFor(() => expect(current.workout.saveSetDetails).toHaveBeenCalledWith(1, 0, 0, 80, 10, expect.anything()))
  })

  it("deletes a logged set only after the second confirmation", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press(benchSet1Logged)
    await press("Delete")
    expect(current.workout.deleteSetDetails).not.toHaveBeenCalled()
    await press("Delete")

    await waitFor(() => expect(current.workout.deleteSetDetails).toHaveBeenCalledWith(1, 0, 0))
  })

  it("tells the user when a set could not be deleted", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ deleteSetDetails: jest.fn(async () => false) }))

    await press(benchSet1Logged)
    await press("Delete")
    await press("Delete")

    expect(await screen.findByText("Not Deleted")).toBeTruthy()
  })

  it("doesn't offer a trainer the delete that the trainee grant refuses", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ actAs: { userId: "t1", username: "trainee" } }))

    await press(benchSet1Logged)

    expect(await screen.findByRole("button", { name: "Edit" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull()
  })
})

describe("ending the workout", () => {
  it("ends the session and locks the day after confirmation", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press("Complete workout")
    expect(await screen.findByText("You've completed 0/6 sets. End this session? The day will be locked.")).toBeTruthy()
    await press("Complete & Lock")

    await waitFor(() => expect(current.workout.endWorkout).toHaveBeenCalledTimes(1))
    expect(await screen.findByText("Workout Completed!")).toBeTruthy()
  })

  it("doesn't end the session when the confirmation is cancelled", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press("Complete workout")
    await press("Cancel")

    expect(current.workout.endWorkout).not.toHaveBeenCalled()
  })

  it("doesn't claim the day is locked when ending the session failed", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ endWorkout: jest.fn(async () => false) }))

    await press("Complete workout")
    await press("Complete & Lock")

    await waitFor(() => expect(current.workout.endWorkout).toHaveBeenCalled())
    expect(screen.queryByText("Workout Completed!")).toBeNull()
  })
})
