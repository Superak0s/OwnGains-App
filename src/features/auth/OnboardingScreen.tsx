// OwnGains runs no service of its own, so the storage choice has to be made
// before anything else: a server someone hosts, or this device alone.

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import {
  getAppModeSync,
  setAppMode,
  setOnboardingComplete,
  type AppMode,
} from "@shared/services/appMode";
import { useAuth } from "@shared/context/AuthContext";
import { captureException } from "@shared/services/crashReporting";
import type { RootStackParamList } from "@shared/types";

type OnboardingScreenProps = {
  readonly navigation: NativeStackNavigationProp<
    RootStackParamList,
    "Onboarding"
  >;
};

const CHOICES: ReadonlyArray<{
  mode: AppMode;
  icon: string;
  title: string;
  body: string;
}> = [
  {
    mode: "offline",
    icon: "📴",
    title: "Keep it on this device",
    body: "Everything is stored on your phone, with no account and no server. You can export or back it up whenever you like.",
  },
  {
    mode: "online",
    icon: "🌐",
    title: "Connect to a server",
    body: "Sync workouts across devices and train with friends. Use the official OwnGains server, which keeps body tracking on your phone, or a server you or a friend host. Whoever runs a self-hosted server controls the data on it.",
  },
];

export default function OnboardingScreen({
  navigation,
}: OnboardingScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { isAuthenticated, logout } = useAuth();
  const { alert, AlertComponent } = useAlert();
  const [pending, setPending] = useState<AppMode | null>(null);
  const [failed, setFailed] = useState(false);
  const currentMode = useMemo(() => getAppModeSync(), []);
  // Reached from Settings rather than first launch: there is a session behind
  // this screen, so it must not be a one-way door.
  const canCancel = isAuthenticated;

  const commit = useCallback(
    async (mode: AppMode): Promise<void> => {
      setPending(mode);
      setFailed(false);
      try {
        // AuthContext listens on this: offline auto-connects a local profile,
        // online drops the session so a real login is required.
        await setAppMode(mode);
        // Re-picking the mode already in effect is a no-op in setAppMode, so
        // AuthContext never drops the session and the app silently rejoins the
        // previous server, the one thing this screen was opened to change.
        if (mode === "online" && currentMode === "online" && isAuthenticated) {
          await logout();
        }
        // Lifts the onboarding gate, so it has to come after the mode write.
        // Otherwise a failed write leaves the user with no mode set.
        await setOnboardingComplete(true);
      } catch (error) {
        // Local storage is unreachable, which breaks far more than onboarding.
        // Remain here so the tap can be retried, and say so. This is the first
        // screen of the app, with nothing else on it to fall back to.
        captureException(error, { stage: "onboardingSaveMode" });
        setFailed(true);
      } finally {
        setPending(null);
      }
    },
    [currentMode, isAuthenticated, logout],
  );

  const choose = useCallback(
    (mode: AppMode): void => {
      // Leaving offline mode does not delete anything, but the local profile
      // and its workouts become unreachable until the mode is switched back,
      // which is not obvious from a screen that only talks about storage.
      if (currentMode === "offline" && mode === "online") {
        alert(
          "Keep your on-device data?",
          "Your local profile and everything logged against it remain on this phone, but they are not visible while you are signed in to a server, and they are not copied over. Switch back to on-device storage any time to see them again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Connect to a server", onPress: () => void commit(mode) },
          ],
        );
        return;
      }
      void commit(mode);
    },
    [alert, commit, currentMode],
  );

  const cancel = useCallback((): void => {
    void setOnboardingComplete(true);
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.logo}>💪</Text>
        <Text style={styles.title}>OwnGains</Text>
        <Text style={styles.tagline}>
          A workout tracker you own. Pick how you want to store your training.
          You can change this later in Settings.
        </Text>

        {CHOICES.map((choice) => (
          <TouchableOpacity
            key={choice.mode}
            style={[styles.card, pending !== null && styles.cardDisabled]}
            onPress={() => choose(choice.mode)}
            disabled={pending !== null}
            accessibilityRole='button'
            accessibilityLabel={
              choice.mode === currentMode
                ? `${choice.title} (currently in use)`
                : choice.title
            }
            accessibilityHint={choice.body}
            accessibilityState={{ disabled: pending !== null }}
          >
            {pending === choice.mode ? (
              <ActivityIndicator style={styles.cardSpinner} color={colors.accent} />
            ) : (
              <Text style={styles.cardIcon}>{choice.icon}</Text>
            )}
            <View style={styles.cardTextWrap}>
              <Text style={styles.cardTitle}>
                {choice.title}
                {choice.mode === currentMode && (
                  <Text style={styles.currentBadge}>  · in use now</Text>
                )}
              </Text>
              <Text style={styles.cardBody}>{choice.body}</Text>
            </View>
          </TouchableOpacity>
        ))}

        {failed && (
          <Text style={styles.error} accessibilityLiveRegion='assertive'>
            OwnGains could not save that choice because its local storage is
            unreachable. Tap again to retry. If it keeps failing, restarting the
            app usually clears it.
          </Text>
        )}

        {canCancel && (
          <TouchableOpacity
            onPress={cancel}
            disabled={pending !== null}
            style={styles.cancelButton}
            accessibilityRole='button'
            accessibilityLabel='Keep the current storage mode and go back'
          >
            <Text style={styles.cancelText}>Never mind, keep using {currentMode === "offline" ? "on-device storage" : "the server"}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={() => navigation.navigate("PrivacyPolicy")}
          accessibilityRole='link'
          accessibilityLabel='Read the privacy policy'
        >
          <Text style={styles.policyLink}>Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate("TermsOfService")}
          accessibilityRole='link'
          accessibilityLabel='Read the terms of service'
        >
          <Text style={styles.policyLink}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={[styles.cardBody, { textAlign: "center", marginTop: 14 }]}>
          OwnGains is a tracking tool, not medical advice.
        </Text>
      </ScrollView>
      {AlertComponent}
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
      alignItems: "flex-start",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderRadius: 16,
      padding: 18,
      marginBottom: 14,
    },
    cardDisabled: { opacity: 0.6 },
    cardIcon: { fontSize: 26, marginRight: 14 },
    cardSpinner: { width: 26, marginRight: 14 },
    error: {
      fontSize: 13,
      lineHeight: 19,
      color: colors.error,
      textAlign: "center",
      marginTop: 4,
      marginBottom: 8,
    },
    cardTextWrap: { flex: 1 },
    cardTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    cardBody: { fontSize: 13, lineHeight: 19, color: colors.textSecondary },
    currentBadge: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.accent,
    },
    cancelButton: { minHeight: 44, justifyContent: "center" },
    cancelText: {
      fontSize: 14,
      textAlign: "center",
      color: colors.textSecondary,
      marginTop: 6,
    },
    policyLink: {
      fontSize: 13,
      textAlign: "center",
      color: colors.accent,
      marginTop: 14,
      textDecorationLine: "underline",
    },
  });
