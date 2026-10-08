const mockHttp = jest.fn()
jest.mock("@shared/services/authenticatedFetch", () => ({ authenticatedFetch: mockHttp }))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@utils/compressImage", () => ({ compressImageForUpload: async (uri: string) => uri }))

import { resetMemorySqlite } from "test-utils/memorySqlite"

const json = (body: unknown) =>
  ({ status: 200, ok: true, json: async () => body, headers: { get: () => null } }) as unknown as Response

const nonHealthCalls = () => mockHttp.mock.calls.map(([url]) => url as string).filter((url) => url !== "/healthz")

const callEveryMethod = async () => {
  const services = require("../index") as Record<string, unknown>
  for (const service of Object.values(services)) {
    const methods = typeof service === "function" ? [service] : Object.values(service as object)
    for (const method of methods) {
      if (typeof method !== "function") continue
      try {
        await method(1, "kg", null, null)
      } catch {
        // Bad arguments may make the on-device store reject. Only the network matters here.
      }
    }
  }
}

let globalFetch: jest.SpyInstance

beforeEach(() => {
  jest.resetModules()
  resetMemorySqlite()
  mockHttp.mockReset()
  Object.defineProperty(require("react-native").AppState, "currentState", { value: "active", configurable: true })
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
  globalFetch = jest.spyOn(global, "fetch").mockRejectedValue(new Error("network used"))
})

afterEach(() => jest.restoreAllMocks())

it("keeps every tracking call on the phone when the server lists tracking as local-only", async () => {
  mockHttp.mockImplementation(async (url: string) =>
    json(url === "/healthz" ? { localOnlyFeatures: ["tracking"] } : { success: true, data: [] }),
  )
  await callEveryMethod()
  expect(mockHttp).toHaveBeenCalledWith("/healthz", undefined)
  expect(nonHealthCalls()).toEqual([])
  expect(globalFetch).not.toHaveBeenCalled()
})

it("sends no health data on a first launch while the server's local-only list is still unknown", async () => {
  mockHttp.mockImplementation(async (url: string) => {
    if (url === "/healthz") throw new Error("unreachable")
    return json({ success: true, data: [] })
  })
  await callEveryMethod()
  expect(mockHttp).toHaveBeenCalledWith("/healthz", undefined)
  expect(nonHealthCalls()).toEqual([])
})

it("uses the server for tracking once it says it stores it", async () => {
  mockHttp.mockImplementation(async (url: string) =>
    json(url === "/healthz" ? { localOnlyFeatures: [] } : { success: true, data: [] }),
  )
  const { injuryApi } = require("../index")
  await injuryApi.getAllInjuries()
  expect(nonHealthCalls()).toEqual(["/api/tracking/injuries"])
})
