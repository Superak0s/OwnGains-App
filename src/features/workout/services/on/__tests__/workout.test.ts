jest.mock("@shared/services/authenticatedFetch", () => ({
  authenticatedFetch: jest.fn(),
}));

import { authenticatedFetch } from "@shared/services/authenticatedFetch";
import { ApiError, isCredentialRejection } from "@shared/services/apiClient";
import { workoutApi } from "../workout";

const http = authenticatedFetch as jest.Mock;

const respond = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const set = {
  exerciseName: "Bench Press",
  setIndex: 0,
  startTime: "2026-10-01T10:00:00.000Z",
  endTime: "2026-10-01T10:01:00.000Z",
  weight: 80,
  reps: 8,
};

const lastCall = () => {
  const [url, init] = http.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined };
};

beforeEach(() => http.mockReset());

describe("request shapes", () => {
  it("records a set with the defaults the server's NOT NULL columns need", async () => {
    http.mockImplementation(async () => respond({ timing: { id: 5, ...set } }));

    await workoutApi.recordSet(12, { ...set, rir: 2, machineName: "Smith" });

    expect(lastCall()).toEqual({
      url: "/api/sessions/12/set",
      method: "POST",
      body: { ...set, rir: 2, machineName: "Smith", note: "", isWarmup: false, primaryMuscles: [], secondaryMuscles: [] },
    });
  });

  it("edits a set by its server id, not its set index", async () => {
    http.mockImplementation(async () => respond({ timing: { id: 5, ...set, weight: "85.00" } }));

    const timing = await workoutApi.updateSet(12, 5, { weight: 85, reps: 6 });

    expect(lastCall()).toEqual({ url: "/api/sessions/12/sets/5", method: "PATCH", body: { weight: 85, reps: 6 } });
    expect(timing.weight).toBe(85);
  });

  it("deletes a set by exercise name and index, URL-encoding the name", async () => {
    http.mockImplementation(async () => respond({ deletedCount: 1 }));

    await workoutApi.deleteSet(12, "Curl & Press", 2);

    expect(lastCall().url).toBe("/api/sessions/12/sets?exerciseName=Curl+%26+Press&setIndex=2");
    expect(lastCall().method).toBe("DELETE");
  });

  it("ends a session with the end time the user picked", async () => {
    http.mockImplementation(async () => respond({ session: { id: 12 } }));

    await workoutApi.endSession(12, "2026-10-01T11:00:00.000Z");

    expect(lastCall()).toEqual({
      url: "/api/sessions/12/end",
      method: "POST",
      body: { endTime: "2026-10-01T11:00:00.000Z" },
    });
  });

  it("moves a running session to another day with a null title rather than dropping the field", async () => {
    http.mockImplementation(async () => respond({ success: true }));

    await workoutApi.updateSessionDay(12, 3);

    expect(lastCall()).toEqual({ url: "/api/sessions/12", method: "PATCH", body: { dayNumber: 3, dayTitle: null } });
  });

  it("encodes a split name with a slash so deleting it can't hit another route", async () => {
    http.mockImplementation(async () => respond({ success: true }));

    await workoutApi.deleteAllSessionsForSplit("Upper/Lower");

    expect(lastCall().url).toBe("/api/sessions/split/Upper%2FLower");
  });

  it("treats a server without the exercise-records route as unsupported, not as no records", async () => {
    http.mockImplementation(async () => respond({ error: "bad id" }, 400));
    expect(await workoutApi.getRecordSessions()).toBeNull();

    http.mockImplementation(async () => respond({ sessions: [{ id: 1, setTimings: [{ ...set, weight: "80.00" }] }] }));
    expect((await workoutApi.getRecordSessions())?.[0].setTimings?.[0].weight).toBe(80);
  });

  it("stops paging history when the server sends an empty cursor", async () => {
    http.mockImplementation(async () => respond({ sessions: [], nextCursor: "" }));

    expect(await workoutApi.getSessionHistoryPage("A", "c1", 50)).toEqual({ sessions: [], nextCursor: null });
    expect(lastCall().url).toBe("/api/sessions?split=A&before=c1&limit=50&includeTimings=false");
  });
});

describe("errors reach the caller so the sync queue keeps the set", () => {
  it.each([
    [401, true],
    [403, true],
    [404, true],
    [500, false],
    [502, false],
  ])("rejects a %i with an ApiError (credential rejection: %s)", async (status, rejection) => {
    http.mockImplementation(async () => respond({ error: "nope" }, status));

    const error = await workoutApi.recordSet(12, set).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(status);
    expect(isCredentialRejection(error)).toBe(rejection);
  });

  it("does not log out on a 429 and carries the Retry-After wait", async () => {
    http.mockImplementation(async () => respond({ error: "slow down" }, 429, { "Retry-After": "7" }));

    const error = (await workoutApi.endSession(12).catch((e: unknown) => e)) as ApiError;

    expect(error.status).toBe(429);
    expect(error.retryAfterMs).toBe(7000);
    expect(isCredentialRejection(error)).toBe(false);
  });

  it("rethrows a network failure instead of reporting the set as saved", async () => {
    http.mockRejectedValue(new TypeError("Network request failed"));

    await expect(workoutApi.recordSet(12, set)).rejects.toThrow("Network request failed");
  });

  it("fails a start whose response has no session id instead of recording sets against undefined", async () => {
    http.mockImplementation(async () => respond({ session: {} }));

    await expect(workoutApi.startSession("A", 1)).rejects.toBeInstanceOf(ApiError);
  });

  it("fails on a proxy error page that isn't JSON", async () => {
    http.mockImplementation(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));

    await expect(workoutApi.endSession(12)).rejects.toMatchObject({ status: 502 });
  });

  it("treats success:false in a 200 as a failure", async () => {
    http.mockImplementation(async () => respond({ success: false, error: "Session already ended" }));

    await expect(workoutApi.updateSessionDay(12, 2)).rejects.toThrow("Session already ended");
  });
});
