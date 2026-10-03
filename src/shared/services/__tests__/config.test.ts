const mockKv: Record<string, string> = {};

const mockGetStorageItem = jest.fn(async (k: string) => mockKv[k] ?? null);
const mockSetStorageItem = jest.fn(async (k: string, v: string) => {
  mockKv[k] = v;
});
const mockRemoveStorageItem = jest.fn(async (k: string) => {
  delete mockKv[k];
});

const mockGetStorageItemSync = jest.fn((k: string) => mockKv[k] ?? null);

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: mockGetStorageItemSync,
  setStorageErrorHandler: jest.fn(),
  getStorageItem: mockGetStorageItem,
  setStorageItem: mockSetStorageItem,
  removeStorageItem: mockRemoveStorageItem,
}));

import type * as ConfigModule from "@shared/services/config";

const DEFAULT_URL = "https://owngains.superak0s.com";

let config: typeof ConfigModule;

// The module reads the stored URL synchronously at import time, so each test
// needs its own instance of it.
const load = () => {
  jest.resetModules();
  config = require("@shared/services/config");
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  for (const k of Object.keys(mockKv)) delete mockKv[k];
  jest.clearAllMocks();
  load();
});

describe("getServerUrl", () => {
  it("has the stored override before anything is awaited", () => {
    expect(config.getServerUrl()).toBe(DEFAULT_URL);
    expect(config.getDefaultServerUrl()).toBe(DEFAULT_URL);

    mockKv["@server_url"] = "https://gym.example.com";
    load();
    // The first requests of a cold start go out before any promise resolves,
    // so this has to be right synchronously.
    expect(config.getServerUrl()).toBe("https://gym.example.com");
  });

  it("keeps a later write", async () => {
    mockKv["@server_url"] = "https://stale.example.com";
    load();

    await config.setServerUrl("https://fresh.example.com");
    await flush();

    expect(config.getServerUrl()).toBe("https://fresh.example.com");
  });

  it("keeps the default when the initial read fails", () => {
    // crashReporting reads its own key through this at import time, so only
    // the server URL read may throw.
    mockGetStorageItemSync.mockImplementation((k: string) => {
      if (k === "@server_url") throw new Error("db locked");
      return mockKv[k] ?? null;
    });
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    load();

    expect(config.getServerUrl()).toBe(DEFAULT_URL);
    error.mockRestore();
  });
});

describe("isPrivateHost", () => {
  it.each([
    "localhost",
    "::1",
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.5",
    "fd00::1",
    "fc00:1234::abcd",
    "fe80::1%25eth0",
    "169.254.1.5",
    "owngains.local",
    "NAS.Local",
  ])("treats %s as private", (host) => {
    expect(config.isPrivateHost(host)).toBe(true);
  });

  it.each([
    "example.com",
    "8.8.8.8",
    "172.15.0.1",
    "172.32.0.1",
    "192.169.0.1",
    "11.0.0.1",
    "2001:4860:4860::8888",
    "fe00::1",
    "169.255.0.1",
    "not-local",
  ])("treats %s as public", (host) => {
    expect(config.isPrivateHost(host)).toBe(false);
  });
});

describe("validateServerUrl", () => {
  it("accepts https anywhere and http only on a private host", () => {
    expect(config.validateServerUrl(" https://gym.example.com ")).toEqual({
      valid: true,
    });
    expect(config.validateServerUrl("http://192.168.1.5:3000")).toEqual({
      valid: true,
    });
  });

  it.each([
    ["", "Please enter a server URL"],
    ["   ", "Please enter a server URL"],
    ["gym.example.com", "URL must start with http:// or https://"],
    ["ftp://gym.example.com", "URL must start with http:// or https://"],
    ["https://", "Invalid URL format"],
    [
      "http://gym.example.com",
      "HTTP is not secure. Please use HTTPS for production servers.",
    ],
  ])("rejects %p", (url, message) => {
    expect(config.validateServerUrl(url)).toEqual({ valid: false, message });
  });
});

describe("setServerUrl", () => {
  it("persists a trimmed URL and notifies subscribers only on a change", async () => {
    const seen: string[] = [];
    config.onServerUrlChange((v) => seen.push(v));

    expect(await config.setServerUrl(" https://gym.example.com ")).toBe(true);
    expect(mockKv["@server_url"]).toBe("https://gym.example.com");
    expect(config.getServerUrl()).toBe("https://gym.example.com");

    expect(await config.setServerUrl("https://gym.example.com")).toBe(true);
    expect(seen).toEqual(["https://gym.example.com"]);
  });

  it("stops notifying after unsubscribe", async () => {
    const seen: string[] = [];
    const unsubscribe = config.onServerUrlChange((v) => seen.push(v));
    unsubscribe();

    await config.setServerUrl("https://gym.example.com");
    expect(seen).toEqual([]);
  });

  it("refuses an invalid URL without touching storage", async () => {
    expect(await config.setServerUrl("http://gym.example.com")).toBe(false);
    expect(mockSetStorageItem).not.toHaveBeenCalled();
    expect(config.getServerUrl()).toBe(DEFAULT_URL);
  });

  it("reports a failed write as false", async () => {
    mockSetStorageItem.mockRejectedValueOnce(new Error("disk full"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(await config.setServerUrl("https://gym.example.com")).toBe(false);
    expect(config.getServerUrl()).toBe(DEFAULT_URL);
    error.mockRestore();
  });
});

describe("resetServerUrl", () => {
  it("clears the override and announces the default", async () => {
    await config.setServerUrl("https://gym.example.com");
    const seen: string[] = [];
    config.onServerUrlChange((v) => seen.push(v));

    expect(await config.resetServerUrl()).toBe(true);
    expect(mockKv["@server_url"]).toBeUndefined();
    expect(config.getServerUrl()).toBe(DEFAULT_URL);
    expect(seen).toEqual([DEFAULT_URL]);
  });

  it("notifies no listener when the default was already in use", async () => {
    const seen: string[] = [];
    config.onServerUrlChange((v) => seen.push(v));

    expect(await config.resetServerUrl()).toBe(true);
    expect(seen).toEqual([]);
  });

  it("reports a failed removal as false", async () => {
    mockRemoveStorageItem.mockRejectedValueOnce(new Error("disk full"));
    const error = jest.spyOn(console, "error").mockImplementation(() => {});

    expect(await config.resetServerUrl()).toBe(false);
    error.mockRestore();
  });
});

// Every request appends its own leading-slash path, so a trailing slash copied
// from a browser produces "https://host//api/...".
describe("normalizeServerUrl", () => {
  it("strips trailing slashes but leaves the scheme alone", () => {
    expect(config.normalizeServerUrl("  https://owngains.example.com/  ")).toBe(
      "https://owngains.example.com",
    );
    expect(config.normalizeServerUrl("https://owngains.example.com///")).toBe(
      "https://owngains.example.com",
    );
    expect(config.normalizeServerUrl("https://")).toBe("https://");
  });

  it("saves the normalized form", async () => {
    expect(await config.setServerUrl("https://owngains.example.com/")).toBe(true);
    expect(config.getServerUrl()).toBe("https://owngains.example.com");
  });

  it("rejects a URL with a path or a query", () => {
    expect(config.validateServerUrl("https://example.com/api").valid).toBe(
      false,
    );
    expect(config.validateServerUrl("https://example.com/?x=1").valid).toBe(
      false,
    );
    expect(config.validateServerUrl("https://example.com/").valid).toBe(true);
  });
});
