import React, { useMemo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@shared/components/Text";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { kgToDisplay } from "@features/workout/utils";
import type { DropSegment } from "@shared/types";

/** A drop set's drops as small "↘ 80kg × 6" pills, or nothing for a straight set. */
export function DropChips({
  drops,
  unit,
  style,
}: {
  readonly drops: readonly DropSegment[] | undefined;
  readonly unit: "kg" | "lbs";
  readonly style?: StyleProp<ViewStyle>;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!drops?.length) return null;
  // Shared sessions can arrive with MySQL decimals serialized as strings.
  const labels = drops.map(
    (d) => `↘ ${kgToDisplay(Number(d.weight) || 0, unit)}${unit} × ${Number(d.reps) || 0}`,
  );
  return (
    <View style={[styles.row, style]}>
      {labels.map((label, i) => (
        <View key={i} style={styles.chip}>
          <Text style={styles.text}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
    chip: {
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    text: { fontSize: 12, fontWeight: "600", color: colors.accent },
  });
