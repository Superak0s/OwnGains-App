jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(async () => new Response(null, { status: 200 })),
  routeOf: jest.requireActual("@shared/services/authenticatedFetch").routeOf,
}));

import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import { traineeFetch } from "../traineeFetch";

const mockFetch = authenticatedFetch as jest.MockedFunction<
  typeof authenticatedFetch
>;

describe("traineeFetch", () => {
  beforeEach(() => mockFetch.mockClear());

  it("attaches the trainee id header", async () => {
    await traineeFetch("42")("/api/sessions");
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions", {
      headers: { "X-Trainee-Id": "42" },
    });
  });

  it("preserves caller options and headers", async () => {
    await traineeFetch("42")("/api/sessions/start", {
      method: "POST",
      body: "{}",
      headers: { "Content-Type": "application/json" },
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/sessions/start", {
      method: "POST",
      body: "{}",
      headers: {
        "Content-Type": "application/json",
        "X-Trainee-Id": "42",
      },
    });
  });

  it("does not let a caller header override the trainee id", async () => {
    await traineeFetch("42")("/api/program", {
      headers: { "X-Trainee-Id": "99" },
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/program", {
      headers: { "X-Trainee-Id": "42" },
    });
  });

  it.each([
    ["/api/sessions/demo"],
    ["/api/sessions/split/Push"],
    ["/api/program"],
    ["/api/sessions/42"],
  ])("refuses to DELETE %s", async (url) => {
    await expect(traineeFetch("42")(url, { method: "DELETE" })).rejects.toThrow(
      "must not delete a trainee's data",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each([
    "/api/auth/account/data",
    "/api/auth/login",
    "https://owngains.example.com/api/auth/account/data?x=1",
  ])("refuses to retarget the auth route %s", async (url) => {
    await expect(traineeFetch("42")(url)).rejects.toThrow(
      "must not target an auth route",
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
