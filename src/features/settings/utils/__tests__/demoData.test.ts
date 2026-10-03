jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    startSession: jest.fn(async () => "s1"),
    recordSet: jest.fn(async () => ({})),
    endSession: jest.fn(async () => ({})),
  },
}));

import { workoutApi } from "@features/workout/services/index";
import { buildDemoProgram, fillDemoSessions, DEMO_SPLIT } from "../demoData";

const { startSession, recordSet, endSession } = workoutApi as unknown as {
  startSession: jest.Mock;
  recordSet: jest.Mock;
  endSession: jest.Mock;
};

const NOW = Date.parse("2025-06-01T18:00:00.000Z");
const DAY_MS = 86_400_000;

describe("fillDemoSessions", () => {
  beforeEach(() => {
    startSession.mockClear();
    recordSet.mockClear();
    endSession.mockClear();
  });

  it("seeds every session over more than a month, flagged as demo", async () => {
    const program = buildDemoProgram();
    const result = await fillDemoSessions(program, DEMO_SPLIT, 18, NOW);

    expect(result.sessions).toBe(18);
    expect(startSession).toHaveBeenCalledTimes(18);
    expect(endSession).toHaveBeenCalledTimes(18);
    expect(recordSet).toHaveBeenCalledTimes(result.sets);

    const starts = startSession.mock.calls.map((c) =>
      Date.parse((c as unknown[])[6] as string),
    );
    expect(Math.min(...starts)).toBeLessThanOrEqual(NOW - 30 * DAY_MS);
    expect(Math.max(...starts)).toBeLessThan(NOW);
    expect(
      startSession.mock.calls.every((c) => (c as unknown[])[5] === true),
    ).toBe(true);
  });

  it("progresses weight for the same exercise over time", async () => {
    await fillDemoSessions(buildDemoProgram(), DEMO_SPLIT, 18, NOW);

    const benchWeights = recordSet.mock.calls
      .map((c) => (c as unknown[])[1] as { exerciseName: string; weight: number })
      .filter((p) => p.exerciseName === "Bench Press")
      .map((p) => p.weight);

    expect(benchWeights.length).toBeGreaterThan(0);
    expect(benchWeights.at(-1)!).toBeGreaterThan(benchWeights[0]);
  });

  it("throws instead of seeding nothing when the split has no exercises", async () => {
    await expect(
      fillDemoSessions(buildDemoProgram(), "Nope", 4, NOW),
    ).rejects.toThrow(/No exercises/);
    expect(startSession).not.toHaveBeenCalled();
  });
});
