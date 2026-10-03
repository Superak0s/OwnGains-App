jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn().mockResolvedValue(null),
  getStorageItemSync: jest.fn(() => null),
  setStorageItem: jest.fn().mockResolvedValue(undefined),
  setStorageErrorHandler: jest.fn(),
}))

import { ApiError, isCredentialRejection } from "../apiClient"

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
