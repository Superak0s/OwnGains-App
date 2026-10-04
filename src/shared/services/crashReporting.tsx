import * as Sentry from "@sentry/react-native";
import { AppState } from "react-native";
import { GITHUB_BUILD } from "../distribution";
import { ApiError, ServerUnreachableError } from "./apiError";
import { takeMigrationFailure } from "./storageMigrations";
import {
  getStorageItemSync,
  setStorageItem,
  setStorageErrorHandler,
} from "./sqliteStorage";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
// Dev builds send nothing by default. Set this in .env to verify the DSN,
// transport and consent gates from the emulator without cutting a release APK.
// Such events are filed in the "development" environment, not "production".
const forceEnabled = process.env.EXPO_PUBLIC_SENTRY_FORCE_ENABLE === "true";

export const CRASH_REPORTING_KEY = "@crash_reporting_enabled";
export const TELEMETRY_KEY = "@telemetry_enabled";
export const PRIVACY_CONSENT_KEY = "@privacy_consent_seen";
export const DIAGNOSTICS_PROMPT_KEY = "@diagnostics_prompt_version";
// Bumping this asks every device about diagnostics once more.
const DIAGNOSTICS_PROMPT_VERSION = "2";

// Terms are accepted per account, but the two diagnostics switches belong to
// the device, so switching accounts doesn't ask for them again.
const userKey = (key: string, userId: string | null): string =>
  userId ? `${key}_user_${userId}` : key;

/** False until this user has answered the post-login privacy screen. */
export const hasPrivacyConsent = (userId: string | null = null): boolean =>
  getStorageItemSync(userKey(PRIVACY_CONSENT_KEY, userId)) === "true";

export const needsDiagnosticsPrompt = (): boolean =>
  getStorageItemSync(DIAGNOSTICS_PROMPT_KEY) !== DIAGNOSTICS_PROMPT_VERSION;

export const recordDiagnosticsPrompt = (): Promise<void> =>
  setStorageItem(DIAGNOSTICS_PROMPT_KEY, DIAGNOSTICS_PROMPT_VERSION);

/** True once this device has stored an explicit crash-reporting choice. */
export const hasCrashReportingPreference = (): boolean =>
  getStorageItemSync(CRASH_REPORTING_KEY) !== null;

// Read synchronously at module load: initCrashReporting() runs before the
// first render, and an opted-out user's very first crash must not be sent
// while an async preference read is still pending. Nothing is sent before the
// privacy screen has been answered at least once. Onboarding, login and
// signup all run before any account exists to ask.
let crashReportingEnabled =
  hasCrashReportingPreference() &&
  getStorageItemSync(CRASH_REPORTING_KEY) !== "false";
let telemetryEnabled = getStorageItemSync(TELEMETRY_KEY) === "true";

export const isCrashReportingEnabled = (): boolean => crashReportingEnabled;
export const isTelemetryEnabled = (): boolean => telemetryEnabled;

const storeChoice = (key: string, enabled: boolean): Promise<void> =>
  setStorageItem(key, enabled ? "true" : "false");

export const setCrashReportingEnabled = async (
  enabled: boolean,
): Promise<void> => {
  crashReportingEnabled = enabled;
  reportMigrationFailure();
  await storeChoice(CRASH_REPORTING_KEY, enabled);
  await matchNativeToConsent();
};

// The native SDK never sees beforeSend and is only configured at init, so a
// consent change restarts the client: a withdrawal must stop native reports,
// and a grant should catch Java/NDK crashes and ANRs from now on.
const matchNativeToConsent = async (): Promise<void> => {
  if (!sentryStarted || nativeEnabled === crashReportingEnabled) return;
  await Sentry.close();
  startSentry();
};

export const setTelemetryEnabled = async (enabled: boolean): Promise<void> => {
  telemetryEnabled = enabled;
  await storeChoice(TELEMETRY_KEY, enabled);
};

export const recordPrivacyConsent = (
  userId: string | null = null,
): Promise<void> => setStorageItem(userKey(PRIVACY_CONSENT_KEY, userId), "true");

/**
 * Loads the device's diagnostics choices into the live flags and returns
 * whether this account has answered the current privacy screen.
 */
export const applyPrivacyChoicesFor = (userId: string | null): boolean => {
  // Earlier versions cleared the device answer on sign-out and kept a copy
  // per account, so adopt that copy once.
  const read = (key: string): string | null => {
    const device = getStorageItemSync(key);
    if (device !== null || !userId) return device;
    const own = getStorageItemSync(userKey(key, userId));
    if (own !== null) void setStorageItem(key, own).catch(captureException);
    return own;
  };
  const crash = read(CRASH_REPORTING_KEY);
  crashReportingEnabled = crash !== null && crash !== "false";
  telemetryEnabled = read(TELEMETRY_KEY) === "true";
  reportMigrationFailure();
  void matchNativeToConsent().catch(captureException);
  return !userId || (hasPrivacyConsent(userId) && !needsDiagnosticsPrompt());
};

const reporting = (): boolean => Boolean(dsn) && crashReportingEnabled;
const telemetry = (): boolean => Boolean(dsn) && telemetryEnabled;

export type TelemetryAttributes = Record<string, string | number | boolean>;

// Screen transitions, time-to-initial-display and the navigation span that
// auto-instrumented HTTP spans hang off. Registered with the container in
// App.tsx.
export const navigationIntegration = Sentry.reactNavigationIntegration({
  enableTimeToInitialDisplay: true,
});

/** Wraps the root component for touch tracing and app-start instrumentation. */
export const wrapRoot = Sentry.wrap;

// Not sufficient on its own: GlitchTip overwrites user.ip_address with the
// connection's IP, so its reverse proxy must hide the client address.
const withoutIp = <T extends Sentry.Event>(event: T): T => ({
  ...event,
  user: { ...event.user, ip_address: null },
});

// Auto-instrumented fetch/HTTP spans include the full request URL, which contains
// the server host, record ids and query params. The policy promises "API
// paths ... never the request or response contents", so a span URL is reduced
// to a host-less, query-less path with numeric segments masked.
const pathTemplate = (url: string): string => {
  let path = url;
  const scheme = path.indexOf("://");
  if (scheme !== -1) path = path.slice(scheme + 3);
  const slash = path.indexOf("/");
  if (slash === -1) return "/";
  path = path.slice(slash);
  for (const marker of ["?", "#"]) {
    const at = path.indexOf(marker);
    if (at !== -1) path = path.slice(0, at);
  }
  return path
    .replace(/\/\d+(?=\/|$)/g, "/{id}")
    .replace(/\/(split|muscle|group)\/(?!(?:split|muscle|group)(?:\/|$))[^/]+/g, "/$1/{name}");
};

// Callers log `reason: error.message`, and a server error message can echo
// what the user typed.
export const scrubLog = <T extends { message: unknown; attributes?: Record<string, unknown> }>(
  entry: T,
): T => ({
  ...entry,
  message: typeof entry.message === "string" ? redactMessage(entry.message) : entry.message,
  attributes:
    entry.attributes &&
    Object.fromEntries(
      Object.entries(entry.attributes).map(([key, value]) => [
        key,
        typeof value === "string" ? redactMessage(value) : value,
      ]),
    ),
});

// The host, query string and fragment are dropped outright, not templated.
const DROPPED_SPAN_KEYS = new Set([
  "server.address",
  "http.query",
  "url.query",
  "http.fragment",
  "url.fragment",
]);

const scrubSpanData = <T extends Record<string, unknown>>(data: T = {} as T): T =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !DROPPED_SPAN_KEYS.has(key))
      .map(([key, value]) => [
        key,
        typeof value === "string" && value.includes("://")
          ? pathTemplate(value)
          : value,
      ]),
  ) as T;

export const scrubSpans = (spans: Sentry.Event["spans"]): Sentry.Event["spans"] =>
  spans?.map((span) => ({
    ...span,
    description:
      typeof span.description === "string" && span.description.includes("://")
        ? pathTemplate(span.description)
        : span.description,
    data: scrubSpanData(span.data),
  }));

export const scrubTransaction = <T extends Sentry.Event>(event: T): T =>
  withoutIp({
    ...event,
    spans: scrubSpans(event.spans),
    ...(event.contexts?.trace && {
      contexts: {
        ...event.contexts,
        trace: { ...event.contexts.trace, data: scrubSpanData(event.contexts.trace.data) },
      },
    }),
  });

const EXTRA_ALLOWED_KEYS = new Set([
  "stage",
  "op",
  "mode",
  "screen",
  "feature",
  "board",
  "subsystem",
  "mechanism",
  "source",
  "boundary",
  "type",
  "depth",
  "attempts",
  "migration",
  "code",
  "componentStack",
]);
const MAX_EXTRA_LENGTH = 100;
// Component names only, never user data, and a stack cut at 100 characters
// would stop at the component that threw.
const MAX_COMPONENT_STACK_LENGTH = 2000;
const MAX_MESSAGE_LENGTH = 200;

const redactMessage = (message: string): string =>
  message
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/[^\s@"'`]+@[^\s@"'`]+\.[a-z]{2,}/gi, "<email>")
    .replace(/"[^"]*"|'[^']*'|`[^`]*`|“[^”]*”/g, "<redacted>")
    .replace(/\d{2,}/g, "<n>")
    .slice(0, MAX_MESSAGE_LENGTH);

/**
 * The privacy policy promises reports contain no workout data. Server error
 * messages can echo exercise names, notes or usernames, so an ApiError is
 * reported by status and code only, any other message loses quoted text,
 * emails, URLs and numbers, and `extra` keeps only known label keys.
 */
export const scrubEvent = <T extends Sentry.Event>(
  event: T,
  hint?: { originalException?: unknown },
): T => {
  const original = hint?.originalException;
  const extra = Object.fromEntries(
    Object.entries(event.extra ?? {})
      .filter(([key]) => EXTRA_ALLOWED_KEYS.has(key))
      .map(([key, value]) => [
        key,
        typeof value === "string"
          ? value.slice(
              0,
              key === "componentStack"
                ? MAX_COMPONENT_STACK_LENGTH
                : MAX_EXTRA_LENGTH,
            )
          : value,
      ]),
  );
  const exception = event.exception?.values
    ? {
        ...event.exception,
        values: event.exception.values.map((value) => ({
          ...value,
          value:
            original instanceof ApiError
              ? `HTTP ${original.status}${original.code ? ` ${original.code}` : ""}`
              : value.value && redactMessage(value.value),
        })),
      }
    : event.exception;
  const message =
    typeof event.message === "string" ? redactMessage(event.message) : event.message;
  return withoutIp({ ...event, extra, exception, message });
};

const capturedErrors = new WeakSet<object>();

// Most catch blocks only log, so logged errors are reported. Deferred so a
// catch block's own captureException, which carries its labels, runs first and
// this copy is skipped. Warnings count only with an Error attached, since most
// string-only warnings are status lines. A server that is merely down is
// demoted to debug instead, or every screen would show a dev red box.
const routeConsole = (method: "error" | "warn"): void => {
  const original = console[method];
  console[method] = (...args: unknown[]) => {
    if (args.some((arg) => arg instanceof ServerUnreachableError)) {
      console.debug(...args);
      return;
    }
    original(...args);
    const error =
      args.find((arg) => arg instanceof Error) ??
      (method === "error" && typeof args[0] === "string"
        ? new Error(args[0])
        : undefined);
    if (!error) return;
    setTimeout(
      () =>
        captureUnreported(error, { source: "console" }, method === "warn" ? "warning" : "error"),
      0,
    );
  };
};

export const initCrashReporting = (): void => {
  routeConsole("error");
  routeConsole("warn");
  installUnhandledRejectionHandler();
  setStorageErrorHandler((error) => {
    metric.count("storage.error");
    captureException(error, { subsystem: "sqliteStorage" });
  });
  if (!dsn) {
    console.warn("EXPO_PUBLIC_SENTRY_DSN not set, crash reporting disabled");
    return;
  }
  startSentry();
  Sentry.setTag("channel", GITHUB_BUILD ? "github" : "play");
  reportMigrationFailure();
  trackDailyOpen();
  AppState.addEventListener("change", (state) => {
    if (state === "active") trackDailyOpen();
  });
};

const startSentry = (): void => {
  Sentry.init({
    dsn,
    enabled: !__DEV__ || forceEnabled,
    environment: __DEV__ ? "development" : "production",
    enableLogs: true,
    attachStacktrace: true,
    integrations: [navigationIntegration],
    enableNative: crashReportingEnabled,
    // Checked per event rather than at init so toggling the setting takes
    // effect immediately.
    beforeSend: (event, hint) =>
      crashReportingEnabled ? scrubEvent(event, hint) : null,
    beforeSendLog: (log) => (telemetryEnabled ? scrubLog(log) : null),
    beforeSendTransaction: (event) =>
      telemetryEnabled ? scrubTransaction(event) : null,
    tracesSampler: ({ attributes, inheritOrSampleWith }) => {
      if (attributes?.[ALWAYS_SAMPLE]) return 1;
      // The first screen load carries the app-start measurement, so every
      // launch's cold-start time is kept.
      if (!firstLoadSampled) {
        firstLoadSampled = true;
        return 1;
      }
      return inheritOrSampleWith(TRACE_SAMPLE_RATE);
    },
    // The backend is GlitchTip, which has no session tracking.
    enableAutoSessionTracking: false,
    // Logged errors are reported too, so a burst (a whole sync queue failing)
    // must not crowd a crash out of the default 30-envelope buffer.
    maxQueueSize: 100,
    enableUserInteractionTracing: telemetryEnabled,
    // Would send an event per failed request, carrying the full URL and
    // response body. Requests are instrumented explicitly instead.
    enableCaptureFailedRequests: false,
    sendDefaultPii: false,
    // Console and network breadcrumbs would put workout payloads, server
    // URLs and user identifiers into crash reports, which the privacy policy
    // promises they don't.
    beforeBreadcrumb: (breadcrumb) =>
      breadcrumb.category === "console" ||
      breadcrumb.category === "xhr" ||
      breadcrumb.category === "fetch"
        ? null
        : breadcrumb,
  });
  sentryStarted = true;
  nativeEnabled = crashReportingEnabled;
};

let sentryStarted = false;
let nativeEnabled = false;
let firstLoadSampled = false;

function reportMigrationFailure(): void {
  if (!sentryStarted || !reporting()) return;
  const failure = takeMigrationFailure();
  if (failure) {
    captureException(failure.error, {
      stage: "migration",
      migration: failure.step,
    });
  }
}

export const captureException = (
  error: unknown,
  attributes?: TelemetryAttributes,
  level: Sentry.SeverityLevel = "error",
): void => {
  if (typeof error === "object" && error !== null) capturedErrors.add(error);
  if (!reporting()) return;
  // Rejected credentials (401/403) and conflicts such as a taken username (409)
  // are the user's to fix, so they are not bugs wherever they are logged.
  if (error instanceof ApiError && [401, 403, 409, 429].includes(error.status)) return;
  if (error instanceof ServerUnreachableError) return;
  Sentry.captureException(error, { level, ...(attributes && { extra: attributes }) });
};

/**
 * A `.catch` handler that reports the error and resolves to `fallback`. A
 * storage failure was already reported by the storage error handler.
 */
export const reportAndReturn =
  <T,>(fallback: T, attributes?: TelemetryAttributes) =>
  (error: unknown): T => {
    captureUnreported(error, attributes);
    return fallback;
  };

/** Skips an error a catch block has already reported with its own labels. */
export const captureUnreported: typeof captureException = (error, ...rest) => {
  if (typeof error === "object" && error !== null && capturedErrors.has(error)) return;
  captureException(error, ...rest);
};

/**
 * Structured logs (Sentry Logs). Free-text only. Never interpolate workout
 * data, credentials or server URLs into the message or attributes.
 */
export const log = {
  warn: (message: string, attributes?: TelemetryAttributes): void => {
    if (telemetry()) Sentry.logger.warn(message, attributes);
  },
  error: (message: string, attributes?: TelemetryAttributes): void => {
    if (telemetry()) Sentry.logger.error(message, attributes);
  },
};

interface MetricOptions {
  unit?: string;
  attributes?: TelemetryAttributes;
}

const ALWAYS_SAMPLE = "owngains.always_sample";
// Every trace is kept while the app is in closed testing and volume is small.
const TRACE_SAMPLE_RATE = 1;

/**
 * GlitchTip ignores Sentry.metrics (`trace_metric` envelope items), but it
 * groups transactions by name and reports their count and duration
 * percentiles, so counts and timings are sent as root transactions named after
 * the metric (plus its `outcome`, the one label worth splitting on).
 */
const recordTransaction = (
  name: string,
  attributes: TelemetryAttributes = {},
  startedAt?: number,
): void => {
  if (!telemetry()) return;
  const label = attributes.outcome === undefined ? name : `${name}:${attributes.outcome}`;
  Sentry.startSpan(
    {
      name: label,
      op: "count",
      parentSpan: null,
      startTime: startedAt,
      attributes: { ...attributes, [ALWAYS_SAMPLE]: true },
    },
    () => undefined,
  );
};

// Values that are not durations have no transaction to ride on, so they are
// kept as logs, searchable by name with the number in `value`.
const logValue = (name: string, value: number, options?: MetricOptions): void => {
  if (telemetry()) Sentry.logger.info(name, { ...options?.attributes, value });
};

export const metric = {
  count: (name: string, value = 1, options?: MetricOptions): void => {
    recordTransaction(name, { ...options?.attributes, ...(value !== 1 && { value }) });
  },
  gauge: logValue,
  distribution: (name: string, value: number, options?: MetricOptions): void => {
    if (options?.unit === "millisecond") {
      recordTransaction(name, options.attributes, Date.now() - value);
    } else {
      logValue(name, value, options);
    }
  },
};

/** Counts one use of a feature. `op` must be a code identifier, never user data. */
export const trackFeature = (
  feature: string,
  op: string,
  attributes?: TelemetryAttributes,
): void => {
  recordTransaction(`feature:${feature}.${op}`, attributes);
};

/** Exact screen-view counts, because navigation traces are sampled and too thin for that. */
export const trackScreenView = (screen: string): void => {
  recordTransaction(`screen:${screen}`);
};

const LAST_OPEN_DAY_KEY = "@telemetry_last_open_day";
const LAST_WORKOUT_KEY = "@telemetry_last_workout_at";
const DAY_MS = 24 * 60 * 60 * 1000;

// Ranges rather than exact days, as the privacy policy describes.
export const daysSinceBucket = (lastAt: number | null, now: number): string => {
  if (lastAt === null || Number.isNaN(lastAt)) return "never";
  const days = Math.floor((now - lastAt) / DAY_MS);
  if (days <= 0) return "0";
  if (days === 1) return "1";
  if (days <= 3) return "2-3";
  if (days <= 7) return "4-7";
  if (days <= 14) return "8-14";
  if (days <= 30) return "15-30";
  return "30+";
};

const storedNumber = (key: string): number | null => {
  const raw = getStorageItemSync(key);
  return raw === null ? null : Number(raw);
};

/** Counts each calendar day the app is opened, for an estimate of daily active users. */
export const trackDailyOpen = (now = Date.now()): void => {
  if (!telemetry()) return;
  const today = new Date(now).toDateString();
  if (getStorageItemSync(LAST_OPEN_DAY_KEY) === today) return;
  void setStorageItem(LAST_OPEN_DAY_KEY, today);
  recordTransaction("app.daily_open", {
    days_since_workout: daysSinceBucket(storedNumber(LAST_WORKOUT_KEY), now),
  });
};

/** Spans the whole workout, so GlitchTip reports workout-length percentiles. */
export const trackWorkoutCompleted = (
  startedAt: number,
  attributes: { sets: number; exercises: number; auto: boolean },
): void => {
  if (!telemetry() || Number.isNaN(startedAt)) return;
  void setStorageItem(LAST_WORKOUT_KEY, String(Date.now()));
  recordTransaction("workout.completed", attributes, startedAt);
};

/**
 * Times `fn` as an always-sampled root transaction. As a child of the
 * navigation transaction it would share that transaction's sampling.
 */
export const trackSpan = <T,>(
  name: string,
  op: string,
  fn: () => Promise<T>,
  attributes?: TelemetryAttributes,
): Promise<T> =>
  telemetry()
    ? Sentry.startSpan(
        { name, op, parentSpan: null, attributes: { ...attributes, [ALWAYS_SAMPLE]: true } },
        fn,
      )
    : fn();

export interface SentryTestResult {
  dsn: boolean;
  /** False in a debug build unless EXPO_PUBLIC_SENTRY_FORCE_ENABLE is set. */
  sdkEnabled: boolean;
  crashReporting: boolean;
  telemetry: boolean;
  /** The transport drained within the timeout. False if nothing was sent. */
  flushed: boolean;
}

/**
 * Fires one event on every channel and waits for the transport to drain, so a
 * release build can prove reports actually leave the device. Lives here rather
 * than in the settings screen because the gate state it reports back (the
 * DSN and the two consent flags) is private to this module.
 */
export const sendTestEvent = async (): Promise<SentryTestResult> => {
  captureException(new Error("OwnGains Sentry test event"), {
    source: "settings_diagnostics",
  });
  log.error("diagnostics.test", { source: "settings_diagnostics" });
  metric.count("diagnostics.test");
  const sdkEnabled = Sentry.getClient()?.getOptions().enabled !== false;
  return {
    dsn: Boolean(dsn),
    sdkEnabled,
    crashReporting: crashReportingEnabled,
    telemetry: telemetryEnabled,
    flushed: Boolean(dsn) && sdkEnabled && (await Sentry.flush()),
  };
};

/** Pseudonymous id only, never username, email or profile fields. */
export const setUserContext = (userId: string | null): void => {
  Sentry.setUser(userId ? { id: userId } : null);
};

export const setTelemetryTag = (key: string, value: string): void => {
  Sentry.setTag(key, value);
};

export const trackBreadcrumb = (
  category: string,
  message: string,
  data?: TelemetryAttributes,
): void => {
  if (reporting()) Sentry.addBreadcrumb({ category, message, data });
};

// Sentry.init() replaces this tracker with its own, so it only runs in builds
// without a DSN, where unhandled rejections would otherwise go unlogged.
function installUnhandledRejectionHandler(): void {
  const hermesInternal = (globalThis as Record<string, unknown>)
    .HermesInternal as
    | {
        hasPromise?: () => boolean;
        enablePromiseRejectionTracker?: (options: {
          allRejections: boolean;
          onUnhandled: (id: number, error: unknown) => void;
        }) => void;
      }
    | undefined;

  if (
    !hermesInternal?.hasPromise?.() ||
    !hermesInternal.enablePromiseRejectionTracker
  ) {
    return;
  }

  hermesInternal.enablePromiseRejectionTracker({
    allRejections: true,
    onUnhandled: (_id, error) => {
      console.error("Unhandled promise rejection:", error);
      captureException(error, { mechanism: "unhandled_rejection" });
    },
  });
}
