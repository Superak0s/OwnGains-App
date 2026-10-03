import { makeProgramApi } from "../programApiFactory";
import type { HttpFetch } from "@shared/services/authenticatedFetch";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("makeProgramApi", () => {
  it("routes fetchSavedProgram through the injected transport", async () => {
    const http = jest.fn<Promise<Response>, Parameters<HttpFetch>>(async () =>
      jsonResponse({ weeklyPlan: { days: [], totalDays: 0 } }),
    );

    await makeProgramApi(http).fetchSavedProgram();

    expect(http.mock.calls[0][0]).toBe("/api/program");
  });

  it("returns null when the server has no program", async () => {
    const http = jest.fn(async () => jsonResponse({}, 404));

    expect(await makeProgramApi(http).fetchSavedProgram()).toBeNull();
  });

  it("sends the exercise rename patch", async () => {
    const http = jest.fn<Promise<Response>, Parameters<HttpFetch>>(async () =>
      jsonResponse({ success: true }),
    );

    await makeProgramApi(http).renameExercise(1, "Push", 0, "Incline Press");

    const [url, options] = http.mock.calls[0];
    expect(url).toBe("/api/program/exercise/rename");
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(options?.body as string)).toEqual({
      dayNumber: 1,
      split: "Push",
      exerciseIndex: 0,
      newName: "Incline Press",
    });
  });
});
