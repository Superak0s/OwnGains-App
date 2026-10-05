jest.mock("../apiClient", () => ({ apiCall: jest.fn() }));
jest.mock("../config", () => ({
  getServerUrl: jest.fn(() => "https://example.test"),
}));
jest.mock("../appMode", () => ({
  isServerless: jest.fn(async () => false),
}));

import {
  compareVersions,
  checkServerVersion,
  getServerVersionStatus,
} from "../serverVersion";
import { apiCall } from "../apiClient";
import { isServerless } from "../appMode";
import { getServerUrl } from "../config";

const mockApiCall = apiCall as jest.MockedFunction<typeof apiCall>;
const mockIsServerless = isServerless as jest.MockedFunction<
  typeof isServerless
>;

describe("compareVersions", () => {
  it("orders by each numeric segment, not lexically", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareVersions("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
  });

  it("treats equal versions as equal", () => {
    expect(compareVersions("1.1.0", "1.1.0")).toBe(0);
  });

  it("pads missing segments with zero", () => {
    expect(compareVersions("1.1", "1.1.0")).toBe(0);
    expect(compareVersions("1.1", "1.1.1")).toBeLessThan(0);
    expect(compareVersions("1.2", "1.1.9")).toBeGreaterThan(0);
  });

  it("reads a non-numeric segment as zero rather than NaN", () => {
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBe(0);
    expect(compareVersions("unknown", "1.0.0")).toBeLessThan(0);
  });
});

describe("checkServerVersion", () => {
  beforeEach(() => {
    mockApiCall.mockReset();
    mockIsServerless.mockResolvedValue(false);
  });

  it("flags a server older than the minimum", async () => {
    mockApiCall.mockResolvedValue({ version: "0.0.9" });
    expect(await checkServerVersion()).toEqual({
      version: "0.0.9",
      outdated: true,
    });
  });

  it("accepts a server at or above the minimum", async () => {
    mockApiCall.mockResolvedValue({ version: "1.2.3" });
    expect(await checkServerVersion()).toEqual({
      version: "1.2.3",
      outdated: false,
    });
  });

  // An unreachable server is a connectivity problem, so it is not reported as outdated.
  // That report would tell users to contact their operator for nothing.
  it("returns null when the server cannot be reached", async () => {
    mockApiCall.mockRejectedValue(new Error("Network request failed"));
    expect(await checkServerVersion()).toBeNull();
  });

  it("returns null when the response has no version", async () => {
    mockApiCall.mockResolvedValue({});
    expect(await checkServerVersion()).toBeNull();
  });

  it("never reaches the network in offline mode", async () => {
    mockIsServerless.mockResolvedValue(true);
    expect(await checkServerVersion()).toBeNull();
    expect(mockApiCall).not.toHaveBeenCalled();
  });
});

describe("getServerVersionStatus", () => {
  let run = 0;
  beforeEach(() => {
    mockApiCall.mockReset();
    mockIsServerless.mockResolvedValue(false);
    // The check is cached per server URL, so a fresh URL starts each test uncached.
    (getServerUrl as jest.Mock).mockReturnValue(`https://run${++run}.test`);
  });

  it("asks each server once per run", async () => {
    mockApiCall.mockResolvedValue({ version: "0.0.9" });

    await getServerVersionStatus();
    expect(await getServerVersionStatus()).toEqual({ version: "0.0.9", outdated: true });
    expect(mockApiCall).toHaveBeenCalledTimes(1);

    (getServerUrl as jest.Mock).mockReturnValue("https://other.test");
    await getServerVersionStatus();
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });

  it("asks again after a check the server didn't answer", async () => {
    mockApiCall
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({ version: "1.0.0" });

    expect(await getServerVersionStatus()).toBeNull();
    await Promise.resolve();
    expect(await getServerVersionStatus()).toEqual({ version: "1.0.0", outdated: false });
  });
});
