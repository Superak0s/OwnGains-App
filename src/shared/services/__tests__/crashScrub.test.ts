jest.mock("../sqliteStorage", () => ({
  getStorageItemSync: () => null,
  setStorageItem: jest.fn(),
  setStorageErrorHandler: jest.fn(),
}));

jest.mock("@sentry/react-native", () => ({
  reactNavigationIntegration: jest.fn(),
  wrap: jest.fn(),
}));

import { scrubEvent, scrubLog, scrubSpans, scrubTransaction } from "../crashReporting";
import { ApiError } from "../apiError";

const exceptionEvent = (value: string) => ({
  exception: { values: [{ type: "Error", value }] },
});

describe("scrubEvent", () => {
  it("replaces a server error message with its status and code", () => {
    const error = new ApiError("Bench Press note: sore shoulder", 409, null, "SESSION_ALREADY_ENDED");

    const event = scrubEvent(exceptionEvent(error.message), { originalException: error });

    expect(event.exception?.values?.[0].value).toBe("HTTP 409 SESSION_ALREADY_ENDED");
  });

  it("omits the code when the server sent none", () => {
    const error = new ApiError("User alice not found", 404);

    const event = scrubEvent(exceptionEvent(error.message), { originalException: error });

    expect(event.exception?.values?.[0].value).toBe("HTTP 404");
  });

  it("keeps the message of an app-side error", () => {
    const event = scrubEvent(exceptionEvent("Notifications unavailable"), {
      originalException: new Error("Notifications unavailable"),
    });

    expect(event.exception?.values?.[0].value).toBe("Notifications unavailable");
  });

  it.each([
    ['JSON Parse error: Unexpected identifier "Bench"', "JSON Parse error: Unexpected identifier <redacted>"],
    ["Failed to sync set for alice@example.com", "Failed to sync set for <email>"],
    ["Cannot reach http://192.168.1.20:3000/api", "Cannot reach <url>"],
    ["Session 48213 not found", "Session <n> not found"],
  ])("redacts user data from an app-side error: %s", (message, expected) => {
    const event = scrubEvent(exceptionEvent(message), { originalException: new Error(message) });

    expect(event.exception?.values?.[0].value).toBe(expected);
  });

  it("caps a long app-side message", () => {
    const event = scrubEvent(exceptionEvent("x".repeat(500)));

    expect(event.exception?.values?.[0].value).toHaveLength(200);
  });

  it("drops extra keys outside the allow-list and truncates long values", () => {
    const event = scrubEvent({
      extra: { stage: "x".repeat(300), exerciseName: "Bench Press", op: 3 },
    });

    expect(event.extra).toEqual({ stage: "x".repeat(100), op: 3 });
  });

  it("keeps error-boundary and sync diagnostics, with a longer cap on the component stack", () => {
    const event = scrubEvent({
      extra: {
        componentStack: "c".repeat(3000),
        boundary: "screen",
        type: "recordSet",
        depth: 4,
        attempts: 2,
      },
    });

    expect(event.extra).toEqual({
      componentStack: "c".repeat(2000),
      boundary: "screen",
      type: "recordSet",
      depth: 4,
      attempts: 2,
    });
  });

  it("nulls the IP address", () => {
    expect(scrubEvent({ user: { id: "7" } }).user).toEqual({ id: "7", ip_address: null });
  });
});

const span = (overrides: Record<string, unknown> = {}) =>
  ({ span_id: "a", trace_id: "b", start_timestamp: 1, data: {}, ...overrides });

describe("scrubSpans", () => {
  it("reduces a fetch span URL to a host-less path with ids masked", () => {
    const scrubbed = scrubSpans([
      span({
        data: { url: "https://owngains.example.com/api/workouts/12345/sets?from=1", "http.method": "GET" },
      }),
    ]);

    expect(scrubbed?.[0].data.url).toBe("/api/workouts/{id}/sets");
    expect(scrubbed?.[0].data["http.method"]).toBe("GET");
  });

  it("templates a span description that is a URL and leaves other descriptions alone", () => {
    const scrubbed = scrubSpans([
      span({ description: "https://owngains.example.com/api/friends/9?scope=all" }),
      span({ description: "navigation" }),
    ]);

    expect(scrubbed?.[0].description).toBe("/api/friends/{id}");
    expect(scrubbed?.[1].description).toBe("navigation");
  });

  it("masks split and muscle names", () => {
    const scrubbed = scrubSpans([
      span({ description: "https://owngains.example.com/api/sessions/split/Push%20Day" }),
      span({ description: "https://owngains.example.com/api/tracking/photos/muscle/group/Chest" }),
    ]);

    expect(scrubbed?.[0].description).toBe("/api/sessions/split/{name}");
    expect(scrubbed?.[1].description).toBe("/api/tracking/photos/muscle/group/{name}");
  });

  it("returns undefined when there are no spans", () => {
    expect(scrubSpans(undefined)).toBeUndefined();
  });

  it("drops the host, query and fragment from spans and the transaction's trace", () => {
    const leaky = {
      "server.address": "owngains.example.com",
      "http.query": "?q=bench",
      "url.query": "q=bench",
      "http.fragment": "#x",
      "http.method": "GET",
    };
    const event = scrubTransaction({
      type: "transaction",
      spans: [span({ data: leaky })],
      contexts: { trace: { trace_id: "t", span_id: "s", data: leaky } },
    });

    expect(event.spans?.[0].data).toEqual({ "http.method": "GET" });
    expect(event.contexts?.trace?.data).toEqual({ "http.method": "GET" });
  });
});

describe("scrubLog", () => {
  it("redacts user content echoed in the message and string attributes", () => {
    const scrubbed = scrubLog({
      message: 'save failed for "My Secret Split"',
      attributes: { reason: "Split 'Leg Day' not found", status: 404 },
    });

    expect(scrubbed.message).toBe("save failed for <redacted>");
    expect(scrubbed.attributes).toEqual({ reason: "Split <redacted> not found", status: 404 });
  });
});
