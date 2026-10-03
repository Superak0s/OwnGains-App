const mockServerless = jest.fn(async () => false);

jest.mock("../appMode", () => ({ isServerless: () => mockServerless() }));
jest.mock("../localOnlyFeatures", () => ({
  isFeatureLocal: jest.fn(async () => false),
  markFeatureLocal: jest.fn(async () => {}),
}));
jest.mock("../crashReporting", () => ({ trackFeature: jest.fn() }));

import { createDispatchProxy, createOnlineOnlyProxy } from "../dispatchProxy";
import { trackFeature } from "../crashReporting";
import { markFeatureLocal } from "../localOnlyFeatures";
import { ApiError } from "../apiError";

const on = { logThing: jest.fn(async () => "on") };
const off = { logThing: jest.fn(async () => "off") };

beforeEach(() => {
  jest.clearAllMocks();
  mockServerless.mockResolvedValue(false);
});

describe("dispatch proxy usage metrics", () => {
  it("counts a successful call with the feature, op and mode", async () => {
    const api = createDispatchProxy(on, off, "supplements");

    await expect(api.logThing()).resolves.toBe("on");

    expect(trackFeature).toHaveBeenCalledWith("supplements", "logThing", {
      mode: "online",
      outcome: "ok",
    });
  });

  it("counts a failed call and still rethrows", async () => {
    mockServerless.mockResolvedValue(true);
    const failing = { logThing: jest.fn(async () => { throw new Error("nope"); }) };
    const api = createDispatchProxy(on, failing, "tracking", "tracking.hydration");

    await expect(api.logThing()).rejects.toThrow("nope");

    expect(trackFeature).toHaveBeenCalledWith("tracking.hydration", "logThing", {
      mode: "offline",
      outcome: "error",
    });
  });

  it("counts nothing for an unnamed proxy", async () => {
    const api = createDispatchProxy(on, off);

    await api.logThing();

    expect(trackFeature).not.toHaveBeenCalled();
  });

  it("does not count an online-only call refused in offline mode", async () => {
    mockServerless.mockResolvedValue(true);
    const api = createOnlineOnlyProxy(on, "friends");

    await expect(api.logThing()).rejects.toThrow();

    expect(trackFeature).not.toHaveBeenCalled();
  });
});

describe("FEATURE_LOCAL_ONLY from the server", () => {
  it("marks the feature local and serves the call on-device", async () => {
    const refused = {
      logThing: jest.fn(async () => {
        throw new ApiError("local only", 410, undefined, "FEATURE_LOCAL_ONLY");
      }),
    };
    const api = createDispatchProxy(refused, off, "tracking");

    await expect(api.logThing()).resolves.toBe("off");
    expect(markFeatureLocal).toHaveBeenCalledWith("tracking");
  });

  it("rethrows any other server error", async () => {
    const failing = {
      logThing: jest.fn(async () => { throw new ApiError("gone", 404); }),
    };
    const api = createDispatchProxy(failing, off, "tracking");

    await expect(api.logThing()).rejects.toThrow("gone");
    expect(markFeatureLocal).not.toHaveBeenCalled();
  });
});
