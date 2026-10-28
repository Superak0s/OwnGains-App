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
  close: jest.fn(async () => true),
  wrap: jest.fn(),
  reactNavigationIntegration: jest.fn(),
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
  setUser: jest.fn(),
  setTag: jest.fn(),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), fatal: jest.fn() },
  startSpan: jest.fn(),
  flush: jest.fn(async () => true),
  getClient: jest.fn(() => ({ getOptions: () => ({ enabled: true }) })),
}));

const load = () => {
  jest.resetModules();
  process.env.EXPO_PUBLIC_SENTRY_DSN = "https://key@example.invalid/1";
  process.env.EXPO_PUBLIC_SENTRY_FORCE_ENABLE = "true";
  return {
    Sentry: require("@sentry/react-native"),
    Firebase: require("@react-native-firebase/analytics"),
    crashReporting: require("../crashReporting"),
  };
};

beforeEach(() => {
  for (const key of Object.keys(stored)) delete stored[key];
  jest.clearAllMocks();
});

describe("telemetry consent defaults", () => {
  it("sends nothing at all before the privacy screen is answered", () => {
    const { Sentry, Firebase, crashReporting } = load();

    expect(crashReporting.isCrashReportingEnabled()).toBe(false);
    expect(crashReporting.isTelemetryEnabled()).toBe(false);
    expect(crashReporting.hasPrivacyConsent()).toBe(false);

    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");
    crashReporting.log.warn("test.log");

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Firebase.logEvent).not.toHaveBeenCalled();
    expect(Sentry.logger.warn).not.toHaveBeenCalled();
  });

  it("sends crash reports but not metrics or logs once the screen is answered on", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);

    const { Sentry, Firebase, crashReporting } = load();
    expect(crashReporting.isCrashReportingEnabled()).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(false);

    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");

    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Firebase.logEvent).not.toHaveBeenCalled();
  });

  it("honours each stored flag independently", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(false);
    await first.crashReporting.setTelemetryEnabled(true);

    const { Sentry, Firebase, crashReporting } = load();
    crashReporting.captureException(new Error("boom"));
    crashReporting.metric.count("test.counter");

    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Firebase.logEvent).toHaveBeenCalledTimes(1);
  });

  it("switches Firebase collection with the telemetry choice", async () => {
    const { Firebase, crashReporting } = load();
    await crashReporting.setTelemetryEnabled(true);
    await crashReporting.setTelemetryEnabled(false);

    const switches = (Firebase.setAnalyticsCollectionEnabled as jest.Mock).mock.calls;
    expect(switches.map((call) => call[1])).toEqual([true, false]);
    expect(require("@react-native-firebase/perf").getPerformance().dataCollectionEnabled).toBe(false);
  });
});

describe("applyPrivacyChoicesFor", () => {
  it("keeps the device's choices for a second account, which still owes the terms", async () => {
    const { crashReporting } = load();
    crashReporting.applyPrivacyChoicesFor("1");
    await crashReporting.setCrashReportingEnabled(true);
    await crashReporting.setTelemetryEnabled(true);
    await crashReporting.recordPrivacyConsent("1");

    expect(crashReporting.applyPrivacyChoicesFor("2")).toBe(false);
    expect(crashReporting.isCrashReportingEnabled()).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(true);
    expect(crashReporting.hasCrashReportingPreference()).toBe(true);
  });

  it("adopts an account's own answer stored by an earlier version", () => {
    stored["@privacy_consent_seen_user_1"] = "true";
    stored["@telemetry_enabled_user_1"] = "true";
    stored["@crash_reporting_enabled_user_1"] = "false";
    stored["@diagnostics_prompt_version"] = "2";
    const { crashReporting } = load();

    expect(crashReporting.applyPrivacyChoicesFor("1")).toBe(true);
    expect(crashReporting.isTelemetryEnabled()).toBe(true);
    expect(crashReporting.isCrashReportingEnabled()).toBe(false);
    expect(stored["@telemetry_enabled"]).toBe("true");
    expect(stored["@crash_reporting_enabled"]).toBe("false");
  });
});

describe("diagnostics prompt", () => {
  it("asks an account that already answered once more, then not again", async () => {
    stored["@privacy_consent_seen_user_1"] = "true";
    stored["@telemetry_enabled"] = "true";
    stored["@crash_reporting_enabled"] = "true";
    const { crashReporting } = load();

    expect(crashReporting.applyPrivacyChoicesFor("1")).toBe(false);
    expect(crashReporting.isTelemetryEnabled()).toBe(true);

    await crashReporting.recordDiagnosticsPrompt();
    expect(crashReporting.applyPrivacyChoicesFor("1")).toBe(true);
  });
});

describe("sendTestEvent", () => {
  it("reports both switches off and sends nothing when consent was never given", async () => {
    const { Sentry, Firebase, crashReporting } = load();

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
    expect(Firebase.logEvent).not.toHaveBeenCalled();
  });

  it("fires every channel once both gates are on", async () => {
    const first = load();
    await first.crashReporting.setCrashReportingEnabled(true);
    await first.crashReporting.setTelemetryEnabled(true);

    const { Sentry, Firebase, crashReporting } = load();
    const result = await crashReporting.sendTestEvent();

    expect(result.crashReporting).toBe(true);
    expect(result.telemetry).toBe(true);
    expect(result.flushed).toBe(true);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.logger.error).toHaveBeenCalledTimes(1);
    expect(Firebase.logEvent).toHaveBeenCalledTimes(1);
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
  it("follows consent at launch and restarts the client when it changes", async () => {
    const { Sentry, crashReporting } = load();
    crashReporting.initCrashReporting();
    const init = Sentry.init as jest.Mock;
    expect(init.mock.calls[0][0].enableNative).toBe(false);

    await crashReporting.setCrashReportingEnabled(true);
    expect(Sentry.close).toHaveBeenCalledTimes(1);
    expect(init.mock.calls[1][0].enableNative).toBe(true);

    await crashReporting.setCrashReportingEnabled(true);
    expect(init).toHaveBeenCalledTimes(2);

    await crashReporting.setCrashReportingEnabled(false);
    expect(init.mock.calls[2][0].enableNative).toBe(false);

    const relaunched = load();
    relaunched.crashReporting.initCrashReporting();
    expect((relaunched.Sentry.init as jest.Mock).mock.calls[0][0].enableNative).toBe(false);
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

describe("analytics events", () => {
  const telemetryOn = async () => {
    const first = load();
    await first.crashReporting.setTelemetryEnabled(true);
    return load();
  };
  const sent = (Firebase: { logEvent: jest.Mock }) =>
    Firebase.logEvent.mock.calls.map((call) => call.slice(1));

  it("sends nothing without telemetry consent", () => {
    const { Firebase, crashReporting } = load();
    crashReporting.metric.count("sync.dropped", 3);
    crashReporting.trackFeature("widgets", "add");
    crashReporting.trackScreenView("Tracking/weight");
    expect(Firebase.logEvent).not.toHaveBeenCalled();
    expect(Firebase.logScreenView).not.toHaveBeenCalled();
  });

  it("sends nothing from a dev build unless forced", async () => {
    const first = load();
    await first.crashReporting.setTelemetryEnabled(true);
    process.env.EXPO_PUBLIC_SENTRY_FORCE_ENABLE = "false";
    jest.resetModules();
    const Firebase = require("@react-native-firebase/analytics");
    require("../crashReporting").metric.count("sync.dropped");
    expect(Firebase.logEvent).not.toHaveBeenCalled();
  });

  it("calls nothing in Firebase when the build has no Firebase app", async () => {
    const first = load();
    await first.crashReporting.setTelemetryEnabled(true);
    jest.resetModules();
    require("@react-native-firebase/app").getApps.mockReturnValue([]);
    const Firebase = require("@react-native-firebase/analytics");
    const crashReporting = require("../crashReporting");

    await crashReporting.setTelemetryEnabled(true);
    crashReporting.metric.count("sync.dropped");
    crashReporting.trackScreenView("Home");
    crashReporting.setTelemetryTag("app_mode", "online");

    expect(Firebase.getAnalytics).not.toHaveBeenCalled();
  });

  it("maps names and attributes onto what Firebase accepts", async () => {
    const { Firebase, crashReporting } = await telemetryOn();
    crashReporting.metric.count("auth.signin", 1, { attributes: { outcome: "ok" } });
    crashReporting.metric.count("sync.dropped", 3);
    crashReporting.trackFeature("workout", "recordSet", { mode: "online", outcome: "error" });
    crashReporting.metric.distribution("sync.run.duration", 250, { attributes: { queued: 2 } });
    crashReporting.trackScreenView("Friends/requests");

    expect(sent(Firebase)).toEqual([
      ["auth_signin", { outcome: "ok" }],
      ["sync_dropped", { value: 3 }],
      ["feature_use", { mode: "online", outcome: "error", feature: "workout", op: "recordSet" }],
      ["sync_run_duration", { queued: 2, value: 250 }],
    ]);
    expect(Firebase.logScreenView.mock.calls[0][1]).toEqual({
      screen_name: "Friends/requests",
      screen_class: "Friends/requests",
    });
  });

  it("always samples the first screen load, everything else at the trace rate", async () => {
    const { Sentry, crashReporting } = await telemetryOn();
    crashReporting.initCrashReporting();
    const { tracesSampler } = Sentry.init.mock.calls[0][0];
    const inheritOrSampleWith = (rate: number) => rate;

    expect(tracesSampler({ name: "Home", inheritOrSampleWith })).toBe(1);
    expect(tracesSampler({ name: "Plan", inheritOrSampleWith })).toBe(0.1);
  });

  it("times tracked spans as Firebase traces, stopping them when the work fails", async () => {
    const { crashReporting } = await telemetryOn();
    const Perf = require("@react-native-firebase/perf");
    const failing = crashReporting.trackSpan("healthConnect.sync", async () => {
      throw new Error("denied");
    }, { trigger: "manual", rows: 2.6 });

    await expect(failing).rejects.toThrow("denied");
    expect(Perf.trace.mock.calls[0][1]).toBe("healthConnect_sync");
    expect(Perf.span.putAttribute).toHaveBeenCalledWith("trigger", "manual");
    expect(Perf.span.putAttribute).toHaveBeenCalledWith("outcome", "error");
    expect(Perf.span.putMetric).toHaveBeenCalledWith("rows", 3);
    expect(Perf.span.stop).toHaveBeenCalledTimes(1);
  });

  it("runs tracked work untimed without telemetry consent", async () => {
    const { crashReporting } = load();
    const Perf = require("@react-native-firebase/perf");
    await expect(crashReporting.trackSpan("plan.import", async () => 7)).resolves.toBe(7);
    expect(Perf.trace).not.toHaveBeenCalled();
  });
});

describe("daysSinceBucket", () => {
  const now = Date.parse("2026-10-04T12:00:00Z");
  const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000;

  it.each([
    [null, "never"],
    [daysAgo(0.5), "0"],
    [daysAgo(1), "1"],
    [daysAgo(3), "2-3"],
    [daysAgo(7), "4-7"],
    [daysAgo(14), "8-14"],
    [daysAgo(30), "15-30"],
    [daysAgo(31), "30+"],
  ])("puts %p in %p", (lastAt, bucket) => {
    const { crashReporting } = load();
    expect(crashReporting.daysSinceBucket(lastAt, now)).toBe(bucket);
  });
});

describe("retention and workout shape", () => {
  const telemetryOn = async () => {
    const first = load();
    await first.crashReporting.setTelemetryEnabled(true);
    return load();
  };

  it("counts one open per calendar day, with days since the last workout", async () => {
    const { Firebase, crashReporting } = await telemetryOn();
    const morning = new Date(2026, 9, 4, 8).getTime();

    crashReporting.trackDailyOpen(morning);
    crashReporting.trackDailyOpen(morning + 60 * 60 * 1000);
    crashReporting.trackDailyOpen(morning + 24 * 60 * 60 * 1000);

    expect(Firebase.logEvent).toHaveBeenCalledTimes(2);
    expect(Firebase.logEvent.mock.calls[0].slice(1)).toEqual([
      "app_daily_open",
      { days_since_workout: "never" },
    ]);
  });

  it("logs a completed workout with its length and remembers when it was", async () => {
    const { Firebase, crashReporting } = await telemetryOn();
    crashReporting.trackWorkoutCompleted(Date.now() - 60_000, { sets: 12, exercises: 4, auto: false });

    const [, name, params] = Firebase.logEvent.mock.calls[0];
    expect(name).toBe("workout_completed");
    expect(params).toMatchObject({ sets: 12, exercises: 4, auto: "false" });
    expect(params.value).toBeGreaterThanOrEqual(60_000);
    expect(stored["@telemetry_last_workout_at"]).toBeDefined();
  });

  it("records nothing without telemetry consent", () => {
    const { Firebase, crashReporting } = load();
    crashReporting.trackDailyOpen();
    crashReporting.trackWorkoutCompleted(1_000, { sets: 1, exercises: 1, auto: false });
    expect(Firebase.logEvent).not.toHaveBeenCalled();
    expect(stored["@telemetry_last_workout_at"]).toBeUndefined();
  });
});

describe("console.error routing", () => {
  const original = console.error;
  afterEach(() => {
    console.error = original;
    jest.useRealTimers();
  });

  it("reports logged errors once, keeping a catch block's own labels", async () => {
    jest.useFakeTimers();
    console.error = jest.fn();
    const { Sentry, crashReporting } = load();
    await crashReporting.setCrashReportingEnabled(true);
    crashReporting.initCrashReporting();

    const labelled = new Error("labelled");
    console.error("Failed:", labelled);
    crashReporting.captureException(labelled, { stage: "load" });
    const logged = new Error("only logged");
    console.error("Failed:", logged);
    console.error("No session ID available");
    jest.runAllTimers();

    const calls = (Sentry.captureException as jest.Mock).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]).toEqual([labelled, { level: "error", extra: { stage: "load" } }]);
    expect(calls[1]).toEqual([logged, { level: "error", extra: { source: "console" } }]);
    expect(calls[2][0].message).toBe("No session ID available");
  });

  it("reports warnings only when an Error is attached, at warning level", async () => {
    jest.useFakeTimers();
    const originalWarn = console.warn;
    console.error = jest.fn();
    console.warn = jest.fn();
    try {
      const { Sentry, crashReporting } = load();
      await crashReporting.setCrashReportingEnabled(true);
      crashReporting.initCrashReporting();

      const failure = new Error("sync failed");
      console.warn("Set queued for sync");
      console.warn("Could not sync:", failure);
      jest.runAllTimers();

      expect((Sentry.captureException as jest.Mock).mock.calls).toEqual([
        [failure, { level: "warning", extra: { source: "console" } }],
      ]);
    } finally {
      console.warn = originalWarn;
    }
  });

  it("reports an error shown through userFacingError unless already reported", async () => {
    const { Sentry, crashReporting } = load();
    const { userFacingError, ApiError } = require("../apiError");
    await crashReporting.setCrashReportingEnabled(true);

    const shown = new Error("shown only");
    userFacingError(shown, "Failed");
    userFacingError(new ApiError("Invalid username or password", 401), "Failed");
    const labelled = new Error("labelled");
    crashReporting.captureException(labelled, { stage: "save" });
    userFacingError(labelled, "Failed");

    expect((Sentry.captureException as jest.Mock).mock.calls.map(([e]) => e)).toEqual([
      shown,
      labelled,
    ]);
  });

  it("skips refusals the user fixes and errors already reported", async () => {
    jest.useFakeTimers();
    const originalWarn = console.warn;
    console.error = jest.fn();
    console.warn = jest.fn();
    try {
      const { Sentry, crashReporting } = load();
      const { ApiError } = require("../apiError");
      await crashReporting.setCrashReportingEnabled(true);
      crashReporting.initCrashReporting();

      for (const status of [401, 403, 409, 429]) {
        crashReporting.captureException(new ApiError("refused", status));
        console.warn("Refused:", new ApiError("refused", status));
      }
      const serverError = new ApiError("broken", 500);
      crashReporting.captureException(serverError, { stage: "save" });
      await Promise.reject(serverError).catch(
        crashReporting.reportAndReturn(null, { stage: "fallback" }),
      );
      jest.runAllTimers();

      expect((Sentry.captureException as jest.Mock).mock.calls.map(([e]) => e)).toEqual([
        serverError,
      ]);
    } finally {
      console.warn = originalWarn;
    }
  });
});
