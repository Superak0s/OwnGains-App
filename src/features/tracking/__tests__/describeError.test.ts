import { describeError } from "../helpers"
import { ApiError } from "@shared/services/apiClient"

describe("describeError", () => {
  it("prefers the server's error code over its prose", () => {
    const err = new ApiError("Value out of range for its field", 400, null, "VALUE_OUT_OF_RANGE")
    expect(describeError(err)).toBe("That number is too large for this field.")
  })

  it("still sniffs the message when no code was sent", () => {
    expect(describeError(new Error("network request failed"))).toMatch(/connection/i)
    expect(describeError(new ApiError("takenAt cannot be in the future", 400)))
      .toBe("takenAt cannot be in the future")
  })
})
