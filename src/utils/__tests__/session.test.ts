import {
  INACTIVITY_THRESHOLD_MS,
  getLocalISOString,
  isSessionInactive,
  isLocalSessionId,
  isSessionGone,
  calculateSessionTime,
  calculateRestTime,
  calculateSessionAverageRest,
  calculateRestByExercise,
  getLastSetExerciseIndex,
  mergeRestHistory,
  pooledRestHistory,
  getSessionStatistics,
} from "../session";
import { ApiError } from "@shared/services/apiError";
import type { WorkoutData } from "@shared/types";
import type { CompletedDays } from "../dayCompletion";

describe("isLocalSessionId", () => {
  it("recognises the local_ prefix and tolerates null", () => {
    expect(isLocalSessionId("local_123")).toBe(true);
    expect(isLocalSessionId("123")).toBe(false);
    expect(isLocalSessionId(null)).toBe(false);
    expect(isLocalSessionId(undefined)).toBe(false);
  });
});

describe("getLocalISOString", () => {
  it("emits a local-offset timestamp instead of a UTC Z", () => {
    const iso = getLocalISOString();
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
    // The wall-clock part must match the device's local time, not UTC.
    const now = new Date();
    expect(iso.slice(0, 13)).toBe(
      new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 13),
    );
  });
});

describe("isSessionInactive", () => {
  it("is false without a recorded activity time", () => {
    expect(isSessionInactive(null)).toBe(false);
  });

  it("flips once the inactivity threshold is exceeded", () => {
    const now = Date.now();
    expect(isSessionInactive(new Date(now - 1000).toISOString())).toBe(false);
    expect(
      isSessionInactive(new Date(now - INACTIVITY_THRESHOLD_MS - 1000).toISOString()),
    ).toBe(true);
  });
});

describe("elapsed-time helpers", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-01T10:10:00.000Z"));
  });
  afterEach(() => jest.useRealTimers());

  it("return 0 without a reference timestamp", () => {
    expect(calculateSessionTime(null)).toBe(0);
    expect(calculateRestTime(null)).toBe(0);
  });

  it("count whole seconds since the reference timestamp", () => {
    expect(calculateSessionTime("2024-01-01T10:00:00.000Z")).toBe(600);
    expect(calculateRestTime("2024-01-01T10:09:30.000Z")).toBe(30);
  });
});

const completedDays = (
  times: string[],
  isWarmup = false,
): CompletedDays =>
  ({
    1: {
      0: Object.fromEntries(
        times.map((completedAt, i) => [i, { completedAt, isWarmup }]),
      ),
    },
  }) as unknown as CompletedDays;

describe("calculateSessionAverageRest", () => {
  const start = "2024-01-01T10:00:00.000Z";

  it("falls back when there is no start time or no data for the day", () => {
    expect(calculateSessionAverageRest(completedDays([]), 1, null, 99)).toBe(99);
    expect(calculateSessionAverageRest({} as CompletedDays, 1, start, 99)).toBe(99);
  });

  it("averages the gaps between consecutive sets", () => {
    const avg = calculateSessionAverageRest(
      completedDays([
        "2024-01-01T10:00:00.000Z",
        "2024-01-01T10:01:00.000Z",
        "2024-01-01T10:03:00.000Z",
      ]),
      1,
      start,
    );
    expect(avg).toBe(90);
  });

  it("ignores sets logged before the session started", () => {
    expect(
      calculateSessionAverageRest(
        completedDays(["2024-01-01T09:00:00.000Z", "2024-01-01T10:00:30.000Z"]),
        1,
        start,
        120,
      ),
    ).toBe(120);
  });

  it("discards implausible gaps outside the 10s-20min window", () => {
    expect(
      calculateSessionAverageRest(
        completedDays(["2024-01-01T10:00:00.000Z", "2024-01-01T10:00:05.000Z"]),
        1,
        start,
        120,
      ),
    ).toBe(120);
    expect(
      calculateSessionAverageRest(
        completedDays(["2024-01-01T10:00:00.000Z", "2024-01-01T11:00:00.000Z"]),
        1,
        start,
        120,
      ),
    ).toBe(120);
  });
});

const twoExercises = (
  first: string[],
  second: string[],
): CompletedDays =>
  ({
    1: {
      0: Object.fromEntries(first.map((completedAt, i) => [i, { completedAt }])),
      1: Object.fromEntries(second.map((completedAt, i) => [i, { completedAt }])),
    },
  }) as unknown as CompletedDays;

describe("calculateRestByExercise", () => {
  const start = "2024-01-01T10:00:00.000Z";

  it("keys rest by exercise and never crosses the boundary between them", () => {
    // 60s within exercise 0, 120s within exercise 1, and a 5-minute walk
    // between the two stations that must not be counted as anyone's rest.
    const rest = calculateRestByExercise(
      twoExercises(
        ["2024-01-01T10:00:00.000Z", "2024-01-01T10:01:00.000Z"],
        ["2024-01-01T10:06:00.000Z", "2024-01-01T10:08:00.000Z"],
      ),
      1,
      start,
    );
    expect(rest[0]).toEqual({ averageSec: 60, medianSec: 60, samples: 1 });
    expect(rest[1]).toEqual({ averageSec: 120, medianSec: 120, samples: 1 });
  });

  it("reports a median that the mean's outlier cannot move", () => {
    const rest = calculateRestByExercise(
      completedDays([
        "2024-01-01T10:00:00.000Z",
        "2024-01-01T10:01:00.000Z",
        "2024-01-01T10:02:00.000Z",
        "2024-01-01T10:12:00.000Z",
      ]),
      1,
      start,
    );
    expect(rest[0].medianSec).toBe(60);
    expect(rest[0].averageSec).toBe(240);
  });

  it("omits an exercise whose gaps are all outside the plausible window", () => {
    expect(
      calculateRestByExercise(
        completedDays(["2024-01-01T10:00:00.000Z", "2024-01-01T10:00:05.000Z"]),
        1,
        start,
      ),
    ).toEqual({});
  });
});

describe("getLastSetExerciseIndex", () => {
  it("points at the exercise the most recent set belongs to", () => {
    expect(
      getLastSetExerciseIndex(
        twoExercises(
          ["2024-01-01T10:00:00.000Z", "2024-01-01T10:09:00.000Z"],
          ["2024-01-01T10:03:00.000Z"],
        ),
        1,
      ),
    ).toBe(0);
    expect(getLastSetExerciseIndex({} as CompletedDays, 1)).toBeNull();
  });
});

describe("mergeRestHistory", () => {
  const sessionRest = { 0: { averageSec: 200, medianSec: 180, samples: 3 } };

  it("seeds an unseen exercise with this session's median", () => {
    expect(mergeRestHistory({}, sessionRest, () => "Squat")).toEqual({
      Squat: 180,
    });
  });

  it("eases an existing average toward the new session instead of replacing it", () => {
    expect(mergeRestHistory({ Squat: 120 }, sessionRest, () => "Squat")).toEqual({
      Squat: 138,
    });
  });

  it("skips an exercise index the program no longer names", () => {
    expect(mergeRestHistory({ Squat: 120 }, sessionRest, () => undefined)).toEqual({
      Squat: 120,
    });
  });
});

describe("pooledRestHistory", () => {
  it("takes the median across exercises, not the mean", () => {
    expect(pooledRestHistory({ Squat: 200, Bench: 150, Curl: 60 })).toBe(150);
  });

  it("is null until at least one exercise has been measured", () => {
    expect(pooledRestHistory({})).toBeNull();
    expect(pooledRestHistory({ Squat: 0 })).toBeNull();
  });
});

describe("getSessionStatistics", () => {
  const workoutData = {
    days: [{ dayNumber: 1, split: { A: { totalSets: 12 } } }],
  } as unknown as WorkoutData;

  it("is null before a session starts", () => {
    expect(
      getSessionStatistics(null, null, {} as CompletedDays, 1, workoutData, "A", 120),
    ).toBeNull();
  });

  it("summarises time, rest, and set counts", () => {
    jest.useFakeTimers().setSystemTime(new Date("2024-01-01T10:10:00.000Z"));
    const stats = getSessionStatistics(
      "2024-01-01T10:00:00.000Z",
      "2024-01-01T10:09:00.000Z",
      completedDays(["2024-01-01T10:00:00.000Z", "2024-01-01T10:01:00.000Z"]),
      1,
      workoutData,
      "A",
      120,
    );
    expect(stats).toEqual({
      totalTime: 600,
      averageRest: 60,
      currentRest: 60,
      completedSets: 2,
      totalSets: 12,
    });
    jest.useRealTimers();
  });

  it("reports 0 total sets for an unknown day or split", () => {
    const stats = getSessionStatistics(
      "2024-01-01T10:00:00.000Z",
      null,
      {} as CompletedDays,
      9,
      workoutData,
      "A",
      120,
    );
    expect(stats?.totalSets).toBe(0);
    expect(stats?.completedSets).toBe(0);
  });
});

describe("isSessionGone", () => {
  it.each([
    ["the ended-session code", new ApiError("Session has already ended", 409, null, "SESSION_ALREADY_ENDED")],
    ["the not-found code", new ApiError("Gone", 404, null, "SESSION_NOT_FOUND")],
    ["a 403 ownership refusal", new ApiError("Session not found or unauthorized", 403)],
    ["a 404 session not found", new ApiError("Session not found", 404)],
  ])("treats %s as a dead session", (_label, error) => {
    expect(isSessionGone(error)).toBe(true);
  });

  it.each([
    ["a proxy 403", new ApiError("Forbidden", 403)],
    ["an expired token", new ApiError("Unauthorized", 401)],
    ["another resource not found", new ApiError("Exercise not found", 404)],
    ["the session message on a 500", new ApiError("Session not found", 500)],
    ["a plain Error with the session message", new Error("Session not found")],
    ["a network failure", new Error("Network request failed")],
  ])("does not treat %s as a dead session", (_label, error) => {
    expect(isSessionGone(error)).toBe(false);
  });

  it("tolerates a non-Error", () => {
    expect(isSessionGone(null)).toBe(false);
    expect(isSessionGone(undefined)).toBe(false);
  });
});
