import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

/** Initial-in-a-circle stand-in for a user, used wherever a friend is listed. */
export function Avatar({
  username,
  active = false,
  children,
}: {
  readonly username?: string | null;
  readonly active?: boolean;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.avatar, active && styles.avatarActive]}>
      <Text style={styles.avatarText}>
        {username?.charAt(0).toUpperCase() || "?"}
      </Text>
      {children}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
      position: "relative",
    },
    avatarActive: { backgroundColor: colors.accentDark },
    avatarText: { color: colors.surface, fontSize: 20, fontWeight: "bold" },
  });
