import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

export const usePracticeStyles = () => {
  const { colors } = useTheme();
  return useMemo(() => makeStyles(colors), [colors]);
};

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    demo: { gap: 12 },
    title: { fontSize: 16, fontWeight: "700", color: colors.textPrimary },
    muted: { fontSize: 13, color: colors.textSecondary },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    tile: {
      width: "47%",
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surface,
      gap: 4,
    },
    tileDone: { borderColor: colors.success, backgroundColor: colors.successLight },
    tileIcon: { fontSize: 24 },
    tileLabel: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    result: {
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
      color: colors.textPrimary,
      fontSize: 14,
    },
    row: { flexDirection: "row", gap: 10, alignItems: "center" },
    input: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderRadius: 10,
      padding: 10,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    chip: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surfaceElevated,
    },
    chipText: { color: colors.accent, fontWeight: "600", fontSize: 13 },
    primary: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, alignItems: "center" },
    primaryText: { color: colors.textOnAccent, fontWeight: "700" },
    secondary: { borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 12, padding: 14, alignItems: "center", flex: 1 },
    secondaryText: { color: colors.textPrimary, fontWeight: "600" },
    disabled: { opacity: 0.4 },
    celebrate: { fontSize: 20, fontWeight: "800", color: colors.accent, textAlign: "center" },
    effortRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    effortBtn: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1 },
    effortText: { fontSize: 13, fontWeight: "600" },
    pullArea: {
      height: 220,
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
    },
    mockList: { borderRadius: 12, backgroundColor: colors.surface, padding: 12, gap: 6 },
    segment: { flexDirection: "row", borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: colors.surfaceBorder },
    segmentBtn: { flex: 1, padding: 10, alignItems: "center" },
    segmentActive: { backgroundColor: colors.accent },
  });
