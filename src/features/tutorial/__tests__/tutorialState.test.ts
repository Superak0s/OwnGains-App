jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { kv, resetMemorySqlite } from "test-utils/memorySqlite";
import {
  TUTORIAL_KEY,
  gateAction,
  markChapterCompleted,
  markFirstRunDone,
  markOnlineTourOffered,
  onTutorialStateChange,
  parseTutorialState,
  pickOutcome,
  readTutorialState,
  setTutorialRole,
} from "../tutorialState";

beforeEach(() => resetMemorySqlite());

describe("parseTutorialState", () => {
  it("falls back to a fresh state for missing or malformed data", () => {
    const fresh = { role: null, completed: [], firstRunDone: false, firstRunMode: null, onlineTourOffered: false };
    expect(parseTutorialState(null)).toEqual(fresh);
    expect(parseTutorialState("{nope")).toEqual(fresh);
    expect(parseTutorialState(JSON.stringify({ role: "admin", completed: [1, "home"], firstRunDone: "yes" })))
      .toEqual({ ...fresh, completed: ["home"] });
  });
});

it("is stored under a device-wide key that clearUserData never matches", () => {
  expect(TUTORIAL_KEY).toBe("@tutorial");
  expect(TUTORIAL_KEY).not.toMatch(/_user_/);
});

it("reads storage fresh on every call, so a restore is picked up", () => {
  kv[TUTORIAL_KEY] = JSON.stringify({ firstRunDone: true, firstRunMode: "online" });
  expect(readTutorialState().firstRunDone).toBe(true);
  delete kv[TUTORIAL_KEY];
  expect(readTutorialState().firstRunDone).toBe(false);
});

it("keeps both writes when a chapter completes and the first run ends together", async () => {
  await Promise.all([markChapterCompleted("settings"), markFirstRunDone("offline")]);
  expect(readTutorialState()).toMatchObject({ completed: ["settings"], firstRunDone: true, firstRunMode: "offline" });
});

it("does not duplicate completed chapters and notifies listeners", async () => {
  const seen: string[][] = [];
  const off = onTutorialStateChange.subscribe((s) => seen.push(s.completed));
  await markChapterCompleted("home");
  await markChapterCompleted("home");
  off();
  expect(readTutorialState().completed).toEqual(["home"]);
  expect(seen).toEqual([["home"], ["home"]]);
});

it("remembers the role", async () => {
  await setTutorialRole("both");
  expect(readTutorialState().role).toBe("both");
});

describe("markFirstRunDone", () => {
  it("online first run never offers the online tour", async () => {
    await markFirstRunDone("online");
    expect(readTutorialState()).toMatchObject({ firstRunMode: "online", onlineTourOffered: true });
  });

  it("keeps the original mode when called again", async () => {
    await markFirstRunDone("offline");
    await markFirstRunDone("online");
    expect(readTutorialState().firstRunMode).toBe("offline");
  });
});

describe("gateAction", () => {
  it("shows the first run until it is done, in either mode", () => {
    expect(gateAction(readTutorialState(), "online")).toBe("firstRun");
    expect(gateAction(readTutorialState(), "offline")).toBe("firstRun");
  });

  it("never re-shows after an online first run: other account, server or offline", async () => {
    await markFirstRunDone("online");
    expect(gateAction(readTutorialState(), "online")).toBeNull();
    expect(gateAction(readTutorialState(), "offline")).toBeNull();
  });

  it("offers the online tour once to an offline-first device that goes online", async () => {
    await markFirstRunDone("offline");
    expect(gateAction(readTutorialState(), "offline")).toBeNull();
    expect(gateAction(readTutorialState(), "online")).toBe("onlineTour");
    await markOnlineTourOffered();
    expect(gateAction(readTutorialState(), "online")).toBeNull();
  });
});

describe("pickOutcome", () => {
  it("asks offline users to go online for trainer roles in every picker mode", () => {
    for (const mode of ["firstRun", "onlineTour", "change"] as const) {
      expect(pickOutcome("trainer", "offline", mode)).toBe("needsOnline");
      expect(pickOutcome("both", "offline", mode)).toBe("needsOnline");
    }
  });

  it("starts or only records the role otherwise", () => {
    expect(pickOutcome("user", "offline", "firstRun")).toBe("start");
    expect(pickOutcome("trainer", "online", "onlineTour")).toBe("start");
    expect(pickOutcome("trainer", "online", "change")).toBe("setRole");
  });
});
