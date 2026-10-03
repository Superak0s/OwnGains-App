import * as Sentry from "@sentry/react-native";
import { ApiError } from "./apiError";
import { takeMigrationFailure } from "./storageMigrations";
import {
  getStorageItemSync,
  setStorageItem,
  removeStorageItem,
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

// Consent is per account, not per device: a second user signing in on the same
// phone has never answered the screen.
const userKey = (key: string, userId: string | null): string =>
  userId ? `${key}_user_${userId}` : key;

/** False until this user has answered the post-login privacy screen. */
export const hasPrivacyConsent = (userId: string | null = null): boolean =>
  getStorageItemSync(userKey(PRIVACY_CONSENT_KEY, userId)) === "true";

/** True once the privacy screen has stored an explicit crash-reporting choice. */
const hasCrashReportingPreference = (): boolean =>
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

let currentUserId: string | null = null;

// The unscoped key is what the next cold start reads before anyone signs in.
const storeChoice = async (key: string, enabled: boolean): Promise<void> => {
  const value = enabled ? "true" : "false";
  await setStorageItem(key, value);
  if (currentUserId) await setStorageItem(userKey(key, currentUserId), value);
};

export const setCrashReportingEnabled = async (
  enabled: boolean,
): Promise<void> => {
  const withdrawn = crashReportingEnabled && !enabled;
  crashReportingEnabled = enabled;
  reportMigrationFailure();
  await storeChoice(CRASH_REPORTING_KEY, enabled);
  // The native SDK was started with consent and never sees beforeSend, so a
  // withdrawal restarts the client without it.
  if (withdrawn && sentryStarted) {
    await Sentry.close();
    startSentry();
  }
};

/** Signing out: the next person to sign in on this device has not consented. */
export const forgetPrivacyChoices = async (): Promise<void> => {
  // Accounts from before per-account switches only have the device-wide answer.
  if (currentUserId) {
    for (const [key, value] of [
      [CRASH_REPORTING_KEY, crashReportingEnabled],
      [TELEMETRY_KEY, telemetryEnabled],
    ] as const)
      if (getStorageItemSync(userKey(key, currentUserId)) === null)
        await setStorageItem(userKey(key, currentUserId), String(value));
  }
  const wasNative = crashReportingEnabled;
  currentUserId = null;
  crashReportingEnabled = false;
  telemetryEnabled = false;
  await removeStorageItem(CRASH_REPORTING_KEY);
  await removeStorageItem(TELEMETRY_KEY);
  // The native SDK keeps reporting until restarted without consent.
  if (wasNative && sentryStarted) {
    await Sentry.close();
    startSentry();
  }
};

export const setTelemetryEnabled = async (enabled: boolean): Promise<void> => {
  telemetryEnabled = enabled;
  await storeChoice(TELEMETRY_KEY, enabled);
};

export const recordPrivacyConsent = (
  userId: string | null = null,
): Promise<void> => setStorageItem(userKey(PRIVACY_CONSENT_KEY, userId), "true");

/**
 * Loads this account's own answers into the live consent flags and returns
 * whether it has answered the privacy screen. An account that hasn't sends
 * nothing until it does, whatever an earlier account on the device chose.
 */
export const applyPrivacyChoicesFor = (userId: string | null): boolean => {
  currentUserId = userId;
  if (userId && !hasPrivacyConsent(userId)) {
    crashReportingEnabled = false;
    telemetryEnabled = false;
    return false;
  }
  // Accounts that consented before the switches were per account only have
  // the device-wide answer.
  const read = (key: string): string | null =>
    getStorageItemSync(userKey(key, userId)) ?? getStorageItemSync(key);
  const crash = read(CRASH_REPORTING_KEY);
  crashReportingEnabled = crash !== null && crash !== "false";
  telemetryEnabled = read(TELEMETRY_KEY) === "true";
  reportMigrationFailure();
  return true;
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

export const initCrashReporting = (): void => {
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
  reportMigrationFailure();
};

const startSentry = (): void => {
  Sentry.init({
    dsn,
    enabled: !__DEV__ || forceEnabled,
    environment: __DEV__ ? "development" : "production",
    enableLogs: true,
    attachStacktrace: true,
    integrations: [navigationIntegration],
    // The native SDK never sees beforeSend, so Java/NDK crashes and ANRs would
    // bypass consent. They are only captured if consent was on at launch.
    enableNative: crashReportingEnabled,
    // Checked per event rather than at init so toggling the setting takes
    // effect immediately. The `enable*` options are read once here, so those
    // parts only change on the next launch.
    beforeSend: (event, hint) =>
      crashReportingEnabled ? scrubEvent(event, hint) : null,
    beforeSendLog: (log) => (telemetryEnabled ? scrubLog(log) : null),
    beforeSendTransaction: (event) =>
      telemetryEnabled ? scrubTransaction(event) : null,
    beforeSendMetric: (metric) => (telemetryEnabled ? metric : null),
    tracesSampleRate: 0.1,
    // The backend is GlitchTip, which has no session tracking.
    enableAutoSessionTracking: false,
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
};

let sentryStarted = false;

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
): void => {
  if (!reporting()) return;
  if (error instanceof ApiError && error.status === 429) return;
  Sentry.captureException(
    error,
    attributes ? { extra: attributes } : undefined,
  );
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

export const metric = {
  count: (name: string, value = 1, options?: MetricOptions): void => {
    if (telemetry()) Sentry.metrics.count(name, value, options);
  },
  gauge: (name: string, value: number, options?: MetricOptions): void => {
    if (telemetry()) Sentry.metrics.gauge(name, value, options);
  },
  distribution: (
    name: string,
    value: number,
    options?: MetricOptions,
  ): void => {
    if (telemetry()) Sentry.metrics.distribution(name, value, options);
  },
};

/** Counts one use of a feature. `op` must be a code identifier, never user data. */
export const trackFeature = (
  feature: string,
  op: string,
  attributes?: TelemetryAttributes,
): void => {
  metric.count("feature.used", 1, { attributes: { ...attributes, feature, op } });
};

/** Exact screen-view counts, because navigation traces are sampled and too thin for that. */
export const trackScreenView = (screen: string): void => {
  metric.count("screen.view", 1, { attributes: { screen } });
};

/** Times `fn` as a span and records it as a `<op>.duration` distribution. */
export const trackSpan = async <T,>(
  name: string,
  op: string,
  fn: () => Promise<T>,
  attributes?: TelemetryAttributes,
): Promise<T> => {
  if (!telemetry()) return fn();
  const started = Date.now();
  try {
    return await Sentry.startSpan({ name, op, attributes }, fn);
  } finally {
    metric.distribution(`${op}.duration`, Date.now() - started, {
      unit: "millisecond",
      attributes: { ...attributes, name },
    });
  }
};

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

// Sentry's own rejection tracker only attaches once Sentry.init() runs (i.e.
// only when a DSN is configured), so unhandled rejections would otherwise go
// completely unlogged whenever the DSN is missing. Hermes' native tracker is
// a backstop that always logs, independent of Sentry being configured.
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
