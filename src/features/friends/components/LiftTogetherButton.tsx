import React from "react";
import { TouchableOpacity, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

interface LiftTogetherButtonProps {
  readonly onPress: () => void;
  readonly status?: string;
  readonly small?: boolean;
}

const LABEL_BY_STATUS: Record<string, string> = {
  sending: "Sending…",
  waiting: "Waiting…",
  active: "✓ In Session",
  declined: "Declined",
};

export function LiftTogetherButton({
  onPress,
  status,
  small = false,
}: LiftTogetherButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const liftStyles = makeLiftStyles(colors);
  const BG_BY_STATUS: Record<string, string> = {
    active: colors.success,
    waiting: colors.warning,
    declined: colors.textSecondary,
  };
  const label = LABEL_BY_STATUS[status ?? ""] ?? "🏋️ Lift Together";
  const bg = BG_BY_STATUS[status ?? ""] ?? colors.accentDark;
  const busy = status === "sending" || status === "waiting";
  return (
    <TouchableOpacity
      style={[
        liftStyles.button,
        small && liftStyles.buttonSmall,
        { backgroundColor: bg },
        busy && { opacity: 0.75 },
      ]}
      onPress={onPress}
      disabled={busy || status === "active"}
      activeOpacity={0.8}
    >
      {busy ? (
        <ActivityIndicator
          size='small'
          color='#fff'
          style={{ marginRight: 6 }}
        />
      ) : null}
      <Text style={[liftStyles.label, small && liftStyles.labelSmall]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export const makeLiftStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
    },
    buttonSmall: { paddingHorizontal: 10, paddingVertical: 6 },
    label: { color: colors.surface, fontWeight: "700", fontSize: 14 },
    labelSmall: { fontSize: 12 },
  });
