import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

type MuscleTagsProps = {
  readonly primaryMuscles?: readonly string[];
  readonly secondaryMuscles?: readonly string[];
};

export function MuscleTags({
  primaryMuscles = [],
  secondaryMuscles = [],
}: MuscleTagsProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (primaryMuscles.length === 0 && secondaryMuscles.length === 0) return null;

  return (
    <View style={styles.container}>
      {primaryMuscles.length > 0 && (
        <Text
          style={styles.primary}
          accessibilityLabel={`Main muscles: ${primaryMuscles.join(", ")}`}
        >
          <Text style={styles.label}>M: </Text>
          {primaryMuscles.join(", ")}
        </Text>
      )}
      {secondaryMuscles.length > 0 && (
        <Text
          style={styles.secondary}
          accessibilityLabel={`Secondary muscles: ${secondaryMuscles.join(", ")}`}
        >
          <Text style={styles.label}>S: </Text>
          {secondaryMuscles.join(", ")}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { marginTop: 4, gap: 2 },
    label: {
      fontWeight: "700",
      color: colors.textMuted,
    },
    primary: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    secondary: { fontSize: 14, color: colors.textPrimary },
  });
