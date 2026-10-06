const mockStore: Record<string, unknown> = {};

const mockApiCall = jest.fn();
const mockIsServerless = jest.fn(async () => false);
const mockGetServerUrl = jest.fn(() => "https://gym.example");

const mockAppState = { currentState: "active" };
jest.mock("react-native", () =>
  Object.defineProperty(jest.requireActual("react-native"), "AppState", {
    value: {
      get currentState() {
        return mockAppState.currentState;
      },
      addEventListener: jest.fn(),
    },
  }),
);
jest.mock("@shared/services/apiClient", () => ({ apiCall: mockApiCall }));
jest.mock("@shared/services/appMode", () => ({
  isServerless: mockIsServerless,
}));
jest.mock("@shared/services/config", () => ({
  getServerUrl: mockGetServerUrl,
  getDefaultServerUrl: () => "https://official.example",
  onServerUrlChange: jest.fn(() => () => {}),
}));
jest.mock("@shared/services/storage", () => ({
  loadFromStorage: jest.fn(async (k: string) => mockStore[k] ?? null),
  saveToStorage: jest.fn(async (k: string, v: unknown) => {
    mockStore[k] = v;
    return true;
  }),
}));

import type * as LocalOnlyModule from "@shared/services/localOnlyFeatures";

let mod: typeof LocalOnlyModule;

// The list is cached in module scope after the first read.
const load = () => {
  jest.resetModules();
  mod = require("@shared/services/localOnlyFeatures");
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  for (const k of Object.keys(mockStore)) delete mockStore[k];
  jest.clearAllMocks();
  mockIsServerless.mockResolvedValue(false);
  mockGetServerUrl.mockReturnValue("https://gym.example");
  mockApiCall.mockResolvedValue({ status: "OK" });
  mockAppState.currentState = "active";
  load();
});

it("treats every feature as server-backed when the server sends no list", async () => {
  expect(await mod.isFeatureLocal("tracking")).toBe(false);
  await flush();
  expect(await mod.isFeatureLocal("supplements")).toBe(false);
});

it("routes a listed feature on-device once the server answers", async () => {
  mockApiCall.mockResolvedValue({
    status: "OK",
    localOnlyFeatures: ["tracking", "supplements"],
  });

  await mod.isFeatureLocal("tracking");
  await flush();

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
  expect(await mod.isFeatureLocal("supplements")).toBe(true);
  expect(await mod.isFeatureLocal("workout")).toBe(false);
});

it("uses the persisted list on a cold start with an unreachable server", async () => {
  mockStore["@local_only_features"] = {
    url: "https://gym.example",
    features: ["tracking"],
  };
  mockApiCall.mockRejectedValue(new Error("offline"));

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
  await flush();
  expect(await mod.isFeatureLocal("tracking")).toBe(true);
});

it("keeps health data on-device while any server hasn't answered yet", async () => {
  mockApiCall.mockRejectedValue(new Error("offline"));

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
  expect(await mod.isFeatureLocal("supplements")).toBe(true);
  expect(await mod.isFeatureLocal("workout")).toBe(false);
});

it("ignores a persisted list that came from a different server", async () => {
  mockStore["@local_only_features"] = {
    url: "https://old.example",
    features: [],
  };
  mockApiCall.mockRejectedValue(new Error("offline"));

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
});

it("never hits the network in offline app mode", async () => {
  mockIsServerless.mockResolvedValue(true);

  expect(await mod.isFeatureLocal("tracking")).toBe(false);
  await flush();

  expect(mockApiCall).not.toHaveBeenCalled();
});

it("fetches the list once, not per call", async () => {
  await Promise.all([
    mod.isFeatureLocal("tracking"),
    mod.isFeatureLocal("supplements"),
    mod.isFeatureLocal("tracking"),
  ]);
  await flush();

  expect(mockApiCall).toHaveBeenCalledTimes(1);
});

describe("with an unreachable server and nothing stored", () => {
  afterEach(() => jest.useRealTimers());

  it("doesn't make every call wait on /healthz again, and retries after a minute", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    jest.setSystemTime(0);
    mockApiCall.mockRejectedValue(new Error("offline"));

    expect(await mod.isFeatureLocal("tracking")).toBe(true);
    expect(await mod.isFeatureLocal("tracking")).toBe(true);
    expect(mockApiCall).toHaveBeenCalledTimes(1);

    mockApiCall.mockResolvedValue({ status: "OK", localOnlyFeatures: [] });
    jest.setSystemTime(60_000);
    expect(await mod.isFeatureLocal("tracking")).toBe(false);
    expect(mockApiCall).toHaveBeenCalledTimes(2);
  });

  it("doubles the retry window on every consecutive unreachable answer", async () => {
    jest.useFakeTimers({ doNotFake: ["setImmediate"] });
    jest.setSystemTime(0);
    mockApiCall.mockRejectedValue(new Error("offline"));

    await mod.isFeatureLocal("tracking");
    expect(mockApiCall).toHaveBeenCalledTimes(1);

    // First retry after 60 s, which fails and doubles the window to 120 s.
    jest.setSystemTime(60_000);
    await mod.isFeatureLocal("tracking");
    expect(mockApiCall).toHaveBeenCalledTimes(2);

    jest.setSystemTime(60_000 + 120_000 - 1_000);
    await mod.isFeatureLocal("tracking");
    expect(mockApiCall).toHaveBeenCalledTimes(2);

    jest.setSystemTime(60_000 + 120_000);
    await mod.isFeatureLocal("tracking");
    expect(mockApiCall).toHaveBeenCalledTimes(3);
  });
});

describe("refreshLocalOnlyFeatures", () => {
  it("reports null when the server cannot be reached", async () => {
    mockApiCall.mockRejectedValue(new Error("offline"));
    expect(await mod.refreshLocalOnlyFeatures()).toBeNull();
  });

  it("returns the freshly fetched list", async () => {
    mockApiCall.mockResolvedValue({
      status: "OK",
      localOnlyFeatures: ["supplements"],
    });
    expect(await mod.refreshLocalOnlyFeatures()).toEqual(["supplements"]);
  });
});

describe("onLocalOnlyFeaturesChange", () => {
  it("reports features the same server starts or stops storing", async () => {
    mockStore["@local_only_features"] = {
      url: "https://gym.example",
      features: ["tracking"],
    };
    mockApiCall.mockResolvedValue({ localOnlyFeatures: ["supplements"] });
    const listener = jest.fn();
    mod.onLocalOnlyFeaturesChange(listener);

    await mod.isFeatureLocal("tracking");
    await flush();

    expect(listener).toHaveBeenCalledWith({
      nowLocal: ["supplements"],
      nowOnServer: ["tracking"],
    });
  });

  it("delivers a change seen before anyone subscribed, once", async () => {
    mockStore["@local_only_features"] = {
      url: "https://gym.example",
      features: ["tracking"],
    };
    mockApiCall.mockResolvedValue({ localOnlyFeatures: [] });
    await mod.isFeatureLocal("tracking");
    await flush();

    const first = jest.fn();
    const second = jest.fn();
    mod.onLocalOnlyFeaturesChange(first);
    mod.onLocalOnlyFeaturesChange(second);

    expect(first).toHaveBeenCalledWith({ nowLocal: [], nowOnServer: ["tracking"] });
    expect(second).not.toHaveBeenCalled();
  });

  it("notifies no listener on first contact with a server", async () => {
    mockApiCall.mockResolvedValue({ localOnlyFeatures: ["tracking"] });
    const listener = jest.fn();
    mod.onLocalOnlyFeaturesChange(listener);

    await mod.isFeatureLocal("tracking");
    await flush();

    expect(listener).not.toHaveBeenCalled();
  });
});

describe("describeLocalOnlyFeatures", () => {
  it("labels one, two and three features", () => {
    expect(mod.describeLocalOnlyFeatures([])).toBe("");
    expect(mod.describeLocalOnlyFeatures(["tracking"])).toBe("Body tracking");
    expect(mod.describeLocalOnlyFeatures(["tracking", "supplements"])).toBe(
      "Body tracking and Supplements",
    );
    expect(
      mod.describeLocalOnlyFeatures(["tracking", "supplements", "photos"]),
    ).toBe("Body tracking, Supplements and photos");
  });
});

it("sends nothing from a headless run and goes by the stored list", async () => {
  mockAppState.currentState = "background";
  mockStore["@local_only_features"] = {
    url: "https://gym.example",
    features: ["tracking"],
  };

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
  await flush();
  expect(mockApiCall).not.toHaveBeenCalled();
});

it("keeps health data on-device in a headless run with nothing stored", async () => {
  mockAppState.currentState = "background";

  expect(await mod.isFeatureLocal("tracking")).toBe(true);
  await flush();
  expect(mockApiCall).not.toHaveBeenCalled();
});
