jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(),
}))

import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { ApiError } from "@shared/services/apiClient"
import { program } from "test-utils/fixtures"
import { programApi } from "../program"

const http = authenticatedFetch as jest.Mock

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const lastCall = () => {
  const [url, init] = http.mock.calls.at(-1) as [string, RequestInit | undefined]
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined }
}

beforeEach(() => {
  http.mockReset()
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

describe("request shapes", () => {
  it("uploads the whole program under weeklyPlan, the field the server reads", async () => {
    http.mockImplementation(async () => respond({ success: true }))

    await programApi.saveProgram(program)

    expect(lastCall()).toEqual({
      url: "/api/program/upload",
      method: "POST",
      body: { weeklyPlan: program, originalFilename: "template-update" },
    })
  })

  it("patches only the machine fields so a trainer edit isn't refused by the whole-program route", async () => {
    http.mockImplementation(async () => respond({ success: true }))

    await programApi.updateExerciseMachines(1, "A", 0, { selectedMachine: null })

    expect(lastCall()).toEqual({
      url: "/api/program/exercise/machine",
      method: "PATCH",
      body: { dayNumber: 1, split: "A", exerciseIndex: 0, patch: { selectedMachine: null } },
    })
  })

  it("sends an explicit null exercise id so a rename can unlink the database entry", async () => {
    http.mockImplementation(async () => respond({ success: true }))

    await programApi.renameExercise(1, "A", 0, "Custom", undefined, undefined, null)

    expect(lastCall().body).toEqual({ dayNumber: 1, split: "A", exerciseIndex: 0, newName: "Custom", newExerciseId: null })
  })

  it("adds sets and exercises with the day and split the server looks up", async () => {
    http.mockImplementation(async () => respond({ success: true }))

    await programApi.patchExerciseSets(2, "B", 1, -1)
    expect(lastCall()).toEqual({
      url: "/api/program/exercise/sets",
      method: "PATCH",
      body: { dayNumber: 2, split: "B", exerciseIndex: 1, additionalSets: -1 },
    })

    const exercise = { name: "Dip", sets: 3, primaryMuscles: ["chest"] }
    await programApi.addExercise(2, "B", exercise as never)
    expect(lastCall()).toEqual({ url: "/api/program/exercise/add", method: "PATCH", body: { dayNumber: 2, split: "B", exercise } })
  })

  it("stores the current day on the server so a second device follows it", async () => {
    http.mockImplementation(async () => respond({ currentDay: 3 }))
    expect(await programApi.getCurrentDay()).toBe(3)

    await programApi.setCurrentDay(4)
    expect(lastCall()).toEqual({ url: "/api/program/current-day", method: "PUT", body: { currentDay: 4 } })
  })
})

describe("error handling", () => {
  it.each([401, 403, 429, 500])("rejects a %i on upload so the program stays marked dirty", async (status) => {
    http.mockImplementation(async () => respond({ error: "refused" }, status))

    await expect(programApi.saveProgram(program)).rejects.toBeInstanceOf(ApiError)
  })

  it("rejects a network failure on delete instead of reporting the program gone", async () => {
    http.mockRejectedValue(new TypeError("Network request failed"))

    await expect(programApi.deleteProgram()).rejects.toThrow("Network request failed")
  })

  it.each([
    ["a 404", () => http.mockImplementation(async () => respond({}, 404))],
    ["a 500", () => http.mockImplementation(async () => respond({ error: "db down" }, 500))],
    ["a network failure", () => http.mockRejectedValue(new TypeError("Network request failed"))],
  ])("reads no program on %s so sync keeps the local copy", async (_label, arrange) => {
    arrange()

    expect(await programApi.fetchSavedProgram()).toBeNull()
  })

  it("lets an expired session through the program fetch so the user is sent to login", async () => {
    http.mockRejectedValue(new Error("SESSION_EXPIRED"))

    await expect(programApi.fetchSavedProgram()).rejects.toThrow("SESSION_EXPIRED")
    await expect(programApi.getCurrentDay()).rejects.toThrow("SESSION_EXPIRED")
  })

  it("falls back to the device's day when the server has no day pointer", async () => {
    http.mockImplementation(async () => respond({}, 404))
    expect(await programApi.getCurrentDay()).toBeNull()

    http.mockImplementation(async () => respond({ error: "boom" }, 503))
    expect(await programApi.getCurrentDay()).toBeNull()
  })
})
