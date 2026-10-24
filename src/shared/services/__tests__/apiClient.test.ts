jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

import { ApiError, isCredentialRejection, parseApiResponse } from "../apiClient"

describe("isCredentialRejection", () => {
  it.each([400, 401, 403, 404])("treats %i as a refusal", (status) => {
    expect(isCredentialRejection(new ApiError("x", status))).toBe(true)
  })

  it.each([408, 429, 500, 502, 503])("does not treat %i as a refusal", (status) => {
    expect(isCredentialRejection(new ApiError("x", status))).toBe(false)
  })

  it("does not treat a transport error as a refusal", () => {
    expect(isCredentialRejection(new TypeError("Network request failed"))).toBe(false)
  })
})

describe("parseApiResponse", () => {
  it("returns server datetimes as UTC ISO", async () => {
    const res = {
      ok: true,
      status: 200,
      json: async () => ({ data: { startTime: "2026-10-25 23:00:00" } }),
    } as unknown as Response
    await expect(parseApiResponse(res)).resolves.toEqual({
      data: { startTime: "2026-10-25T23:00:00Z" },
    })
  })
})
