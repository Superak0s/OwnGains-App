const kv: Record<string, string> = {}

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(async (k: string) => kv[k] ?? null),
  getStorageItems: jest.fn(async () => ({})),
  setStorageItem: jest.fn(async (k: string, v: string) => {
    kv[k] = v
  }),
  removeStorageItem: jest.fn(async (k: string) => {
    delete kv[k]
  }),
  removeStorageItems: jest.fn(async () => {}),
}))

import * as sqlite from "@shared/services/sqliteStorage"
import { STORAGE_KEYS } from "@shared/services/storage"
import { programApi } from "../program"
import type { WorkoutData } from "@shared/types"

const program: WorkoutData = {
  split: ["A"],
  days: [
    {
      dayNumber: 1,
      dayTitle: "Day 1",
      primaryMuscles: ["Chest"],
      exercises: [],
      split: {
        A: {
          totalSets: 6,
          exercises: [{ name: "Bench Press", primaryMuscles: ["Chest"], sets: 3 }],
        },
      },
    },
  ],
} as unknown as WorkoutData

const saved = () => JSON.parse(kv[STORAGE_KEYS.WORKOUT_DATA])

beforeEach(async () => {
  for (const k of Object.keys(kv)) delete kv[k]
  jest.clearAllMocks()
  await programApi.saveProgram(program)
})

describe("saveProgram / fetchSavedProgram / deleteProgram", () => {
  it("stores the plan with a day count and split list, without response fields", async () => {
    expect(saved()).toMatchObject({ totalDays: 1, split: ["A"] })
    expect(saved()).not.toHaveProperty("success")
    expect(await programApi.fetchSavedProgram()).toMatchObject({ totalDays: 1 })
  })

  it("defaults a missing split list to empty", async () => {
    await programApi.saveProgram({ days: [] } as unknown as WorkoutData)
    expect(saved().split).toEqual([])
  })

  it("returns null when nothing is stored", async () => {
    await programApi.deleteProgram()
    expect(await programApi.fetchSavedProgram()).toBeNull()
  })

  it("rethrows when the underlying write fails", async () => {
    ;(sqlite.setStorageItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    )
    const spies = [
      jest.spyOn(console, "error").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
    ]
    await expect(programApi.saveProgram(program)).rejects.toThrow(
      "Failed to save program to storage",
    )
    spies.forEach((s) => s.mockRestore())
  })
})

describe("renameExercise", () => {
  it("renames in place and can also set the muscle group", async () => {
    await programApi.renameExercise(1, "A", 0, "Incline Press", ["Upper Chest"])
    expect(saved().days[0].split.A.exercises[0]).toEqual({
      name: "Incline Press",
      primaryMuscles: ["Upper Chest"],
      sets: 3,
    })
  })

  it("leaves the muscle group untouched when it is omitted", async () => {
    await programApi.renameExercise(1, "A", 0, "Incline Press")
    expect(saved().days[0].split.A.exercises[0].primaryMuscles).toEqual(["Chest"])
  })

  // Throws rather than resolving null: the online twin rejects, and a caller
  // that only checks for a rejection treated null as a successful save.
  it("throws for an unknown program, day, split or exercise index", async () => {
    await expect(programApi.renameExercise(9, "A", 0, "x")).rejects.toThrow(
      "Day 9 not found",
    )
    await expect(programApi.renameExercise(1, "Z", 0, "x")).rejects.toThrow(
      "not found",
    )
    await expect(programApi.renameExercise(1, "A", 9, "x")).rejects.toThrow(
      "Exercise 9 not found",
    )

    await programApi.deleteProgram()
    await expect(programApi.renameExercise(1, "A", 0, "x")).rejects.toThrow(
      "No saved program",
    )
  })
})

describe("addExercise", () => {
  it("appends to the split's exercise list", async () => {
    await programApi.addExercise(1, "A", {
      name: "Cable Fly",
      primaryMuscles: ["Chest"],
      sets: 3,
    })
    expect(saved().days[0].split.A.exercises).toHaveLength(2)
  })

  it("creates the exercise list when the split has none", async () => {
    kv[STORAGE_KEYS.WORKOUT_DATA] = JSON.stringify({
      success: true,
      totalDays: 1,
      split: ["A"],
      days: [{ dayNumber: 1, split: { A: { totalSets: 0 } } }],
    })
    await programApi.addExercise(1, "A", {
      name: "Cable Fly",
      primaryMuscles: ["Chest"],
      sets: 3,
    })
    expect(saved().days[0].split.A.exercises).toHaveLength(1)
  })

  it("throws for an unknown day or split", async () => {
    const payload = { name: "x", primaryMuscles: ["y"], sets: 1 }
    await expect(programApi.addExercise(9, "A", payload)).rejects.toThrow(
      "Day 9 not found",
    )
    await expect(programApi.addExercise(1, "Z", payload)).rejects.toThrow(
      "not found",
    )
  })
})

describe("patchExerciseSets", () => {
  it("adds to the existing set count", async () => {
    await programApi.patchExerciseSets(1, "A", 0, 2)
    expect(saved().days[0].split.A.exercises[0].sets).toBe(5)
  })

  it("throws for an unknown day, split or exercise index", async () => {
    await expect(programApi.patchExerciseSets(9, "A", 0, 1)).rejects.toThrow(
      "Day 9 not found",
    )
    await expect(programApi.patchExerciseSets(1, "Z", 0, 1)).rejects.toThrow(
      "not found",
    )
    await expect(programApi.patchExerciseSets(1, "A", 9, 1)).rejects.toThrow(
      "Exercise 9 not found",
    )
  })

  it("rethrows a write failure", async () => {
    ;(sqlite.setStorageItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    )
    const spies = [
      jest.spyOn(console, "error").mockImplementation(() => {}),
      jest.spyOn(console, "warn").mockImplementation(() => {}),
    ]
    await expect(programApi.patchExerciseSets(1, "A", 0, 2)).rejects.toThrow(
      "Failed to save program to storage",
    )
    spies.forEach((s) => s.mockRestore())
  })
})

describe("updateExerciseMachines", () => {
  it("clears the selected machine on null instead of storing a null the picker can't read", async () => {
    await programApi.updateExerciseMachines(1, "A", 0, { selectedMachine: "Smith", defaultMachine: "Rack" })
    await programApi.updateExerciseMachines(1, "A", 0, { selectedMachine: null })

    const exercise = saved().days[0].split.A.exercises[0]
    expect(exercise).not.toHaveProperty("selectedMachine")
    expect(exercise.defaultMachine).toBe("Rack")
  })

  it("throws for an unknown exercise like the server's 404", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    await expect(programApi.updateExerciseMachines(1, "A", 9, { selectedMachine: null })).rejects.toThrow("Exercise 9 not found")
  })
})

describe("current day", () => {
  it("has no server pointer offline so the device's stored day wins", async () => {
    expect(await programApi.getCurrentDay()).toBeNull()
    await expect(programApi.setCurrentDay()).resolves.toBeUndefined()
  })
})
