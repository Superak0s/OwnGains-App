// Shown after an account's first sign-in in either app mode, and again whenever
// the Terms change. The diagnostics switches are asked once per device. Every
// switch and box starts off: a pre-ticked box is not affirmative consent under GDPR.

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import {
  setCrashReportingEnabled,
  setTelemetryEnabled,
  recordPrivacyConsent,
  captureException,
  isCrashReportingEnabled,
  isTelemetryEnabled,
  hasCrashReportingPreference,
} from "@shared/services/crashReporting";
import { restartOnboarding } from "@shared/services/appMode";
import { getServerUrl } from "@shared/services/config";
import { getServerStoredFeatures } from "@shared/services/localOnlyFeatures";
import {
  hasAcceptedEarlierTerms,
  needsHealthConsent,
  recordTermsAcceptance,
  TERMS_VERSION,
} from "./termsAcceptance";
import { authService } from "./services";
import type { RootStackParamList } from "@shared/types";
import { useAuth } from "@shared/context/AuthContext";

const OFFICIAL_SERVER_HOST = "owngains.superak0s.com";
const CONTACT_EMAIL = "kostissuperak0s@gmail.com";
const HEALTH_FEATURE_DATA: Record<string, string> = {
  tracking:
    "your body stats, measurements, nutrition, hydration, soreness, injuries, menstrual cycle, personal notes and progress photos",
  supplements: "your supplement logs",
};

type PrivacyConsentScreenProps = {
  readonly navigation: NativeStackNavigationProp<
    RootStackParamList,
    "PrivacyConsent"
  >;
  readonly onDone: () => void;
};

export default function PrivacyConsentScreen({
  navigation,
  onDone,
}: PrivacyConsentScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, logout } = useAuth();
  const userId = user?.id == null ? null : String(user.id);
  const termsChanged = userId !== null && hasAcceptedEarlierTerms(userId);
  const healthRequired = needsHealthConsent();
  const [askDiagnostics] = useState(() => !hasCrashReportingPreference());
  const [crashReports, setCrashReports] = useState(isCrashReportingEnabled);
  const [telemetry, setTelemetry] = useState(isTelemetryEnabled);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);
  const canContinue = termsAccepted && (healthConsent || !healthRequired);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const serverHost = getServerUrl().replace(/^\w+:\/\//, "").replace(/\/.*$/, "");
  const operator =
    serverHost === OFFICIAL_SERVER_HOST
      ? "run by the OwnGains developer in Greece"
      : "run by whoever operates it, not the OwnGains developer";
  const serverFeatures = getServerStoredFeatures();
  const storedData = [
    "your workouts, sets, weights, programs and notes",
    ...(serverFeatures ?? []).map((f) => HEALTH_FEATURE_DATA[f] ?? f),
  ].join(", plus ");

  const confirm = useCallback(async (allowBoth = false): Promise<void> => {
    setSaving(true);
    setFailed(false);
    if (allowBoth) {
      setCrashReports(true);
      setTelemetry(true);
    }
    try {
      await setCrashReportingEnabled(allowBoth || crashReports);
      await setTelemetryEnabled(allowBoth || telemetry);
      // Last: a failed write above must leave the screen reachable again.
      await authService.recordConsent(TERMS_VERSION, healthConsent);
      if (userId) await recordTermsAcceptance(userId, healthConsent);
      await recordPrivacyConsent(userId);
      onDone();
    } catch (error) {
      captureException(error);
      setFailed(true);
      setSaving(false);
    }
  }, [crashReports, telemetry, healthConsent, onDone, userId]);

  const checkbox = (
    checked: boolean,
    toggle: (value: boolean) => void,
    label: string,
    body: React.ReactNode,
  ): React.JSX.Element => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => toggle(!checked)}
      accessibilityRole='checkbox'
      accessibilityState={{ checked }}
      accessibilityLabel={label}
    >
      <Text style={styles.checkbox}>{checked ? "☑" : "☐"}</Text>
      <View style={styles.cardTextWrap}>{body}</View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.title}>
          {termsChanged ? "Updated terms" : "Before you start"}
        </Text>
        {termsChanged && (
          <Text style={styles.tagline}>
            The Terms of Service have changed since you last agreed to them.
            Please read and accept the new version to keep using OwnGains.
          </Text>
        )}
        {askDiagnostics && (
        <>
        <Text style={styles.tagline}>
          OwnGains can send diagnostics to the developer's self-hosted crash-report
          server so bugs get found and fixed. This applies in offline mode too.
          Nothing here includes your workouts, notes, email or server address,
          and you can change either switch later in Settings → Privacy and Data.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Crash reports</Text>
            <Text style={styles.cardBody}>
              When the app crashes or hits an error, send the error message, the
              stack trace and your device and app version, tagged with your
              account ID so repeat crashes can be grouped.
            </Text>
          </View>
          <Switch
            value={crashReports}
            onValueChange={setCrashReports}
            trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
            thumbColor={crashReports ? colors.surface : colors.surfaceElevated}
            accessibilityLabel='Send crash reports'
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Usage metrics and diagnostics</Text>
            <Text style={styles.cardBody}>
              Counters, timings, performance traces and diagnostic logs: which
              screens and features you open, which are slow, whether syncs
              succeed. Never what you log. Off unless you turn it on.
            </Text>
          </View>
          <Switch
            value={telemetry}
            onValueChange={setTelemetry}
            trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
            thumbColor={telemetry ? colors.surface : colors.surfaceElevated}
            accessibilityLabel='Send usage metrics and diagnostics'
          />
        </View>
        </>
        )}

        {checkbox(
          termsAccepted,
          setTermsAccepted,
          "I am 16 or older and agree to the Terms of Service",
          <>
            <Text style={styles.cardTitle}>Terms of Service</Text>
            <Text style={styles.cardBody}>
              I am 16 or older, and I have read and agree to the{" "}
              <Text
                style={styles.inlineLink}
                onPress={() => navigation.navigate("TermsOfService")}
                accessibilityRole='link'
              >
                Terms of Service
              </Text>
              .
            </Text>
          </>,
        )}

        {healthRequired &&
          checkbox(
            healthConsent,
            setHealthConsent,
            `I consent to ${serverHost} storing my health-related data`,
            <>
              <Text style={styles.cardTitle}>Health data on the server</Text>
              <Text style={styles.cardBody}>
                {serverHost} ({operator}) will store {storedData}. These can
                reveal information about your health. I explicitly consent to
                this server storing them to sync my account. Withdraw it any
                time under Settings → Privacy and Data, which deletes them from
                the server, or by deleting your account.
              </Text>
            </>,
          )}

        {failed && (
          <Text style={styles.error} accessibilityLiveRegion='assertive'>
            Your choices could not be saved because OwnGains's local storage is
            unreachable. Tap Continue to retry. If it keeps failing, restarting
            the app usually clears it.
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.button,
            (saving || !canContinue) && styles.buttonDisabled,
          ]}
          onPress={() => void confirm()}
          disabled={saving || !canContinue}
          accessibilityRole='button'
          accessibilityLabel='Save these choices and continue'
          accessibilityState={{ disabled: saving || !canContinue }}
        >
          {saving ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.buttonText}>Continue</Text>
          )}
        </TouchableOpacity>

        {askDiagnostics && (
          <TouchableOpacity
            style={[
              styles.button,
              styles.buttonSecondary,
              (saving || !canContinue) && styles.buttonDisabled,
            ]}
            onPress={() => void confirm(true)}
            disabled={saving || !canContinue}
            accessibilityRole='button'
            accessibilityLabel='Allow crash reports and usage metrics, then continue'
            accessibilityState={{ disabled: saving || !canContinue }}
          >
            <Text style={[styles.buttonText, styles.buttonSecondaryText]}>
              Allow both and continue
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => navigation.navigate("PrivacyPolicy")}
          accessibilityRole='link'
          accessibilityLabel='Read the privacy policy'
        >
          <Text style={styles.policyLink}>Privacy Policy</Text>
        </TouchableOpacity>
        {healthRequired && (
          <TouchableOpacity
            onPress={() => void restartOnboarding()}
            accessibilityRole='button'
            accessibilityLabel='Keep data on this device instead of a server'
          >
            <Text style={styles.policyLink}>
              Keep everything on this device instead
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={() => void logout()}
          accessibilityRole='button'
          accessibilityLabel="I don't agree, sign out"
        >
          <Text style={styles.policyLink}>I don't agree, sign out</Text>
        </TouchableOpacity>
        {termsChanged && healthRequired && (
          <Text style={styles.footnote}>
            Signing out leaves your account as it is. To get a copy of your
            data or have your account deleted without accepting, email{" "}
            {CONTACT_EMAIL}.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: {
      flexGrow: 1,
      justifyContent: "center",
      paddingHorizontal: 24,
      paddingVertical: 32,
    },
    logo: { fontSize: 56, textAlign: "center" },
    title: {
      fontSize: 30,
      fontWeight: "800",
      textAlign: "center",
      color: colors.textPrimary,
      marginTop: 8,
    },
    tagline: {
      fontSize: 15,
      lineHeight: 22,
      textAlign: "center",
      color: colors.textSecondary,
      marginTop: 12,
      marginBottom: 28,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
    },
    cardTextWrap: { flex: 1, marginRight: 14 },
    checkbox: { fontSize: 24, color: colors.accent, marginRight: 14 },
    inlineLink: { color: colors.accent, textDecorationLine: "underline" },
    cardTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    cardBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
    button: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 14,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonSecondary: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    buttonSecondaryText: { color: colors.accent },
    error: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.error,
      textAlign: "center",
      marginTop: 4,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: "700",
      textAlign: "center",
      color: colors.surface,
    },
    footnote: {
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
      color: colors.textSecondary,
      marginTop: 10,
    },
    policyLink: {
      fontSize: 13,
      textAlign: "center",
      color: colors.accent,
      marginTop: 14,
      textDecorationLine: "underline",
    },
  });
