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
import { SafeAreaProvider } from "react-native-safe-area-context"
import { TabBarProvider } from "@shared/context/TabBarContext"
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
    expect(screen.getByText("+ Add exercise")).toBeTruthy()
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
    expect((await screen.findByLabelText("Reps")).props.value).toBe("8")
    await fireEvent.changeText(screen.getByLabelText("Reps"), "10")
    await press("Save set")

    await waitFor(() => expect(current.workout.saveSetDetails).toHaveBeenCalledWith(1, 0, 0, 80, 10, expect.anything()))
  })

  it("deletes a logged set only after the second confirmation", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press(benchSet1Logged)
    await press("Delete set")
    expect(current.workout.deleteSetDetails).not.toHaveBeenCalled()
    await press("Delete")

    await waitFor(() => expect(current.workout.deleteSetDetails).toHaveBeenCalledWith(1, 0, 0))
  })

  it("tells the user when a set could not be deleted", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ deleteSetDetails: jest.fn(async () => false) }))

    await press(benchSet1Logged)
    await press("Delete set")
    await press("Delete")

    expect(await screen.findByText("Not Deleted")).toBeTruthy()
  })

  it("doesn't offer a trainer the delete that the trainee grant refuses", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ actAs: { userId: "t1", username: "trainee" } }))

    await press(benchSet1Logged)

    expect((await screen.findByLabelText("Reps")).props.value).toBe("8")
    expect(screen.queryByRole("button", { name: "Delete set" })).toBeNull()
  })
})

describe("ending the workout", () => {
  it("ends the session and locks the day after confirmation", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press("Complete workout")
    expect(await screen.findByText("6 of 6 sets aren't logged. The day will be locked and view-only.")).toBeTruthy()
    await press("Finish & lock")

    await waitFor(() => expect(current.workout.endWorkout).toHaveBeenCalledTimes(1))
    expect(await screen.findByText("Workout Completed!")).toBeTruthy()
  })

  it("doesn't end the session when the confirmation is cancelled", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession())

    await press("Complete workout")
    await press("Keep logging")

    expect(current.workout.endWorkout).not.toHaveBeenCalled()
  })

  it("doesn't claim the day is locked when ending the session failed", async () => {
    await renderWithProviders(<WorkoutScreen />, resumedSession({ endWorkout: jest.fn(async () => false) }))

    await press("Complete workout")
    await press("Finish & lock")

    await waitFor(() => expect(current.workout.endWorkout).toHaveBeenCalled())
    expect(screen.queryByText("Workout Completed!")).toBeNull()
  })
})

describe("weight unit per exercise", () => {
  it("switches only the exercise being logged and still saves kg", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    await fireEvent.press((await screen.findAllByRole("button", { name: "Set 1, not logged" }))[0])
    await fireEvent.press(await screen.findByRole("radio", { name: "Pounds" }))
    await fireEvent.changeText(await screen.findByLabelText("Weight in lbs, leave zero for bodyweight"), "100")
    await fireEvent.changeText(screen.getByLabelText("Reps"), "8")
    await press("Save set")

    await waitFor(() =>
      expect(current.workout.saveSetDetails).toHaveBeenCalledWith(1, 0, 0, expect.closeTo(45.36, 1), 8, expect.anything()),
    )
    expect(current.workout.saveWeightUnit).not.toHaveBeenCalled()

    await fireEvent.press((await screen.findAllByRole("button", { name: "Set 1, not logged" }))[1])
    expect(await screen.findByLabelText("Weight in kg, leave zero for bodyweight")).toBeTruthy()
  })
})

describe("adding a set", () => {
  it("removes the added set again when Undo is pressed", async () => {
    const view = await renderWithProviders(<WorkoutScreen />, withProgram())

    await fireEvent.press((await screen.findAllByRole("button", { name: "Add a set" }))[0])
    expect(current.workout.addExtraSetsToExercise).toHaveBeenCalledWith(1, "A", 0, 1)

    const benchFour = structuredClone(program)
    benchFour.days[0].split.A.exercises[0].sets = 4
    current.workout = { ...current.workout, workoutData: benchFour, sessionWorkoutData: benchFour }
    view.rerender(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <TabBarProvider>
          <WorkoutScreen />
        </TabBarProvider>
      </SafeAreaProvider>,
    )

    await press("Undo")
    await waitFor(() => expect(current.workout.addExtraSetsToExercise).toHaveBeenCalledWith(1, "A", 0, -1))
  })
})

describe("adding an exercise", () => {
  it("uses an exact name match without a confirmation dialog", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    await press("Add exercise")
    await fireEvent.changeText(await screen.findByLabelText("Exercise name, required"), "bench press")
    await fireEvent.changeText(screen.getByLabelText("Number of sets, required"), "3")
    const buttons = await screen.findAllByRole("button", { name: "Add exercise" })
    await fireEvent.press(buttons[buttons.length - 1])

    await waitFor(() =>
      expect(current.workout.addNewExercise).toHaveBeenCalledWith(1, "A", expect.objectContaining({ name: "Bench Press" })),
    )
    expect(screen.queryByText("Exercise Matched!")).toBeNull()
  })

  it("fills in the muscles of a known exercise and keeps them under Advanced", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    await press("Add exercise")
    await fireEvent.changeText(await screen.findByLabelText("Exercise name, required"), "bench press")
    await waitFor(() => expect(screen.queryByText("No muscles set")).toBeNull())
    expect(screen.getByRole("button", { name: "Advanced: muscles worked" })).toBeTruthy()
    await fireEvent.changeText(screen.getByLabelText("Number of sets, required"), "3")
    const buttons = await screen.findAllByRole("button", { name: "Add exercise" })
    await fireEvent.press(buttons[buttons.length - 1])

    await waitFor(() =>
      expect(current.workout.addNewExercise).toHaveBeenCalledWith(
        1,
        "A",
        expect.objectContaining({ name: "Bench Press", primaryMuscles: ["chest"] }),
      ),
    )
  })
})

describe("editing an exercise", () => {
  it("shows only the browsed muscle's exercises, not the swap suggestions too", async () => {
    await renderWithProviders(<WorkoutScreen />, withProgram())

    fireEvent.press((await screen.findAllByRole("button", { name: "Rename exercise" }))[0])
    expect(await screen.findByText(/Swap for similar exercise/)).toBeTruthy()

    fireEvent.press(screen.getByRole("radio", { name: "Chest exercises" }))

    expect(await screen.findByText("Chest exercises:")).toBeTruthy()
    expect(screen.queryByText(/Swap for similar exercise/)).toBeNull()
  })
})

describe("joint session", () => {
  it("leaves only after the user confirms", async () => {
    await renderWithProviders(<WorkoutScreen />, { ...withProgram(), jointSession: { isInJointSession: true } })

    await press("Leave joint session")
    expect(await screen.findByText("Leave joint session?")).toBeTruthy()
    expect(current.jointSession.leaveJointSession).not.toHaveBeenCalled()
    await press("Leave")

    await waitFor(() => expect(current.jointSession.leaveJointSession).toHaveBeenCalledTimes(1))
  })
})

describe("session stats layout", () => {
  it("lets long exercise names shrink so they truncate instead of overflowing the screen", () => {
    const { makeStyles } = require("../WorkoutScreen")
    const { LIGHT_COLORS } = jest.requireActual("@shared/context/ThemeContext")
    const styles = makeStyles(LIGHT_COLORS)
    expect(styles.currentRestLabel.flexShrink).toBe(1)
    expect(styles.sessionStat.flexShrink).toBe(1)
  })
})
