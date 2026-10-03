import { measureAnchor, tutorialAnchor, waitForAnchor } from "../anchors";

const WIN = { width: 400, height: 800 };
const node = (x: number, y: number, width: number, height: number) => ({
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) =>
    cb(x, y, width, height),
});

describe("tutorialAnchor", () => {
  it("returns the same callback for the same id so React never re-attaches", () => {
    expect(tutorialAnchor("plan.import")).toBe(tutorialAnchor("plan.import"));
  });

  it("measures a registered node and forgets it after cleanup", async () => {
    const cleanup = tutorialAnchor("plan.export")(node(10, 20, 100, 40));
    expect(await measureAnchor("plan.export", WIN)).toEqual({ x: 10, y: 20, width: 100, height: 40 });
    cleanup?.();
    expect(await measureAnchor("plan.export", WIN)).toBeNull();
  });

  it("skips zero-size and off-screen nodes and uses the visible one", async () => {
    const a = tutorialAnchor("widgets.edit")(node(0, 0, 0, 0));
    const b = tutorialAnchor("widgets.edit")(node(900, 100, 50, 50));
    const c = tutorialAnchor("widgets.edit")(node(20, 700, 200, 44));
    expect(await measureAnchor("widgets.edit", WIN)).toEqual({ x: 20, y: 700, width: 200, height: 44 });
    [a, b, c].forEach((fn) => fn?.());
  });
});

describe("waitForAnchor", () => {
  it("resolves null once the timeout passes with nothing registered", async () => {
    expect(await waitForAnchor("home.changeDay", 30, 10)).toBeNull();
  });

  it("resolves as soon as the node appears", async () => {
    setTimeout(() => tutorialAnchor("workout.complete")(node(5, 5, 50, 50)), 20);
    expect(await waitForAnchor("workout.complete", 500, 10)).toEqual({ x: 5, y: 5, width: 50, height: 50 });
  });
});
