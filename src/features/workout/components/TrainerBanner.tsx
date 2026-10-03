import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

interface TrainerBannerProps {
  readonly trainerUsername: string;
}

export function TrainerBanner({
  trainerUsername,
}: TrainerBannerProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = makeTrainerBannerStyles(colors);

  return (
    <View style={styles.container}>
      <View style={styles.liveDot} />
      <View style={styles.avatarRing}>
        <Text style={styles.avatarText}>
          {trainerUsername?.charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <Text style={styles.label} numberOfLines={1}>
        <Text style={styles.name}>{trainerUsername}</Text>
        {"  "}
        <Text style={styles.status}>is logging this session for you</Text>
      </Text>
    </View>
  );
}

export const makeTrainerBannerStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 7,
      gap: 8,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.success,
    },
    avatarRing: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.accentDark,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.info,
    },
    avatarText: { color: colors.textOnAccent, fontWeight: "700", fontSize: 12 },
    label: { flex: 1, fontSize: 12, color: colors.textPrimary },
    name: { color: colors.textPrimary, fontWeight: "700" },
    status: { color: colors.textSecondary },
  });
