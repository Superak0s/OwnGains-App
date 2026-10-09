import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import { isGoogleSignInAvailable } from "../googleSignIn";

interface GoogleSignInButtonProps {
  readonly disabled?: boolean;
  readonly onError: (message: string) => void;
}

export default function GoogleSignInButton({
  disabled = false,
  onError,
}: GoogleSignInButtonProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [link, setLink] = useState<{ idToken: string; username: string } | null>(null);
  const [password, setPassword] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);

  if (!isGoogleSignInAvailable()) return null;

  const run = async (linkPassword?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await signInWithGoogle(
        link && linkPassword !== undefined ? { idToken: link.idToken, password: linkPassword } : undefined,
      );
      if (result.linkRequired) {
        setPassword("");
        setLinkError(null);
        setLink(result.linkRequired);
      } else if (result.success) {
        setLink(null);
      } else if (result.error) {
        if (link) setLinkError(result.error);
        else onError(result.error);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
        onPress={() => void run()}
        disabled={disabled || busy}
        accessibilityRole="button"
        accessibilityLabel="Continue with Google"
        accessibilityState={{ disabled: disabled || busy, busy }}
      >
        {busy && !link ? (
          <ActivityIndicator color={colors.textPrimary} />
        ) : (
          <View style={styles.content}>
            <GoogleLogo />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </View>
        )}
      </TouchableOpacity>
      <ModalSheet
        visible={link !== null}
        onClose={() => setLink(null)}
        title="Link Google account"
        onConfirm={() => void run(password)}
        confirmText={busy ? "Linking…" : "Link"}
        confirmDisabled={busy || !password}
      >
        <Text style={styles.description}>
          {link?.username
            ? `The OwnGains account ${link.username} already uses this email. Enter its password to link your Google account.`
            : "An OwnGains account already uses this email. Enter its password to link your Google account."}
        </Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoFocus
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Password of the existing OwnGains account"
          onSubmitEditing={() => password && void run(password)}
        />
        {linkError && <Text style={styles.error}>{linkError}</Text>}
      </ModalSheet>
    </>
  );
}

const GoogleLogo = () => (
  <Svg width={20} height={20} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      marginTop: 12,
    },
    buttonDisabled: { opacity: 0.6 },
    content: { flexDirection: "row", alignItems: "center", gap: 12 },
    buttonText: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    description: { color: colors.textSecondary, fontSize: 14, marginBottom: 12 },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      color: colors.textPrimary,
      fontSize: 16,
    },
    error: { color: colors.error, fontSize: 14, marginTop: 8 },
  });
