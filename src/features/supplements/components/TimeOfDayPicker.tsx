import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

const MINUTE_STEP = 5;
const PRESETS = [
  { label: "Morning", h: 8, m: 0 },
  { label: "Noon", h: 12, m: 0 },
  { label: "Evening", h: 18, m: 0 },
  { label: "Night", h: 21, m: 0 },
];

type Props = {
  readonly value: Date;
  readonly onChange: (next: Date) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
const wrap = (n: number, size: number) => ((n % size) + size) % size;

export default function TimeOfDayPicker({
  value,
  onChange,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const h = value.getHours();
  const m = value.getMinutes();

  const set = (hours: number, minutes: number) => {
    const next = new Date(value);
    next.setHours(wrap(hours, 24), wrap(minutes, 60), 0, 0);
    onChange(next);
  };

  const column = (label: string, text: string, onStep: (d: number) => void) => (
    <View style={styles.column}>
      <TouchableOpacity
        style={styles.arrow}
        hitSlop={8}
        onPress={() => onStep(1)}
        accessibilityRole='button'
        accessibilityLabel={`Increase ${label}`}
      >
        <Text style={styles.arrowText}>▲</Text>
      </TouchableOpacity>
      <Text style={styles.digits} accessibilityLabel={`${text} ${label}`}>
        {text}
      </Text>
      <TouchableOpacity
        style={styles.arrow}
        hitSlop={8}
        onPress={() => onStep(-1)}
        accessibilityRole='button'
        accessibilityLabel={`Decrease ${label}`}
      >
        <Text style={styles.arrowText}>▼</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View>
      <View style={styles.display}>
        {column("hours", pad(h), (d) => set(h + d, m))}
        <Text style={styles.colon}>:</Text>
        {column("minutes", pad(m), (d) =>
          set(h, Math.round(m / MINUTE_STEP) * MINUTE_STEP + d * MINUTE_STEP),
        )}
      </View>
      <View style={styles.presets}>
        {PRESETS.map((p) => {
          const active = p.h === h && p.m === m;
          return (
            <TouchableOpacity
              key={p.label}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => set(p.h, p.m)}
              accessibilityRole='button'
              accessibilityLabel={`Set ${p.label} ${pad(p.h)}:${pad(p.m)}`}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    display: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.accent,
      paddingVertical: 12,
      gap: 8,
    },
    column: { alignItems: "center", minWidth: 84 },
    arrow: {
      width: 56,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },
    arrowText: { fontSize: 18, color: colors.accent },
    digits: {
      fontSize: 52,
      fontWeight: "700",
      color: colors.accent,
      fontVariant: ["tabular-nums"],
    },
    colon: { fontSize: 44, fontWeight: "700", color: colors.textMuted },
    presets: { flexDirection: "row", gap: 8, marginTop: 12 },
    chip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    chipActive: { backgroundColor: colors.infoLight, borderColor: colors.accent },
    chipText: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
    chipTextActive: { color: colors.accent },
  });
