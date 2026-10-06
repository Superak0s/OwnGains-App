import { makeWorkoutApi } from "../workoutApiFactory";
import type { HttpFetch } from "@shared/services/authenticatedFetch";

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("makeWorkoutApi", () => {
  it("routes every call through the injected transport", async () => {
    const http = jest.fn<Promise<Response>, Parameters<HttpFetch>>(async () =>
      jsonResponse({ session: { id: 7 } }),
    );
    const api = makeWorkoutApi(http);

    const id = await api.startSession("Push", 1, "Chest Day");

    expect(id).toBe(7);
    expect(http).toHaveBeenCalledTimes(1);
    const [url, options] = http.mock.calls[0];
    expect(url).toBe("/api/sessions/start");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(options?.body as string)).toMatchObject({
      split: "Push",
      dayNumber: 1,
      dayTitle: "Chest Day",
    });
    expect(JSON.parse(options?.body as string)).not.toHaveProperty("isDemo");
  });

  it("sends an Idempotency-Key only when the caller supplies one", async () => {
    const http = jest.fn<Promise<Response>, Parameters<HttpFetch>>(async () =>
      jsonResponse({
        session: { id: 7 },
        timing: { id: 1, weight: 60, reps: 5 },
      }),
    );
    const api = makeWorkoutApi(http);
    const set = {
      exerciseName: "Row",
      setIndex: 0,
      startTime: "s",
      endTime: "e",
      weight: 60,
      reps: 5,
    };

    await api.startSession("Pull", 1, "Back", false, null, "k1");
    await api.recordSet(7, set, "k2");
    await api.endSession(7, null, "k3");
    await api.recordSet(7, set);

    const keys = http.mock.calls.map(
      ([, options]) =>
        (options?.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(keys).toEqual(["k1", "k2", "k3", undefined]);
  });

  it("normalizes the DECIMAL weight the server sends as a string", async () => {
    const http = jest.fn(async () =>
      jsonResponse({ timing: { id: 1, weight: "62.50", reps: 8 } }),
    );
    const api = makeWorkoutApi(http);

    const timing = await api.recordSet(7, {
      exerciseName: "Bench Press",
      setIndex: 0,
      startTime: "2026-09-04T10:00:00",
      endTime: "2026-09-04T10:01:00",
      weight: 62.5,
      reps: 8,
    });

    expect(timing.weight).toBe(62.5);
  });

  it("builds the analytics query string from the arguments", async () => {
    const http = jest.fn(async () => jsonResponse({ totalSessions: 3 }));
    const api = makeWorkoutApi(http);

    await api.getAnalytics("Pull", 2);

    expect(http).toHaveBeenCalledWith("/api/analytics?split=Pull&dayNumber=2&days=365", {
      method: "GET",
    });
  });

  it("sends the password with the data-wipe confirmation", async () => {
    const http = jest.fn<Promise<Response>, Parameters<HttpFetch>>(async () =>
      jsonResponse({ success: true }),
    );

    await makeWorkoutApi(http).deleteAllUserData("hunter22");

    const [url, options] = http.mock.calls[0];
    expect(url).toBe("/api/auth/account/data");
    expect(options?.method).toBe("DELETE");
    expect(JSON.parse(options?.body as string)).toEqual({
      confirmDelete: "DELETE_ALL_DATA",
      password: "hunter22",
    });
  });

  it("keeps two instances independent", async () => {
    const a = jest.fn(async () => jsonResponse({ session: { id: 1 } }));
    const b = jest.fn(async () => jsonResponse({ session: { id: 2 } }));

    expect(await makeWorkoutApi(a).startSession("Push", 1)).toBe(1);
    expect(await makeWorkoutApi(b).startSession("Pull", 2)).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
