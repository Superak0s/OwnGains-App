import React, { useState, useMemo, useRef, useEffect } from "react";
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
import { useAlert } from "@shared/components/CustomAlert";
import { captureException } from "@shared/services/crashReporting";
import { commitAutofill } from "../../../modules/autofill";
import type { RootStackParamList } from "./types";
import GoogleSignInButton from "./components/GoogleSignInButton";
import PasswordField from "./components/PasswordField";
import { PASSWORD_HINT, passwordPolicyError } from "./utils/passwordPolicy";
import { isGoogleSignInAvailable } from "./googleSignIn";
import type { ThemeColors } from "@shared/context/ThemeContext";

type SignupScreenProps = {
  readonly navigation: NativeStackNavigationProp<RootStackParamList, "Signup">;
};

type FieldName = "username" | "email" | "password" | "confirmPassword" | "age";
type FieldErrors = Partial<Record<FieldName, string>>;

const FIELD_ORDER: ReadonlyArray<FieldName> = [
  "username",
  "email",
  "password",
  "confirmPassword",
  "age",
];

const USERNAME_PATTERN = /^\w{3,20}$/;
const USERNAME_HINT =
  '3-20 letters, numbers or underscores, at least 3 of them letters, without "demo"';
// No overlapping character classes -> no catastrophic backtracking.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

function collectErrors(values: {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  ageConfirmed: boolean;
}): FieldErrors {
  // Validate what will actually be sent, not the raw field text: a pasted
  // " bob" is a valid username once trimmed, and rejecting it with "letters,
  // numbers and underscores only" describes a problem the user does not have.
  const username = values.username.trim();
  const email = values.email.trim().toLowerCase();
  const { password, confirmPassword } = values;
  const errors: FieldErrors = {};

  if (!username) errors.username = "Username is required";
  else if (
    !USERNAME_PATTERN.test(username) ||
    (username.match(/[A-Za-z]/g)?.length ?? 0) < 3
  )
    errors.username =
      "3-20 characters, using only letters, numbers and underscores, at least 3 of them letters";
  else if (/demo/i.test(username))
    errors.username = `Username can't contain "demo"`;

  if (!email) errors.email = "Email is required";
  else if (email.length > 254 || !EMAIL_PATTERN.test(email))
    errors.email = "Enter a valid email address, like you@example.com";

  if (password) {
    const policyError = passwordPolicyError(password);
    if (policyError) errors.password = policyError;
  } else errors.password = "Password is required";

  if (!confirmPassword) errors.confirmPassword = "Re-enter your password";
  else if (password !== confirmPassword)
    errors.confirmPassword = "Passwords do not match";

  if (!values.ageConfirmed)
    errors.age = "Confirm you are 16 or older and agree to the Terms to continue";

  return errors;
}

// Shown only once the confirmation is as long as the password, so a half-typed
// confirmation is not flagged as a mistake.
const mismatchError = (password: string, confirm: string): string | undefined =>
  password && confirm.length >= password.length && password !== confirm
    ? "Passwords do not match"
    : undefined;

export default function SignupScreen({
  navigation,
}: SignupScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [username, setUsername] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [ageConfirmed, setAgeConfirmed] = useState<boolean>(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [googleBusy, setGoogleBusy] = useState(false);
  const busy = isLoading || googleBusy;

  const { signup } = useAuth();
  const { alert, AlertComponent } = useAlert();

  const isMountedRef = useRef<boolean>(true);
  const usernameRef = useRef<TextInputInstance>(null);
  const emailRef = useRef<TextInputInstance>(null);
  const nameRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);
  const fieldRefs: Record<FieldName, React.RefObject<TextInputInstance | null> | null> = {
    username: usernameRef,
    email: emailRef,
    password: passwordRef,
    confirmPassword: confirmRef,
    age: null,
  };

  const clearError = (field: FieldName): void =>
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  function clearSensitiveData(): void {
    setPassword("");
    setConfirmPassword("");
  }

  // setIsLoading is asynchronous, so `disabled` is not yet applied on a second
  // tap in the same frame, since two taps would post two signups.
  const isSubmittingRef = useRef<boolean>(false);

  const handleSignup = async (): Promise<void> => {
    if (isSubmittingRef.current || googleBusy) return;
    const found = collectErrors({
      username,
      email,
      password,
      confirmPassword,
      ageConfirmed,
    });
    setErrors(found);

    const firstInvalid = FIELD_ORDER.find((field) => found[field]);
    if (firstInvalid) {
      fieldRefs[firstInvalid]?.current?.focus();
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      const result = await signup(
        username.trim(),
        email.trim().toLowerCase(),
        password,
        name.trim() || "",
      );

      if (isMountedRef.current) {
        setIsLoading(false);

        if (result.success) {
          commitAutofill();
          clearSensitiveData();
        } else {
          const lowerError = result.error?.toLowerCase() ?? "";
          const looksLikeAccountClash =
            result.code === "ACCOUNT_UNAVAILABLE" ||
            lowerError.includes("already") ||
            lowerError.includes("taken") ||
            lowerError.includes("exists") ||
            lowerError.includes("in use");

          // Passwords are kept on every failure: a rejected signup and an
          // unreachable server both leave the typed passwords valid, and a
          // clash is about the username or email anyway.
          if (looksLikeAccountClash) usernameRef.current?.focus();

          alert(
            "Couldn't create account",
            result.error || "Could not create account. Please try again.",
            [{ text: "OK" }],
            "error",
          );
        }
      }
    } catch (error) {
      if (isMountedRef.current) {
        setIsLoading(false);
        captureException(error, { stage: "signupScreen" });

        alert(
          "Error",
          "An unexpected error occurred. Please check your connection and try again.",
          [{ text: "OK" }],
          "error",
        );
      }
    } finally {
      isSubmittingRef.current = false;
    }
  };

  const confirmError =
    errors.confirmPassword ?? mismatchError(password, confirmPassword);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              disabled={busy}
              accessibilityRole='button'
              accessibilityLabel='Go back to sign in'
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text
                style={styles.title}
                accessibilityRole='header'
                accessibilityLabel='Create Account'
              >
                💪 Create Account
              </Text>
              <Text style={styles.subtitle}>
                Join OwnGains to start your fitness journey
              </Text>
            </View>

            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  Username <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  ref={usernameRef}
                  style={[styles.input, errors.username && styles.inputInvalid]}
                  placeholder='Choose a username'
                  placeholderTextColor={colors.textMuted}
                  value={username}
                  onChangeText={(value) => {
                    setUsername(value);
                    clearError("username");
                  }}
                  autoCapitalize='none'
                  autoCorrect={false}
                  autoComplete='username-new'
                  textContentType='username'
                  returnKeyType='next'
                  onSubmitEditing={() => emailRef.current?.focus()}
                  maxLength={20}
                  editable={!busy}
                  accessibilityLabel='Username, required'
                  accessibilityHint={errors.username ?? USERNAME_HINT}
                />
                {errors.username ? (
                  <Text
                    style={styles.errorText}
                    accessibilityLiveRegion='polite'
                  >
                    {errors.username}
                  </Text>
                ) : (
                  <Text style={styles.inputHint}>{USERNAME_HINT}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  Email <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  ref={emailRef}
                  style={[styles.input, errors.email && styles.inputInvalid]}
                  placeholder='your.email@example.com'
                  placeholderTextColor={colors.textMuted}
                  value={email}
                  onChangeText={(value) => {
                    setEmail(value);
                    clearError("email");
                  }}
                  keyboardType='email-address'
                  autoCapitalize='none'
                  autoCorrect={false}
                  autoComplete='email'
                  textContentType='emailAddress'
                  maxLength={254}
                  returnKeyType='next'
                  onSubmitEditing={() => nameRef.current?.focus()}
                  editable={!busy}
                  accessibilityLabel='Email, required'
                  accessibilityHint={errors.email}
                />
                {errors.email && (
                  <Text
                    style={styles.errorText}
                    accessibilityLiveRegion='polite'
                  >
                    {errors.email}
                  </Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Full Name (Optional)</Text>
                <TextInput
                  ref={nameRef}
                  style={styles.input}
                  placeholder='John Doe'
                  placeholderTextColor={colors.textMuted}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize='words'
                  autoComplete='name'
                  textContentType='name'
                  maxLength={100}
                  returnKeyType='next'
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  editable={!busy}
                  accessibilityLabel='Full name, optional'
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  Password <Text style={styles.required}>*</Text>
                </Text>
                <PasswordField
                  ref={passwordRef}
                  toggleLabel='password'
                  style={!!errors.password && styles.inputInvalid}
                  placeholder='Create a password'
                  value={password}
                  onChangeText={(value) => {
                    setPassword(value);
                    clearError("password");
                  }}
                  autoComplete='new-password'
                  textContentType='newPassword'
                  maxLength={128}
                  returnKeyType='next'
                  onSubmitEditing={() => confirmRef.current?.focus()}
                  editable={!busy}
                  accessibilityLabel='Password, required'
                  accessibilityHint={errors.password ?? PASSWORD_HINT}
                />

                {errors.password ? (
                  <Text
                    style={styles.errorText}
                    accessibilityLiveRegion='polite'
                  >
                    {errors.password}
                  </Text>
                ) : (
                  <Text style={styles.inputHint}>{PASSWORD_HINT}</Text>
                )}
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>
                  Confirm Password <Text style={styles.required}>*</Text>
                </Text>
                <PasswordField
                  ref={confirmRef}
                  toggleLabel='password confirmation'
                  style={!!errors.confirmPassword && styles.inputInvalid}
                  placeholder='Re-enter your password'
                  value={confirmPassword}
                  onChangeText={(value) => {
                    setConfirmPassword(value);
                    clearError("confirmPassword");
                  }}
                  autoComplete='new-password'
                  textContentType='newPassword'
                  maxLength={128}
                  returnKeyType='go'
                  editable={!busy}
                  onSubmitEditing={() => void handleSignup()}
                  accessibilityLabel='Confirm password, required'
                  accessibilityHint={confirmError}
                />
                {confirmError && (
                  <Text
                    style={styles.errorText}
                    accessibilityLiveRegion='polite'
                  >
                    {confirmError}
                  </Text>
                )}
              </View>

              <TouchableOpacity
                style={styles.ageRow}
                onPress={() => {
                  setAgeConfirmed(!ageConfirmed);
                  clearError("age");
                }}
                disabled={busy}
                accessibilityRole='checkbox'
                accessibilityState={{ checked: ageConfirmed }}
                accessibilityLabel='I am 16 or older and agree to the Terms of Service'
                accessibilityHint={errors.age}
              >
                <Text style={[styles.ageBox, !!errors.age && styles.ageBoxInvalid]}>
                  {ageConfirmed ? "☑" : "☐"}
                </Text>
                <Text style={styles.ageText}>
                  I am 16 or older and agree to the Terms of Service
                </Text>
              </TouchableOpacity>
              {errors.age && (
                <Text style={styles.errorText} accessibilityLiveRegion='polite'>
                  {errors.age}
                </Text>
              )}
              <TouchableOpacity
                style={styles.termsInlineLink}
                onPress={() => navigation.navigate("TermsOfService")}
                accessibilityRole='link'
                accessibilityLabel='Read the Terms of Service'
              >
                <Text style={styles.termsLink}>Read the Terms of Service</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.signupButton,
                  busy && styles.signupButtonDisabled,
                ]}
                onPress={() => void handleSignup()}
                disabled={busy}
                accessibilityRole='button'
                accessibilityLabel='Create account'
                accessibilityState={{
                  disabled: busy,
                  busy: isLoading,
                }}
              >
                {isLoading ? (
                  <ActivityIndicator color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.signupButtonText}>Create Account</Text>
                )}
              </TouchableOpacity>

              {ageConfirmed ? (
                <GoogleSignInButton
                  disabled={isLoading}
                  onBusyChange={setGoogleBusy}
                  onError={(message) =>
                    alert("Couldn't create account", message, [{ text: "OK" }], "error")
                  }
                />
              ) : (
                isGoogleSignInAvailable() && (
                  <Text style={styles.googleHint}>
                    Tick the box above to continue with Google
                  </Text>
                )
              )}

              <View style={styles.termsLinkRow}>
                <Text style={styles.termsText}>Read the </Text>
                <TouchableOpacity
                  style={styles.termsLinkButton}
                  onPress={() => navigation.navigate("PrivacyPolicy")}
                  accessibilityRole='link'
                  accessibilityLabel='Read the Privacy Policy'
                >
                  <Text style={styles.termsLink}>Privacy Policy</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.loginContainer}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity
                  style={styles.loginLinkButton}
                  onPress={() => navigation.navigate("Login")}
                  disabled={busy}
                  accessibilityRole='link'
                  accessibilityLabel='Sign in to an existing account'
                >
                  <Text style={styles.loginLink}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {AlertComponent}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { flexGrow: 1, paddingBottom: 40 },
    content: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40 },
    backButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingRight: 12,
    },
    backButtonText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
    header: { marginBottom: 30, alignItems: "center" },
    title: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    form: { width: "100%" },
    inputContainer: { marginBottom: 20 },
    inputLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    required: { color: colors.error },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    inputInvalid: { borderColor: colors.error },
    inputHint: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 6,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      marginTop: 6,
      fontWeight: "600",
    },
    signupButton: {
      backgroundColor: colors.accent,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      marginTop: 10,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    signupButtonDisabled: { opacity: 0.6 },
    signupButtonText: {
      color: colors.textOnAccent,
      fontSize: 18,
      fontWeight: "bold",
    },
    ageRow: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
      marginBottom: 12,
    },
    ageBox: { fontSize: 22, color: colors.accent, marginRight: 10 },
    ageBoxInvalid: { color: colors.error },
    termsInlineLink: {
      minHeight: 44,
      justifyContent: "center",
      alignSelf: "flex-start",
      marginBottom: 4,
    },
    googleHint: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
      marginTop: 16,
    },
    ageText: { flex: 1, fontSize: 14, color: colors.textPrimary },
    termsText: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 16,
      lineHeight: 18,
    },
    termsLink: { color: colors.accent, fontWeight: "600", fontSize: 13 },
    termsLinkRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "center",
    },
    termsLinkButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    loginContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 24,
    },
    loginLinkButton: { minHeight: 44, justifyContent: "center" },
    loginText: { fontSize: 15, color: colors.textSecondary },
    loginLink: { fontSize: 15, color: colors.accent, fontWeight: "bold" },
  });
