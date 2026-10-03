const stored: Record<string, string> = {};

jest.mock("../sqliteStorage", () => ({
  getStorageItemSync: (key: string) => stored[key] ?? null,
  setStorageItem: jest.fn(async (key: string, value: string) => {
    stored[key] = value;
  }),
  setStorageErrorHandler: jest.fn(),
}));

jest.mock("@sentry/react-native", () => ({
  init: jest.fn(),
  wrap: jest.fn(),
  reactNavigationIntegration: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() },
  metrics: { count: jest.fn(), gauge: jest.fn(), distribution: jest.fn() },
  startSpan: jest.fn(),
  flush: jest.fn(async () => true),
  getClient: jest.fn(() => ({ getOptions: () => ({ enabled: true }) })),
}));

const load = () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SENTRY_DSN = "https://key@example.invalid/1";
  return {
    Sentry: require("@sentry/react-native"),
    crashReporting: require("../crashReporting"),
  };
};

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  jest.clearAllMocks();
});

describe("telemetry consent defaults", () => {
  it("sends nothing at all before the privacy screen is answered", () => {
    const { Sentry, crashReporting } = load();

    expect(crashReporting.isCrashReportingEnabled()).toBe(false);
    expect(crashReporting.isTelemetryEnabled()).toBe(false);
    expect(crashReporting.hasPrivacyConsent()).toBe(false);

    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");
    crashReporting.log.warn("test.log");

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
    expect(Sentry.logger.warn).not.toHaveBeenCalled();
  });

  it("sends crash reports but not metrics or logs once the screen is answered on", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);

    const { Sentry, crashReporting } = load();
    expect(crashReporting.isCrashReportingEnabled()).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(false);

    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it("honours each stored flag independently", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(false);
    await first.crashReporting.setTelemetryEnabled(true);

    const { Sentry, crashReporting } = load();
    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
  });
});

describe("applyPrivacyChoicesFor", () => {
  it("sends nothing for a second account until it answers, whatever the first chose", async () => {
    const { crashReporting } = load();
    crashReporting.applyPrivacyChoicesFor("1");
    await crashReporting.setCrashReportingEnabled(true);
    await crashReporting.setTelemetryEnabled(true);
    await crashReporting.recordPrivacyConsent("1");

    expect(crashReporting.applyPrivacyChoicesFor("2")).toBe(false);
    expect(crashReporting.isCrashReportingEnabled()).toBe(false);
    expect(crashReporting.isTelemetryEnabled()).toBe(false);
  });

  it("restores each account's own answers when it signs back in", async () => {
    const { crashReporting } = load();
    crashReporting.applyPrivacyChoicesFor("1");
    await crashReporting.setTelemetryEnabled(true);
    await crashReporting.setCrashReportingEnabled(true);
    await crashReporting.recordPrivacyConsent("1");
    crashReporting.applyPrivacyChoicesFor("2");
    await crashReporting.setTelemetryEnabled(false);
    await crashReporting.setCrashReportingEnabled(false);
    await crashReporting.recordPrivacyConsent("2");

    expect(crashReporting.applyPrivacyChoicesFor("1")).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(true);
    expect(crashReporting.isCrashReportingEnabled()).toBe(true);
  });

  it("falls back to the device-wide answer for an account that consented before", async () => {
    stored["@privacy_consent_seen_user_1"] = "true";
    stored["@telemetry_enabled"] = "true";
    stored["@crash_reporting_enabled"] = "true";
    const { crashReporting } = load();

    expect(crashReporting.applyPrivacyChoicesFor("1")).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(true);
    expect(crashReporting.isCrashReportingEnabled()).toBe(true);
  });
});

describe("sendTestEvent", () => {
  it("reports both switches off and sends nothing when consent was never given", async () => {
    const { Sentry, crashReporting } = load();

    const result = await crashReporting.sendTestEvent();

    expect(result).toEqual({
      dsn: true,
      sdkEnabled: true,
      crashReporting: false,
      telemetry: false,
      flushed: true,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.logger.error).not.toHaveBeenCalled();
    expect(Sentry.metrics.count).not.toHaveBeenCalled();
  });

  it("fires every channel once both gates are on", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);
    await first.crashReporting.setTelemetryEnabled(true);

    const { Sentry, crashReporting } = load();
    const result = await crashReporting.sendTestEvent();

    expect(result.crashReporting).toBe(true);
    expect(result.telemetry).toBe(true);
    expect(result.flushed).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.logger.error).toHaveBeenCalledTimes(1);
    expect(Sentry.metrics.count).toHaveBeenCalledTimes(1);
  });

  it("reports not-delivered when the transport does not drain", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);

    const { Sentry, crashReporting } = load();
    (Sentry.flush as jest.Mock).mockResolvedValueOnce(false);

    expect((await crashReporting.sendTestEvent()).flushed).toBe(false);
  });

  it("reports the SDK disabled and skips the flush in a debug build", async () => {
    const { Sentry, crashReporting } = load();
    (Sentry.getClient as jest.Mock).mockReturnValueOnce({
      getOptions: () => ({ enabled: false }),
    });

    const result = await crashReporting.sendTestEvent();

    expect(result.sdkEnabled).toBe(false);
    expect(result.flushed).toBe(false);
    expect(Sentry.flush).not.toHaveBeenCalled();
  });
});

describe("native crash handling", () => {
  it("stays off until crash reporting was consented to before launch", async () => {
    const before = load();
    before.crashReporting.initCrashReporting();
    expect((before.Sentry.init as jest.Mock).mock.calls[0][0].enableNative).toBe(false);

    await before.crashReporting.setCrashReportingEnabled(true);
    const after = load();
    after.crashReporting.initCrashReporting();
    expect((after.Sentry.init as jest.Mock).mock.calls[0][0].enableNative).toBe(true);
  });
});

describe("IP addresses", () => {
  it("nulls the user IP on events and transactions", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);
    await first.crashReporting.setTelemetryEnabled(true);

    const { Sentry, crashReporting } = load();
    crashReporting.initCrashReporting();
    const options = (Sentry.init as jest.Mock).mock.calls[0][0];
    const event = { user: { id: "u1", ip_address: "{{auto}}" } };

    expect(options.beforeSend(event).user).toEqual({ id: "u1", ip_address: null });
    expect(options.beforeSendTransaction({}).user).toEqual({ ip_address: null });
  });
});
