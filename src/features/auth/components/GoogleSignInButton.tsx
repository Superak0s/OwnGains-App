import React, { useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
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

  if (!isGoogleSignInAvailable()) return null;

  const handlePress = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success && result.error) onError(result.error);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
      onPress={() => void handlePress()}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: disabled || busy, busy }}
    >
      {busy ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <Text style={styles.buttonText}>Continue with Google</Text>
      )}
    </TouchableOpacity>
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
  });
