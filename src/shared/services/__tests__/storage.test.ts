jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import * as sqlite from "@shared/services/sqliteStorage";
import { kv, resetMemorySqlite } from "test-utils/memorySqlite";
import {
  getUserKey,
  loadFromStorage,
  loadMultipleFromStorage,
  removeFromStorage,
  removeMultipleFromStorage,
  saveToStorage,
} from "@shared/services/storage";

const silenceErrors = () =>
  jest.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  resetMemorySqlite();
  jest.clearAllMocks();
});

describe("getUserKey", () => {
  it("namespaces by user only when there is one", () => {
    expect(getUserKey("workoutData")).toBe("workoutData");
    expect(getUserKey("workoutData", null)).toBe("workoutData");
    expect(getUserKey("workoutData", "42")).toBe("workoutData_user_42");
  });
});

describe("saveToStorage / loadFromStorage", () => {
  it("round-trips a JSON value under the user's key", async () => {
    expect(await saveToStorage("plan", { days: 3 }, "42")).toBe(true);
    expect(kv["plan_user_42"]).toBe('{"days":3}');
    expect(await loadFromStorage("plan", "42")).toEqual({ days: 3 });
    expect(await loadFromStorage("plan")).toBeNull();
  });

  it("stores a string as-is and can read it back unparsed", async () => {
    await saveToStorage("split", "A");
    expect(kv.split).toBe("A");
    expect(await loadFromStorage("split", null, false)).toBe("A");
  });

  it("is null for a missing key", async () => {
    expect(await loadFromStorage("missing")).toBeNull();
  });

  it("reports a failed write as false", async () => {
    (sqlite.setStorageItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    );
    const error = silenceErrors();
    expect(await saveToStorage("plan", { days: 3 })).toBe(false);
    error.mockRestore();
  });

  it("is null when the stored value is not valid JSON", async () => {
    kv.plan = "{not json";
    const error = silenceErrors();
    expect(await loadFromStorage("plan")).toBeNull();
    error.mockRestore();
  });
});

describe("loadMultipleFromStorage", () => {
  it("returns the keys that exist, mapped back to their unscoped names", async () => {
    await saveToStorage("a", "1", "42");
    await saveToStorage("b", "2", "42");

    expect(await loadMultipleFromStorage(["a", "b", "c"], "42")).toEqual({
      a: "1",
      b: "2",
    });
  });
});

describe("removeFromStorage / removeMultipleFromStorage", () => {
  it("removes one key and a batch of keys", async () => {
    await saveToStorage("a", "1");
    await saveToStorage("b", "2");
    await saveToStorage("c", "3");

    expect(await removeFromStorage("a")).toBe(true);
    expect(kv.a).toBeUndefined();

    expect(await removeMultipleFromStorage(["b", "c"], "42")).toBe(true);
    expect(sqlite.removeStorageItems).toHaveBeenCalledWith([
      "b_user_42",
      "c_user_42",
    ]);
  });

  it("reports failures as false", async () => {
    (sqlite.removeStorageItem as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    );
    (sqlite.removeStorageItems as jest.Mock).mockRejectedValueOnce(
      new Error("disk full"),
    );
    const error = silenceErrors();

    expect(await removeFromStorage("a")).toBe(false);
    expect(await removeMultipleFromStorage(["a"])).toBe(false);
    error.mockRestore();
  });
});
