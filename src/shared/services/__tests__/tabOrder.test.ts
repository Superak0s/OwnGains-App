jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import {
  DEFAULT_TAB_ORDER,
  loadTabOrder,
  moveTab,
  normalizeTabOrder,
  onTabOrderChange,
  saveTabOrder,
  type TabName,
} from "../tabOrder";

describe("normalizeTabOrder", () => {
  it("falls back to the default order for a missing or malformed value", () => {
    expect(normalizeTabOrder(null)).toEqual([...DEFAULT_TAB_ORDER]);
    expect(normalizeTabOrder("Home")).toEqual([...DEFAULT_TAB_ORDER]);
  });

  it("drops unknown and duplicate names and appends missing tabs", () => {
    expect(
      normalizeTabOrder(["Settings", "Gone", "Home", "Settings", 3]),
    ).toEqual([
      "Settings",
      "Home",
      "Workout",
      "Analytics",
      "Tracking",
      "Supplements",
      "Friends",
      "Plan",
    ]);
  });
});

describe("moveTab", () => {
  const order: TabName[] = ["Home", "Workout", "Plan"];

  it("swaps with the neighbour in the given direction", () => {
    expect(moveTab(order, 1, -1)).toEqual(["Workout", "Home", "Plan"]);
    expect(moveTab(order, 1, 1)).toEqual(["Home", "Plan", "Workout"]);
  });

  it("leaves the order alone at either end", () => {
    expect(moveTab(order, 0, -1)).toBe(order);
    expect(moveTab(order, 2, 1)).toBe(order);
  });
});

describe("saveTabOrder", () => {
  it("persists the order and notifies subscribers", async () => {
    const seen: TabName[][] = [];
    const unsubscribe = onTabOrderChange.subscribe((o) => seen.push(o));
    const order = moveTab([...DEFAULT_TAB_ORDER], 0, 1);

    await saveTabOrder(order);
    unsubscribe();

    expect(seen).toEqual([order]);
    expect(await loadTabOrder()).toEqual(order);
  });
});
