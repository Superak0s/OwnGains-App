// Shown after an account's first sign-in in either app mode, whenever the Terms
// change, and once per device for each diagnostics prompt version. A switch starts
// on only if the user turned it on before: a pre-ticked box is not consent under GDPR.

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
  needsDiagnosticsPrompt,
  recordDiagnosticsPrompt,
} from "@shared/services/crashReporting";
import { restartOnboarding } from "@shared/services/appMode";
import { getServerUrl, isOfficialServer } from "@shared/services/config";
import { getServerStoredFeatures } from "@shared/services/localOnlyFeatures";
import {
  hasAcceptedCurrentTerms,
  hasAcceptedEarlierTerms,
  needsHealthConsent,
  recordTermsAcceptance,
  TERMS_VERSION,
} from "./termsAcceptance";
import { authService } from "./services";
import { userFacingError } from "@shared/services/apiError";
import type { RootStackParamList } from "@shared/types";
import { useAuth } from "@shared/context/AuthContext";
import { makeIntroStyles } from "./OnboardingScreen";

const STORAGE_FAILURE =
  "Your choices could not be saved because OwnGains's local storage is unreachable. Tap Continue to retry. If it keeps failing, restarting the app usually clears it.";
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
  const [termsNeeded] = useState(
    () =>
      userId === null ||
      !hasAcceptedCurrentTerms(userId, user?.termsVersion, user?.healthConsentAt),
  );
  const termsChanged =
    termsNeeded && userId !== null && hasAcceptedEarlierTerms(userId);
  const healthRequired = termsNeeded && needsHealthConsent();
  const [askDiagnostics] = useState(needsDiagnosticsPrompt);
  const [showSettings, setShowSettings] = useState(false);
  const [crashReports, setCrashReports] = useState(isCrashReportingEnabled);
  const [telemetry, setTelemetry] = useState(isTelemetryEnabled);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [healthConsent, setHealthConsent] = useState(false);
  const canContinue =
    !termsNeeded || (termsAccepted && (healthConsent || !healthRequired));
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const serverHost = getServerUrl().replace(/^\w+:\/\//, "").replace(/\/.*$/, "");
  const operator =
    isOfficialServer()
      ? "run by the OwnGains developer in Greece"
      : "run by whoever operates it, not the OwnGains developer";
  const serverFeatures = getServerStoredFeatures();
  const storedData = [
    "your workouts, sets, weights and notes",
    ...(serverFeatures ?? []).map((f) => HEALTH_FEATURE_DATA[f] ?? f),
  ].join(", plus ");

  const confirm = useCallback(async (
    preset?: { crash: boolean; telemetry: boolean },
  ): Promise<void> => {
    setSaving(true);
    setFailure(null);
    if (preset) {
      setCrashReports(preset.crash);
      setTelemetry(preset.telemetry);
    }
    try {
      await setCrashReportingEnabled(preset?.crash ?? crashReports);
      await setTelemetryEnabled(preset?.telemetry ?? telemetry);
      // Last: a failed write above must leave the screen reachable again.
      if (termsNeeded) {
        await authService.recordConsent(TERMS_VERSION, healthConsent);
        if (userId) await recordTermsAcceptance(userId, healthConsent);
      }
      if (askDiagnostics) await recordDiagnosticsPrompt();
      await recordPrivacyConsent(userId);
      onDone();
    } catch (error) {
      captureException(error, { stage: "savePrivacyConsent" });
      setFailure(userFacingError(error, STORAGE_FAILURE));
      setSaving(false);
    }
  }, [crashReports, telemetry, healthConsent, onDone, userId, termsNeeded, askDiagnostics]);

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

  let heading = "Help improve OwnGains";
  if (termsChanged) heading = "Updated terms";
  else if (termsNeeded) heading = "Before you start";

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>🔒</Text>
        <Text style={styles.title}>
          {heading}
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
          OwnGains can send crash reports to the developer's self-hosted
          crash-report server and usage metrics to Google Analytics for Firebase,
          so bugs get found and fixed. This applies in offline mode too.
          Nothing here includes your workouts, notes, email or server address,
          and you can change either choice later in Settings → Privacy and Data.
        </Text>

        {showSettings && (
        <>
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
            thumbColor={crashReports ? colors.textOnAccent : colors.textMuted}
            accessibilityLabel='Send crash reports'
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardTextWrap}>
            <Text style={styles.cardTitle}>Usage metrics and diagnostics</Text>
            <Text style={styles.cardBody}>
              Which screens and features you open, whether syncs succeed, how
              long your workouts last and how fast the app starts, sent to
              Google Firebase. Screen timings and diagnostic logs go to the
              crash-report server. Never exercise names, weights or notes. Off
              unless you turn it on.
            </Text>
          </View>
          <Switch
            value={telemetry}
            onValueChange={setTelemetry}
            trackColor={{ false: colors.surfaceBorder, true: colors.accent }}
            thumbColor={telemetry ? colors.textOnAccent : colors.textMuted}
            accessibilityLabel='Send usage metrics and diagnostics'
          />
        </View>
        </>
        )}
        </>
        )}

        {termsNeeded &&
          checkbox(
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

        {failure && (
          <Text style={styles.error} accessibilityLiveRegion='assertive'>
            {failure}
          </Text>
        )}

        {saving && <ActivityIndicator color={colors.accent} />}

        {askDiagnostics && (
          <>
            {/* A refusal that is hard to see invalidates consent, so every choice stays a full-size, readable button. */}
            {(
              [
                [true, true, "Accept all", "Allow crash reports and usage metrics, then continue", null],
                [true, false, "Necessary only", "Allow crash reports only, then continue", "outline"],
                [false, false, "Reject all", "Turn off crash reports and usage metrics, then continue", "neutral"],
              ] as const
            ).map(([crash, metrics, text, label, variant]) => (
              <TouchableOpacity
                key={text}
                style={[
                  styles.button,
                  variant === "outline" && styles.buttonSecondary,
                  variant === "neutral" && styles.buttonNeutral,
                  (saving || !canContinue) && styles.buttonDisabled,
                ]}
                onPress={() => void confirm({ crash, telemetry: metrics })}
                disabled={saving || !canContinue}
                accessibilityRole='button'
                accessibilityLabel={label}
                accessibilityState={{ disabled: saving || !canContinue }}
              >
                <Text
                  style={[
                    styles.buttonText,
                    variant === "outline" && styles.buttonSecondaryText,
                    variant === "neutral" && styles.buttonNeutralText,
                  ]}
                >
                  {text}
                </Text>
              </TouchableOpacity>
            ))}
          </>
        )}

        {(!askDiagnostics || showSettings) && (
          <TouchableOpacity
            style={[
              styles.button,
              askDiagnostics && styles.buttonSecondary,
              (saving || !canContinue) && styles.buttonDisabled,
            ]}
            onPress={() => void confirm()}
            disabled={saving || !canContinue}
            accessibilityRole='button'
            accessibilityLabel='Save these choices and continue'
            accessibilityState={{ disabled: saving || !canContinue }}
          >
            <Text
              style={[
                styles.buttonText,
                askDiagnostics && styles.buttonSecondaryText,
              ]}
            >
              {askDiagnostics ? "Save my choices" : "Continue"}
            </Text>
          </TouchableOpacity>
        )}

        {askDiagnostics && !showSettings && (
          <TouchableOpacity
            onPress={() => setShowSettings(true)}
            accessibilityRole='button'
            accessibilityLabel='Choose crash reports and usage metrics separately'
          >
            <Text style={styles.policyLink}>Settings</Text>
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
        {termsNeeded && (
          <TouchableOpacity
            onPress={() => void logout()}
            accessibilityRole='button'
            accessibilityLabel="I don't agree, sign out"
          >
            <Text style={styles.policyLink}>I don't agree, sign out</Text>
          </TouchableOpacity>
        )}
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
    ...makeIntroStyles(colors),
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
    buttonNeutral: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    buttonNeutralText: { color: colors.textPrimary },
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
      color: colors.textOnAccent,
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
