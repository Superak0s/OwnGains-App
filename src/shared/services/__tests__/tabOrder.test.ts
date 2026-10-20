jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import {
  DEFAULT_TAB_ORDER,
  tabLabel,
  loadTabOrder,
  moveTab,
  normalizeTabOrder,
  onTabOrderChange,
  saveTabOrder,
  TRAINER_TABS,
  visibleTabs,
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
    const seen: unknown[] = [];
    const unsubscribe = onTabOrderChange.subscribe((c) => seen.push(c));
    const order = moveTab([...DEFAULT_TAB_ORDER], 0, 1);

    await saveTabOrder(order);
    unsubscribe();

    expect(seen).toEqual([{ role: "personal", order }]);
    expect(await loadTabOrder()).toEqual(order);
  });

  it("keeps the trainer order separate from the personal one", async () => {
    const personal = await loadTabOrder("personal");
    const trainer = moveTab([...TRAINER_TABS], 0, 1);

    await saveTabOrder(trainer, "trainer");

    expect(await loadTabOrder("trainer")).toEqual(trainer);
    expect(await loadTabOrder("personal")).toEqual(personal);
  });

  it("defaults the trainer order to the coaching tabs", async () => {
    expect(normalizeTabOrder(null, TRAINER_TABS)).toEqual([...TRAINER_TABS]);
  });
});

describe("visibleTabs", () => {
  const order: TabName[] = ["Friends", "Home", "Workout", "Settings"];

  it("drops Friends offline", () => {
    expect(visibleTabs("offline", order)).toEqual(["Home", "Workout", "Settings"]);
  });

  it("keeps the order online", () => {
    expect(visibleTabs("online", order)).toEqual(order);
  });
});

describe("tabLabel", () => {
  it("names the tab the way the trainer sees it", () => {
    expect(tabLabel("Workout", true)).toBe("Session");
    expect(tabLabel("Plan", true)).toBe("Programs");
  });

  it("keeps the personal names otherwise", () => {
    expect(tabLabel("Analytics", false)).toBe("Progress");
  });
});
