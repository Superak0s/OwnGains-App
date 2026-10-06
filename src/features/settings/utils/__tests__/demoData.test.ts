import {
  buildDemoProgram,
  demoDays,
  fillDemoSessions,
  DEMO_SPLIT,
} from "../demoData";

const startSession = jest.fn(async () => "s1");
const recordSet = jest.fn(async () => ({}));
const endSession = jest.fn(async () => ({}));
const api = { startSession, recordSet, endSession } as unknown as Parameters<
  typeof fillDemoSessions
>[0];

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
    const result = await fillDemoSessions(api, program, DEMO_SPLIT, 18, NOW);

    expect(result.sessions).toBe(18);
    expect(startSession).toHaveBeenCalledTimes(18);
    expect(endSession).toHaveBeenCalledTimes(18);
    expect(recordSet).toHaveBeenCalledTimes(result.sets);

    const starts = startSession.mock.calls.map((c) =>
      Date.parse((c as unknown[])[4] as string),
    );
    expect(Math.min(...starts)).toBeLessThanOrEqual(NOW - 30 * DAY_MS);
    expect(Math.max(...starts)).toBeLessThan(NOW);
    expect(
      startSession.mock.calls.every((c) => (c as unknown[])[3] === true),
    ).toBe(true);
  });

  it("progresses weight for the same exercise over time", async () => {
    await fillDemoSessions(api, buildDemoProgram(), DEMO_SPLIT, 18, NOW);

    const benchWeights = recordSet.mock.calls
      .map((c) => (c as unknown[])[1] as { exerciseName: string; weight: number })
      .filter((p) => p.exerciseName === "Bench Press")
      .map((p) => p.weight);

    expect(benchWeights.length).toBeGreaterThan(0);
    expect(benchWeights.at(-1)!).toBeGreaterThan(benchWeights[0]);
  });

  it("throws instead of seeding nothing when the split has no exercises", async () => {
    await expect(
      fillDemoSessions(api, buildDemoProgram(), "Nope", 4, NOW),
    ).rejects.toThrow(/No exercises/);
    expect(startSession).not.toHaveBeenCalled();
  });
});

describe("demoDays", () => {
  it("sends only days with exercises in the split, with a title on each", () => {
    const days = demoDays(buildDemoProgram(), DEMO_SPLIT);
    expect(days).toHaveLength(3);
    expect(days.every((d) => d.dayTitle && d.exercises.length > 0)).toBe(true);
    expect(() => demoDays(buildDemoProgram(), "Nope")).toThrow(/No exercises/);
  });
});
