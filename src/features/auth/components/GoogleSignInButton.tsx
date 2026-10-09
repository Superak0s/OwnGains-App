import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
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
          <Text style={styles.buttonText}>Continue with Google</Text>
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
