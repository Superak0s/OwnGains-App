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

describe("current day", () => {
  it("has no server pointer offline so the device's stored day wins", async () => {
    expect(await programApi.getCurrentDay()).toBeNull()
    await expect(programApi.setCurrentDay()).resolves.toBeUndefined()
  })
})
