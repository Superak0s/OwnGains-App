import { ApiError, userFacingError } from "../apiError";

describe("userFacingError", () => {
  it("shows a 4xx server message as-is", () => {
    expect(userFacingError(new ApiError("Split name taken", 409), "fallback")).toBe(
      "Split name taken",
    );
  });

  it("hides 5xx detail behind plain wording", () => {
    expect(userFacingError(new ApiError("ER_LOCK_DEADLOCK", 500), "fallback")).toBe(
      "The server had a problem. Try again in a moment.",
    );
  });

  it("turns a transport failure into a connection message", () => {
    expect(userFacingError(new TypeError("Network request failed"), "fallback")).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    );
  });

  it("falls back for anything else", () => {
    expect(userFacingError(new Error("Cannot read properties of undefined"), "fallback")).toBe(
      "fallback",
    );
    expect(userFacingError("boom", "fallback")).toBe("fallback");
  });
});
