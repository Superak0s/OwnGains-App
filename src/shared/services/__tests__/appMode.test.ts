const mockKv: Record<string, string> = {};

const mockGetStorageItem = jest.fn(async (k: string) => mockKv[k] ?? null);
const mockGetStorageItemSync = jest.fn((k: string) => mockKv[k] ?? null);
const mockSetStorageItem = jest.fn(async (k: string, v: string) => {
  mockKv[k] = v;
});

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: mockGetStorageItem,
  getStorageItemSync: mockGetStorageItemSync,
  setStorageItem: mockSetStorageItem,
}));

import type * as AppModeModule from "@shared/services/appMode";

let appMode: typeof AppModeModule;

// The mode is cached in module scope after the first read.
const load = () => {
  jest.resetModules();
  appMode = require("@shared/services/appMode");
};

beforeEach(() => {
  for (const k of Object.keys(mockKv)) delete mockKv[k];
  jest.clearAllMocks();
  load();
});

describe("getAppMode", () => {
  it("defaults to online when nothing is stored", async () => {
    expect(await appMode.getAppMode()).toBe("online");
    expect(await appMode.isServerless()).toBe(false);
  });

  it("returns the stored mode", async () => {
    mockKv.appMode = "offline";
    expect(await appMode.getAppMode()).toBe("offline");
    expect(await appMode.isServerless()).toBe(true);
  });

  it("reads storage only once, no matter how many callers ask", async () => {
    await Promise.all([appMode.getAppMode(), appMode.getAppMode()]);
    await appMode.getAppMode();
    expect(mockGetStorageItem).toHaveBeenCalledTimes(1);
  });

  it("lets a mode chosen mid-read win over the stored value", async () => {
    let resolveRead: (v: string) => void = () => {};
    mockGetStorageItem.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveRead = resolve;
      }),
    );

    const pending = appMode.getAppMode();
    await appMode.setAppMode("offline");
    resolveRead("online");

    expect(await pending).toBe("offline");
    expect(await appMode.getAppMode()).toBe("offline");
  });
});

describe("setAppMode", () => {
  it("persists the mode and notifies subscribers until they unsubscribe", async () => {
    const seen: string[] = [];
    const unsubscribe = appMode.onAppModeChange.subscribe((v) => seen.push(v));

    expect(await appMode.setAppMode("offline")).toBe(true);
    expect(mockKv.appMode).toBe("offline");
    expect(await appMode.getAppMode()).toBe("offline");

    unsubscribe();
    await appMode.setAppMode("online");
    expect(seen).toEqual(["offline"]);
  });
});

describe("onboarding", () => {
  it("is incomplete until the flag is stored", () => {
    expect(appMode.isOnboardingComplete()).toBe(false);
    mockKv["@onboarding_complete"] = "true";
    expect(appMode.isOnboardingComplete()).toBe(true);
  });

  it("writes the flag as a string and announces the change", async () => {
    const seen: boolean[] = [];
    appMode.onOnboardingChange.subscribe((done) => seen.push(done));

    await appMode.setOnboardingComplete(true);
    expect(mockKv["@onboarding_complete"]).toBe("true");

    await appMode.restartOnboarding();
    expect(mockKv["@onboarding_complete"]).toBe("false");
    expect(appMode.isOnboardingComplete()).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("stops announcing after unsubscribe", async () => {
    const seen: boolean[] = [];
    const unsubscribe = appMode.onOnboardingChange.subscribe((done) =>
      seen.push(done),
    );
    unsubscribe();

    await appMode.setOnboardingComplete(true);
    expect(seen).toEqual([]);
  });
});
