jest.mock("@shared/services/authenticatedFetch", () => ({ authenticatedFetch: jest.fn() }))
jest.mock("@shared/services/appMode", () => ({ isServerless: jest.fn(async () => false) }))

import { authenticatedFetch } from "@shared/services/authenticatedFetch"
import { isServerless } from "@shared/services/appMode"
import { OFFLINE_UNAVAILABLE_MESSAGE } from "@shared/services/dispatchProxy"
import { trainerApi as trainerOn } from "../on/trainer"
import { trainerApi } from "../index"
import { TrainerRequestConflictError } from "../../types"

const mockFetch = authenticatedFetch as jest.Mock

const respond = (status: number, body: unknown = { success: true }) =>
  ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    headers: { get: () => null },
  }) as unknown as Response

const lastCall = () => {
  const [url, init] = mockFetch.mock.calls.at(-1) as [string, { method?: string; body?: string } | undefined]
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body) : undefined }
}

beforeEach(() => {
  mockFetch.mockReset()
  mockFetch.mockResolvedValue(respond(200, { success: true, data: { clients: [], requests: [] } }))
  ;(isServerless as jest.Mock).mockResolvedValue(false)
})

describe("trainer calls match the server contract", () => {
  const cases: Array<[string, () => Promise<unknown>, string, string, unknown]> = [
    ["the client roster for a week", () => trainerOn.getClients(new Date(2026, 9, 12)), "GET", `/api/trainer/clients?${new URLSearchParams({ weekStart: "2026-10-12", weekStartAt: new Date(2026, 9, 12).toISOString() })}`, undefined],
    ["a request by username", () => trainerOn.sendRequest({ username: "maria" }, false), "POST", "/api/trainer/requests", { toUsername: "maria", includeTracking: false }],
    ["a request by user id", () => trainerOn.sendRequest({ userId: "42" }, true), "POST", "/api/trainer/requests", { toUserId: "42", includeTracking: true }],
    ["accepting a request", () => trainerOn.acceptRequest("9", false), "POST", "/api/trainer/requests/9/accept", { includeTracking: false }],
    ["rejecting a request", () => trainerOn.rejectRequest("9"), "POST", "/api/trainer/requests/9/reject", undefined],
    ["received requests", () => trainerOn.getReceivedRequests(), "GET", "/api/trainer/requests/received", undefined],
    ["sent requests", () => trainerOn.getSentRequests(), "GET", "/api/trainer/requests/sent", undefined],
  ]

  it.each(cases)("sends %s to the route the server answers", async (_name, call, method, url, body) => {
    await call()
    expect(lastCall()).toEqual({ url, method, body })
  })

  it("returns the clients from the data envelope", async () => {
    const client = { userId: "7", username: "maria", lastWorkoutAt: null, sessionsThisWeek: 0, activeProgramDayCount: 3 }
    mockFetch.mockResolvedValue(respond(200, { success: true, data: { clients: [client] } }))
    await expect(trainerOn.getClients(new Date(2026, 9, 12))).resolves.toEqual([client])
  })
})

describe("trainer errors", () => {
  it("turns a duplicate request into a conflict the screen can explain", async () => {
    mockFetch.mockResolvedValue(respond(409, { error: "Exists" }))
    await expect(trainerOn.sendRequest({ userId: "7" }, false)).rejects.toBeInstanceOf(TrainerRequestConflictError)
  })

  it("never reaches the network in offline mode", async () => {
    ;(isServerless as jest.Mock).mockResolvedValue(true)
    await expect(trainerApi.getClients(new Date(2026, 9, 12))).rejects.toThrow(OFFLINE_UNAVAILABLE_MESSAGE)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
