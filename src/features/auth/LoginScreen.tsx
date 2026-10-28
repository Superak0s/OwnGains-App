import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type TextInputInstance,
} from "react-native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import { useAlert } from "@shared/components/CustomAlert";
import {
  getServerUrl,
  onServerUrlChange,
  setServerUrl,
  resetServerUrl,
  getDefaultServerUrl,
  validateServerUrl,
  normalizeServerUrl,
  isOfficialServer,
  isPrivateHost,
} from "@shared/services/config";
import { scanForLanServer } from "@shared/services/lanDiscovery";
import { commitAutofill } from "../../../modules/autofill";
import {
  describeLocalOnlyFeatures,
  refreshLocalOnlyFeatures,
} from "@shared/services/localOnlyFeatures";
import {
  getAppMode,
  onAppModeChange,
  restartOnboarding,
} from "@shared/services/appMode";
import type { AppMode } from "@shared/services/appMode";
import type { RootStackParamList } from "./types";
import GoogleSignInButton from "./components/GoogleSignInButton";
import { isGoogleSignInAvailable } from "./googleSignIn";
import { openEmail } from "./components/LegalScreen";
import PasswordField from "./components/PasswordField";
import type { ThemeColors } from "@shared/context/ThemeContext"
import { captureException, log, metric } from "@shared/services/crashReporting";

const SUPPORT_EMAIL = "kostissuperak0s@gmail.com";

const MODE_COPY = {
  online: {
    subtitle: "Sign in to continue your fitness journey",
    identifierLabel: "Username or Email",
    identifierPlaceholder: "Enter username or email",
    autoCapitalize: "none",
    keyboardType: "email-address",
    autoComplete: "username",
    textContentType: "username",
    returnKeyType: "next",
    submitLabel: "Sign In",
    submitAccessibilityLabel: "Sign in",
    modeSwitchPrompt: "Prefer to keep everything on this device?",
  },
  offline: {
    subtitle: "Continue offline. Your data is kept on this device",
    identifierLabel: "Profile name",
    identifierPlaceholder: "Name this device profile",
    autoCapitalize: "words",
    keyboardType: "default",
    autoComplete: "off",
    textContentType: "none",
    returnKeyType: "go",
    submitLabel: "Continue Offline",
    submitAccessibilityLabel: "Continue offline",
    modeSwitchPrompt: "Want to sync with a server instead?",
  },
} as const;

type LoginScreenProps = {
  readonly navigation: NativeStackNavigationProp<RootStackParamList, "Login">;
};
export default function LoginScreen({
  navigation,
}: LoginScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [usernameOrEmail, setUsernameOrEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showServerModal, setShowServerModal] = useState<boolean>(false);
  const [tempServerUrl, setTempServerUrl] = useState<string>("");
  const [currentServerUrl, setCurrentServerUrl] = useState<string>("");
  const [isDetectingLan, setIsDetectingLan] = useState<boolean>(false);
  const [detectedLanUrl, setDetectedLanUrl] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("online");
  const [missingField, setMissingField] = useState<"identifier" | "password" | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  const { signin } = useAuth();
  const { alert, AlertComponent } = useAlert();
  const isOnline = appMode === "online";
  const copy = MODE_COPY[isOnline ? "online" : "offline"];
  const identifierRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const busy = isLoading || googleBusy;

  // The server has no mail sender, so an emailed reset link cannot be offered.
  // The operator resets passwords with the `owngains passwd` CLI.
  const showPasswordRecoveryHelp = () => {
    const offlineNote =
      "If you would rather not use a server at all, switch to offline mode: your data stays on this device and no password is needed.";
    if (isOfficialServer()) {
      alert(
        "Forgot Password?",
        `Email ${SUPPORT_EMAIL} from the address you signed up with, and the password on the official server will be reset for you.\n\n${offlineNote}`,
        [
          { text: "Close", style: "cancel" },
          {
            text: "Email support",
            onPress: async () => {
              if (!(await openEmail(SUPPORT_EMAIL)))
                alert(
                  "No email app",
                  `This device has no email app set up. The address is ${SUPPORT_EMAIL}.`,
                  [{ text: "OK" }],
                  "info",
                );
            },
          },
        ],
        "info",
      );
      return;
    }
    alert(
      "Forgot Password?",
      `Ask whoever runs ${currentServerUrl} to reset it for you.\n\nIf you run this server, reset it with \`owngains passwd <username> <newpassword>\` on the server.\n\n${offlineNote}`,
      [{ text: "OK" }],
      "info",
    );
  };

  useEffect(() => {
    setCurrentServerUrl(getServerUrl());
    void getAppMode().then(setAppMode);
    const unsubscribeMode = onAppModeChange.subscribe(setAppMode);
    // The URL can change under this screen (a restore, or Settings), and the
    // badge and the password-recovery copy both name it.
    const unsubscribeUrl = onServerUrlChange(setCurrentServerUrl);
    return () => {
      unsubscribeMode();
      unsubscribeUrl();
    };
  }, []);

  // setIsLoading is asynchronous, so `disabled` is not yet applied on a second
  // tap in the same frame, since two taps would open two sessions.
  const isSubmittingRef = useRef(false);

  const handleLogin = async (): Promise<void> => {
    if (isSubmittingRef.current || googleBusy) return;
    let missing: "identifier" | "password" | null = null;
    if (!usernameOrEmail.trim()) missing = "identifier";
    else if (isOnline && !password) missing = "password";
    setMissingField(missing);
    if (missing) {
      (missing === "identifier" ? identifierRef : passwordRef).current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      const result = await signin(usernameOrEmail.trim(), password);

      // Deliberately kept on failure: a network error never rejected it, and
      // retyping a password to retry something that was never refused is the
      // worst moment to ask for it.
      if (result.success) {
        commitAutofill();
        setPassword("");
      }

      if (!result.success) {
        alert(
          "Sign-in failed",
          result.error || "Invalid username or password",
          [{ text: "OK" }],
          "error",
        );
      }
    } catch (error) {
      console.error("Unexpected login error:", error);
      metric.count("auth.login_failed", 1, { attributes: { reason: "unexpected" } });
      captureException(error, { stage: "login" });
      alert(
        "Error",
        "An unexpected error occurred. Please check your connection and try again.",
        [{ text: "OK" }],
        "error",
      );
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
    }
  };

  // The zeroconf scan cannot be aborted, so each open gets a generation and
  // only the newest one is allowed to touch state. Otherwise an older scan's
  // completion turns off the spinner belonging to a newer one, or writes to an
  // unmounted screen.
  const scanGenerationRef = useRef(0);
  useEffect(() => () => { scanGenerationRef.current += 1; }, []);

  const handleOpenServerModal = useCallback((): void => {
    const liveUrl = getServerUrl();
    setCurrentServerUrl(liveUrl);
    setTempServerUrl(liveUrl);
    setDetectedLanUrl(null);
    setShowServerModal(true);
    setIsDetectingLan(true);
    const generation = ++scanGenerationRef.current;
    scanForLanServer()
      .then((found) => {
        if (!found || generation !== scanGenerationRef.current) return;
        setDetectedLanUrl(
          found.fqdn ? `https://${found.fqdn}` : `http://${found.ip}:${found.port}`,
        );
      })
      .catch((error) => {
        console.log("LAN server scan failed:", error);
        metric.count("lan.scan_failed");
        log.warn("lan.scan_failed");
      })
      .finally(() => {
        if (generation === scanGenerationRef.current) setIsDetectingLan(false);
      });
  }, []);

  const applyDetectedLanUrl = useCallback((): void => {
    if (detectedLanUrl) setTempServerUrl(detectedLanUrl);
  }, [detectedLanUrl]);

  // A server can decline to store whole features to save its own disk. That
  // is a durability trade-off the person picking the server has to know about,
  // so it is confirmed at the moment they pick it, not discovered later.
  const announceServerChange = useCallback(
    async (message: string, previousUrl?: string): Promise<void> => {
      const localOnly = await refreshLocalOnlyFeatures();
      if (localOnly === null) {
        // Null is "the server never answered", not "it stores everything", so
        // saying "Success" here would send the user into a login that cannot work.
        alert(
          "Saved, but not reachable",
          `${message}

OwnGains could not reach that address, so it could not check what the server stores. Make sure it is running and reachable from this phone before signing in.`,
          previousUrl
            ? [
                { text: `Go back to ${previousUrl}`, onPress: () => void setServerUrl(previousUrl) },
                { text: "Keep it" },
              ]
            : [{ text: "OK" }],
          "warning",
        );
        return;
      }
      if (localOnly.length > 0) {
        alert(
          "Some data stays on this phone",
          `${message}

This server does not store ${describeLocalOnlyFeatures(localOnly)}. Those are kept on this device only: they will not sync to your other devices, and they are gone if you uninstall OwnGains or lose the phone.`,
          [{ text: "Got it" }],
          "warning",
        );
        return;
      }
      alert("Success", message, [{ text: "OK" }], "success");
    },
    [alert],
  );

  const saveUrl = useCallback(async (url: string): Promise<void> => {
    const previousUrl = getServerUrl();
    const success = await setServerUrl(url);
    if (success) {
      setCurrentServerUrl(getServerUrl());
      setShowServerModal(false);
      await announceServerChange(
        "Server URL updated successfully!",
        previousUrl === getServerUrl() ? undefined : previousUrl,
      );
    } else {
      alert("Error", "Failed to save server URL", [{ text: "OK" }], "error");
    }
  }, [alert, announceServerChange]);

  const handleSaveServerUrl = useCallback(async (): Promise<void> => {
    const url = normalizeServerUrl(tempServerUrl);
    const validation = validateServerUrl(url);

    if (!validation.valid) {
      alert(
        "Invalid URL",
        validation.message || "Please enter a valid URL",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    const fromDiscovery =
      detectedLanUrl !== null && url === normalizeServerUrl(detectedLanUrl);
    if (url.startsWith("http://") && isPrivateHost(new URL(url).hostname) && !fromDiscovery) {
      alert(
        "Unencrypted connection",
        "This server is on your local network and doesn't use encryption. Anyone on this Wi-Fi could see your traffic, including your password.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Continue",
            onPress: async () => {
              await saveUrl(url);
            },
          },
        ],
        "warning",
      );
      return;
    }

    await saveUrl(url);
  }, [tempServerUrl, detectedLanUrl, saveUrl, alert]);

  const handleResetServerUrl = useCallback((): void => {
    const defaultUrl = getDefaultServerUrl();
    alert(
      "Reset Server URL?",
      `This will reset the server URL to the default: ${defaultUrl}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          onPress: async () => {
            if (!(await resetServerUrl())) {
              alert(
                "Error",
                "Failed to reset server URL",
                [{ text: "OK" }],
                "error",
              );
              return;
            }
            setCurrentServerUrl(defaultUrl);
            setTempServerUrl(defaultUrl);
            setShowServerModal(false);
            await announceServerChange(
              "Server URL reset to default successfully!",
            );
          },
        },
      ],
      "warning",
    );
  }, [alert, announceServerChange]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text
                style={styles.title}
                accessibilityRole='header'
                accessibilityLabel='OwnGains'
              >
                💪 OwnGains
              </Text>
              <Text style={styles.subtitle}>
                {copy.subtitle}
              </Text>
            </View>

            {isOnline && (
              <TouchableOpacity
                style={styles.serverBadge}
                onPress={handleOpenServerModal}
                disabled={busy}
                accessibilityRole='button'
                accessibilityLabel={`Change server. Currently ${currentServerUrl}`}
              >
                <Text style={styles.serverIcon}>🌐</Text>
                <View style={styles.serverBadgeContent}>
                  <Text style={styles.serverBadgeLabel}>Server</Text>
                  <Text style={styles.serverBadgeUrl} numberOfLines={1}>
                    {currentServerUrl}
                  </Text>
                </View>
                <Text style={styles.serverBadgeArrow}>⚙️</Text>
              </TouchableOpacity>
            )}

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  {copy.identifierLabel}
                </Text>
                <TextInput
                  ref={identifierRef}
                  style={[styles.input, missingField === "identifier" && styles.inputInvalid]}
                  placeholder={copy.identifierPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  value={usernameOrEmail}
                  onChangeText={(value) => {
                    setUsernameOrEmail(value);
                    if (missingField === "identifier") setMissingField(null);
                  }}
                  accessibilityLabel={copy.identifierLabel}
                  autoCapitalize={copy.autoCapitalize}
                  autoCorrect={false}
                  keyboardType={copy.keyboardType}
                  autoComplete={copy.autoComplete}
                  textContentType={copy.textContentType}
                  editable={!busy}
                  returnKeyType={copy.returnKeyType}
                  onSubmitEditing={() => {
                    if (isOnline) passwordRef.current?.focus();
                    else void handleLogin();
                  }}
                />
                {missingField === "identifier" && (
                  <Text style={styles.errorText} accessibilityLiveRegion='polite'>
                    {isOnline
                      ? "Enter your username or email"
                      : "Enter a name for this device profile"}
                  </Text>
                )}
              </View>

              {isOnline && (
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Password</Text>
                <PasswordField
                  ref={passwordRef}
                  toggleLabel='password'
                  style={missingField === "password" && styles.inputInvalid}
                  placeholder='Enter your password'
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    if (missingField === "password") setMissingField(null);
                  }}
                  accessibilityLabel='Password'
                  autoComplete='current-password'
                  textContentType='password'
                  editable={!busy}
                  returnKeyType='go'
                  onSubmitEditing={handleLogin}
                />
                {missingField === "password" && (
                  <Text style={styles.errorText} accessibilityLiveRegion='polite'>
                    Enter your password
                  </Text>
                )}
              </View>
              )}

              {isOnline && (
                <TouchableOpacity
                  style={styles.forgotPassword}
                  onPress={showPasswordRecoveryHelp}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password help"
                >
                  <Text style={styles.forgotPasswordText}>
                    Forgot Password?
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.loginButton,
                  busy && styles.loginButtonDisabled,
                ]}
                onPress={handleLogin}
                disabled={busy}
                accessibilityRole='button'
                accessibilityLabel={copy.submitAccessibilityLabel}
                accessibilityState={{ disabled: busy, busy: isLoading }}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.loginButtonText}>
                    {copy.submitLabel}
                  </Text>
                )}
              </TouchableOpacity>

              {isOnline && isGoogleSignInAvailable() && (
                <>
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>OR</Text>
                    <View style={styles.dividerLine} />
                  </View>
                  <GoogleSignInButton
                    disabled={isLoading}
                    onBusyChange={setGoogleBusy}
                    onForgotPassword={showPasswordRecoveryHelp}
                    onError={(message) =>
                      alert("Sign-in failed", message, [{ text: "OK" }], "error")
                    }
                  />
                </>
              )}

              {isOnline && (
                <>
                  <Text style={styles.signupPrompt}>New to OwnGains?</Text>
                  <TouchableOpacity
                    style={styles.signupButton}
                    onPress={() => navigation.navigate("Signup")}
                    disabled={busy}
                    accessibilityRole='button'
                    accessibilityLabel='Create a new account'
                  >
                    <Text style={styles.signupButtonText}>
                      Create New Account
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.modeSwitchButton}
                onPress={() => void restartOnboarding()}
                disabled={busy}
                accessibilityRole='button'
                accessibilityLabel='Change how OwnGains stores your data'
              >
                <Text style={styles.modeSwitchLink}>
                  {copy.modeSwitchPrompt}
                </Text>
              </TouchableOpacity>

              <Text style={styles.footerText}>
                By continuing, you agree to our
              </Text>
              <View style={styles.footerLinks}>
                <TouchableOpacity
                  style={styles.footerLinkButton}
                  onPress={() => navigation.navigate("TermsOfService")}
                  accessibilityRole='link'
                  accessibilityLabel='Read the terms of service'
                >
                  <Text style={styles.footerLink}>Terms of Service</Text>
                </TouchableOpacity>
                <Text style={styles.footerText}> and </Text>
                <TouchableOpacity
                  style={styles.footerLinkButton}
                  onPress={() => navigation.navigate("PrivacyPolicy")}
                  accessibilityRole='link'
                  accessibilityLabel='Read the privacy policy'
                >
                  <Text style={styles.footerLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>

        <ModalSheet
          visible={showServerModal}
          onClose={() => setShowServerModal(false)}
          title='Server Configuration'
          onConfirm={handleSaveServerUrl}
          confirmText='Save'
          dirty={normalizeServerUrl(tempServerUrl) !== currentServerUrl}
        >
          <Text style={styles.modalDescription}>
            Enter the address of your OwnGains server, like owngains.example.com
          </Text>
          <TextInput
            style={styles.modalInput}
            value={tempServerUrl}
            onChangeText={setTempServerUrl}
            keyboardType='url'
            placeholder='owngains.example.com'
            placeholderTextColor={colors.textMuted}
            autoCapitalize='none'
            autoCorrect={false}
            accessibilityLabel='Server address'
            returnKeyType='done'
            onSubmitEditing={() => void handleSaveServerUrl()}
          />
          {isDetectingLan && (
            <View style={styles.lanSuggestion}>
              <ActivityIndicator size='small' color={colors.textMuted} />
              <Text style={styles.lanSuggestionText}>Looking for a server on this network…</Text>
            </View>
          )}
          {detectedLanUrl && (
            <TouchableOpacity
              style={styles.lanSuggestion}
              onPress={applyDetectedLanUrl}
              accessibilityRole='button'
              accessibilityLabel={`Use the server found on this network: ${detectedLanUrl}`}
            >
              <Text style={styles.lanSuggestionText}>
                📡 Found on this network: {detectedLanUrl} (tap to use)
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.modalWarning}>
            <Text style={styles.modalWarningIcon}>⚠️</Text>
            <Text style={styles.modalWarningText}>
              Use https:// for any server on the internet, so your data is
              encrypted
            </Text>
          </View>
          <TouchableOpacity
            style={styles.resetButton}
            onPress={handleResetServerUrl}
            accessibilityRole='button'
            accessibilityLabel='Reset server URL to default'
          >
            <Text style={styles.resetButtonText}>Reset to Default</Text>
          </TouchableOpacity>
          <Text style={styles.modalHelperText}>
            💡 Make sure you can reach this server before logging in
          </Text>
        </ModalSheet>

        {AlertComponent}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1, paddingBottom: 40 },
    content: { paddingHorizontal: 24, paddingTop: 32, minHeight: "100%" },
    header: { marginBottom: 24, alignItems: "center" },
    title: {
      fontSize: 36,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
    },
    serverBadge: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    serverIcon: { fontSize: 20, marginRight: 12 },
    serverBadgeContent: { flex: 1 },
    serverBadgeLabel: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: "600",
      marginBottom: 2,
    },
    serverBadgeUrl: {
      fontSize: 14,
      color: colors.textPrimary,
      fontWeight: "500",
    },
    serverBadgeArrow: { fontSize: 18, marginLeft: 8 },
    form: { width: "100%" },
    inputContainer: { marginBottom: 20 },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    forgotPassword: {
      alignSelf: "flex-end",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
      marginBottom: 12,
    },
    forgotPasswordText: {
      fontSize: 14,
      color: colors.accent,
      fontWeight: "600",
    },
    loginButton: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    loginButtonDisabled: { opacity: 0.6 },
    loginButtonText: {
      color: colors.textOnAccent,
      fontSize: 18,
      fontWeight: "bold",
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 24,
      marginBottom: 0,
    },
    dividerLine: { flex: 1, height: 1, backgroundColor: colors.surfaceBorder },
    dividerText: {
      marginHorizontal: 16,
      fontSize: 14,
      color: colors.textMuted,
      fontWeight: "600",
    },
    inputInvalid: { borderColor: colors.error },
    errorText: {
      fontSize: 13,
      color: colors.error,
      marginTop: 6,
      fontWeight: "600",
    },
    signupPrompt: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 36,
      marginBottom: 12,
    },
    signupButton: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.accent,
    },
    signupButtonText: {
      color: colors.accent,
      fontSize: 18,
      fontWeight: "bold",
    },
    footer: { marginTop: 40, alignItems: "center" },
    modeSwitchButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 8,
      marginBottom: 12,
    },
    modeSwitchLink: {
      fontSize: 13,
      color: colors.accent,
      fontWeight: "600",
      textAlign: "center",
      textDecorationLine: "underline",
    },
    footerText: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 18,
    },
    footerLinks: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      flexWrap: "wrap",
    },
    footerLinkButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    footerLink: { fontSize: 12, color: colors.accent, fontWeight: "600" },
    modalDescription: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 20,
      lineHeight: 22,
    },
    modalInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      marginBottom: 16,
    },
    modalWarning: {
      flexDirection: "row",
      alignItems: "flex-start",
      backgroundColor: colors.warningLight,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    modalWarningIcon: { fontSize: 16, marginRight: 8, marginTop: 2 },
    modalWarningText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    resetButton: {
      minHeight: 44,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 8,
    },
    resetButtonText: {
      color: colors.textSecondary,
      fontSize: 15,
      fontWeight: "600",
    },
    modalHelperText: {
      fontSize: 13,
      color: colors.accent,
      textAlign: "center",
      fontStyle: "italic",
    },
    lanSuggestion: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    },
    lanSuggestionText: {
      color: colors.textSecondary,
      fontSize: 14,
      flexShrink: 1,
    },
  });
