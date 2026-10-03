import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { muscleGroups } from "@utils/exerciseDb";

interface MuscleChipsProps {
  readonly included: readonly string[];
  readonly excluded?: readonly string[];
  readonly onToggle: (muscle: string) => void;
  readonly muscles?: readonly string[];
}

export function MuscleChips({
  included,
  excluded = [],
  onToggle,
  muscles = muscleGroups(),
}: MuscleChipsProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {muscles.map((muscle) => {
        const isIncluded = included.includes(muscle);
        const isExcluded = excluded.includes(muscle);
        let prefix = "";
        if (isIncluded) prefix = "+ ";
        else if (isExcluded) prefix = "− ";
        let state = "not filtered";
        if (isIncluded) state = "required";
        else if (isExcluded) state = "excluded";
        return (
          <TouchableOpacity
            key={muscle}
            onPress={() => onToggle(muscle)}
            accessibilityRole="button"
            accessibilityLabel={`${muscle}, ${state}`}
            accessibilityState={{ selected: isIncluded || isExcluded }}
            style={[
              styles.chip,
              isIncluded && styles.chipIncluded,
              isExcluded && styles.chipExcluded,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                (isIncluded || isExcluded) && styles.chipTextActive,
              ]}
            >
              {`${prefix}${muscle}`}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    chip: {
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 40,
      justifyContent: "center",
    },
    chipIncluded: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipExcluded: {
      backgroundColor: colors.error,
      borderColor: colors.error,
    },
    chipText: { fontSize: 12, color: colors.textSecondary },
    chipTextActive: { color: colors.textOnAccent, fontWeight: "700" },
  });
