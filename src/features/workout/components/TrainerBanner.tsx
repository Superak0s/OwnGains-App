import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { Avatar } from "@shared/components/Avatar";

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
      <Avatar
        name={trainerUsername}
        size={26}
        style={styles.avatarRing}
        textStyle={styles.avatarText}
      />
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
      backgroundColor: colors.accentDark,
      borderWidth: 1.5,
      borderColor: colors.info,
    },
    avatarText: { fontSize: 12 },
    label: { flex: 1, fontSize: 14, color: colors.textPrimary },
    name: { color: colors.textPrimary, fontWeight: "700" },
    status: { color: colors.textSecondary },
    stopButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
  });
