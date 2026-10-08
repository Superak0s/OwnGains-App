jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@features/plan/services/index", () => ({
  programApi: { saveProgram: jest.fn(async () => ({ success: true })) },
}))
jest.mock("@features/workout/services/index", () => ({
  workoutApi: { pickWorkoutFile: jest.fn() },
}))
jest.mock("@utils/clientWorkoutParser", () => ({
  extractSplitColumnCandidates: jest.fn(),
  parseWorkoutFileClient: jest.fn(),
}))
jest.mock("@shared/services/programDirty", () => ({
  markProgramDirty: jest.fn(async () => true),
}))

import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { program, noPlanSelected, programWithEmptyDay } from "test-utils/fixtures"
import type { WorkoutData } from "@shared/types"
import { programApi } from "@features/plan/services/index"
import { workoutApi } from "@features/workout/services/index"
import { extractSplitColumnCandidates, parseWorkoutFileClient } from "@utils/clientWorkoutParser"
import { markProgramDirty } from "@shared/services/programDirty"
import PlanScreen from "../PlanScreen"

const saveProgram = programApi.saveProgram as jest.Mock
const pickFile = workoutApi.pickWorkoutFile as jest.Mock
const extractColumns = extractSplitColumnCandidates as jest.Mock
const parseFile = parseWorkoutFileClient as jest.Mock

const ex = (name: string, exerciseId: string, a: number, b: number) => ({
  name,
  exerciseId,
  primaryMuscles: ["chest"],
  secondaryMuscles: [],
  setsBySplit: { A: a, B: b },
  reps: "8-12",
})

// The shared fixture only fills `split.*.exercises`, but day cards and the
// split editor read the per-day `exercises` list with `setsBySplit`.
const editableProgram: WorkoutData = {
  split: ["A", "B"],
  totalDays: 2,
  days: [
    {
      dayNumber: 1,
      dayTitle: "Push",
      exercises: [ex("Squat", "custom", 3, 0), ex("Deadlift", "custom", 2, 0)],
      split: { A: { exercises: [], totalSets: 5 } },
    },
    {
      dayNumber: 2,
      dayTitle: "Pull",
      exercises: [ex("Lunge", "custom", 4, 3)],
      split: { A: { exercises: [], totalSets: 4 } },
    },
  ],
}

const press = async (label: string | RegExp) => fireEvent.press(await screen.findByRole("button", { name: label }))

const lastSaved = (): WorkoutData => {
  const save = current.workout.saveWorkoutData as jest.Mock
  return save.mock.calls.at(-1)[0]
}

const openEditor = async () => {
  await renderWithProviders(<PlanScreen />, { workout: { workoutData: editableProgram, selectedSplit: "A" } })
  ;(current.workout.saveWorkoutData as jest.Mock).mockClear()
  saveProgram.mockClear()
  await press("Edit a split")
  await press("A")
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(console, "error").mockImplementation(() => {})
})

describe("mounting with edge-case data", () => {
  it("opens with no program without uploading anything", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: null } })

    expect(await screen.findByText("Start from a template, build your own, or import a spreadsheet.")).toBeTruthy()
    expect(saveProgram).not.toHaveBeenCalled()
  })

  it("opens with a program but no split selected", async () => {
    await renderWithProviders(<PlanScreen />, { workout: noPlanSelected })

    expect(await screen.findByText("2 days ready. Pick a split to train.")).toBeTruthy()
  })

  it("opens a program whose split day has no exercises", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: programWithEmptyDay, selectedSplit: "A" } })

    expect(await screen.findByText("Rest")).toBeTruthy()
  })

  it("links unmatched exercises on open and uploads the result once", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: program, selectedSplit: "A" } })

    await waitFor(() => expect(saveProgram).toHaveBeenCalledTimes(1))
    expect(current.workout.saveWorkoutData).toHaveBeenCalledWith(saveProgram.mock.calls[0][0])
  })

  it("marks the program dirty when the open-time upload fails so the next sync pushes it", async () => {
    saveProgram.mockRejectedValueOnce(new TypeError("Network request failed"))

    await renderWithProviders(<PlanScreen />, { workout: { workoutData: program, selectedSplit: "A" } })

    await waitFor(() => expect(markProgramDirty).toHaveBeenCalledWith("u1"))
  })
})

describe("editing a split", () => {
  it("removes one exercise from a split day and keeps the rest of the day", async () => {
    await openEditor()
    await press(/^Expand Push/)
    await press("Remove Deadlift")
    await press("Remove")
    await press("Save changes")

    await waitFor(() => expect(saveProgram).toHaveBeenCalled())
    const push = lastSaved().days.find((d) => d.dayTitle === "Push")!
    expect(push.split.A.exercises.map((e) => e.name)).toEqual(["Squat"])
    expect(push.exercises?.find((e) => e.name === "Deadlift")?.setsBySplit?.A).toBe(0)
  })

  it("keeps the exercise when the remove prompt is cancelled", async () => {
    await openEditor()
    await press(/^Expand Push/)
    await press("Remove Deadlift")
    await press("Keep it")
    await press("Save changes")

    await waitFor(() => expect(saveProgram).toHaveBeenCalled())
    const push = lastSaved().days.find((d) => d.dayTitle === "Push")!
    expect(push.split.A.exercises.map((e) => e.name)).toEqual(["Squat", "Deadlift"])
  })

  it("drops a whole day that no other split uses, and keeps a day another split still trains", async () => {
    await openEditor()
    await press(/^Expand Push/)
    await press("Remove Push")
    await press("Remove")
    await press(/^Expand Pull/)
    await press("Save changes")

    await waitFor(() => expect(saveProgram).toHaveBeenCalled())
    expect(lastSaved().days.map((d) => d.dayTitle)).toEqual(["Pull"])
  })

  it("saves a renamed day title", async () => {
    await openEditor()
    await press(/^Expand Pull/)
    await fireEvent.changeText(screen.getByDisplayValue("Pull"), "Back")
    await press("Save changes")

    await waitFor(() => expect(saveProgram).toHaveBeenCalled())
    expect(lastSaved().days.map((d) => d.dayTitle)).toEqual(["Push", "Back"])
  })

  it("keeps the edit on the device and says so when the server upload fails", async () => {
    await openEditor()
    saveProgram.mockRejectedValueOnce(new Error("HTTP 503"))
    await press("Save changes")

    expect(await screen.findByText("Saved on this device")).toBeTruthy()
    expect(current.workout.saveWorkoutData).toHaveBeenCalled()
    expect(markProgramDirty).toHaveBeenCalledWith("u1")
  })
})

describe("importing a program file", () => {
  it("tells the user a file has no usable columns and saves nothing", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: null } })
    pickFile.mockResolvedValue("file:///cache/garbage.xlsx")
    extractColumns.mockResolvedValue([])

    await press("Import a workout from a spreadsheet file")

    expect(await screen.findByText("No columns found")).toBeTruthy()
    expect(current.workout.saveWorkoutData).not.toHaveBeenCalled()
  })

  it("shows the read error for an unreadable file", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: null } })
    pickFile.mockResolvedValue("file:///cache/broken.ods")
    extractColumns.mockRejectedValue(new Error("Unsupported file format"))

    await press("Import a workout from a spreadsheet file")

    expect(await screen.findByText("Unsupported file format")).toBeTruthy()
  })

  it("leaves the current program untouched when the chosen columns fail to parse", async () => {
    await renderWithProviders(<PlanScreen />, { workout: { workoutData: null } })
    pickFile.mockResolvedValue("file:///cache/plan.xlsx")
    extractColumns.mockResolvedValue([{ index: 2, name: "Week 1", autoSelected: true }])
    parseFile.mockRejectedValue(new Error("No exercises found in the selected columns"))

    await press("Import a workout from a spreadsheet file")
    await fireEvent.press(await screen.findByText("Import 1 split"))

    expect(await screen.findByText("Couldn't import that file")).toBeTruthy()
    expect(current.workout.saveWorkoutData).not.toHaveBeenCalled()
    expect(saveProgram).not.toHaveBeenCalled()
  })
})
