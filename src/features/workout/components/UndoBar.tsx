import React, { useEffect, useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

export const UNDO_TIMEOUT_MS = 5000;

interface UndoBarProps {
  readonly message: string;
  readonly onUndo: () => void;
  readonly onTimeout: () => void;
}

/** A toast with an Undo action, which the Android-only showToast cannot carry. */
export function UndoBar({
  message,
  onUndo,
  onTimeout,
}: UndoBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    const timer = setTimeout(onTimeout, UNDO_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [onTimeout]);

  return (
    <View style={styles.bar} accessibilityLiveRegion='polite'>
      <Text style={styles.message}>{message}</Text>
      <TouchableOpacity
        style={styles.button}
        accessibilityRole='button'
        accessibilityLabel='Undo'
        onPress={onUndo}
      >
        <Text style={styles.buttonText}>Undo</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bar: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingLeft: 16,
      borderRadius: 12,
      backgroundColor: colors.textPrimary,
      elevation: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    message: { flex: 1, fontSize: 14, color: colors.background },
    button: {
      minWidth: 48,
      minHeight: 48,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent: "center",
    },
    buttonText: { fontSize: 14, fontWeight: "700", color: colors.background },
  });
