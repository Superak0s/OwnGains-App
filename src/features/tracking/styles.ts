import { StyleSheet } from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { radius, space } from "./ui";
import { SCREEN_PADDING } from "@shared/layout";

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: SCREEN_PADDING,
    header: { marginBottom: space.lg },
    title: {
      fontSize: 30,
      fontWeight: "700",
      letterSpacing: -0.6,
      color: colors.textPrimary,
    },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginTop: 2 },

    loadingBlock: { alignItems: "center", gap: space.sm, paddingVertical: space.xl },

    inputLabel: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: space.md,
    },
    inputLabelOptional: {
      fontSize: 12,
      color: colors.textMuted,
      fontWeight: "400",
    },
    input: {
      color: colors.textPrimary,
      backgroundColor: colors.inputBackground,
      borderRadius: radius.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      marginBottom: space.md,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    inputError: {
      fontSize: 12,
      color: colors.error,
      marginTop: -space.sm,
      marginBottom: space.md,
    },
    modalHint: {
      fontSize: 13,
      color: colors.textMuted,
      marginBottom: space.md,
    },

    fieldRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: space.md,
      gap: space.md,
    },

    optionalDivider: {
      flexDirection: "row",
      alignItems: "center",
      marginVertical: space.md,
      gap: space.sm,
    },
    optionalDividerLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
    },
    optionalDividerText: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      flexShrink: 1,
    },

    loggedBlock: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      padding: 14,
      marginTop: space.lg,
    },

    macroRow: { marginBottom: space.lg, gap: 6 },
    macroLabelRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
    },
    macroLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: "500" },
    macroValue: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
    macroRange: { fontSize: 12, color: colors.textMuted, fontWeight: "400" },
    macroProgressText: { fontSize: 11, color: colors.textMuted },

    photoThumbWrap: { marginRight: space.sm, position: "relative" },
    photoThumb: { width: 110, height: 140, borderRadius: radius.lg },
    photoThumbLoading: {
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    photoThumbError: {
      backgroundColor: `${colors.error}1f`,
      alignItems: "center",
      justifyContent: "center",
    },
    photoThumbDelete: {
      position: "absolute",
      top: 6,
      right: 6,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderRadius: radius.pill,
      width: 28,
      height: 28,
      alignItems: "center",
      justifyContent: "center",
    },
    photoThumbDeleteText: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },

    dayModalHeader: {
      flexDirection: "row",
      alignItems: "center",
      padding: 20,
      paddingBottom: space.lg,
      gap: space.md,
    },
    dayModalIconCircle: {
      width: 44,
      height: 44,
      borderRadius: radius.pill,
      backgroundColor: colors.accentLight,
      alignItems: "center",
      justifyContent: "center",
    },
    dayModalIcon: { fontSize: 21 },
    dayModalHeaderText: { flex: 1 },
    dayModalTitle: {
      fontSize: 18,
      fontWeight: "700",
      letterSpacing: -0.3,
      color: colors.textPrimary,
    },
    dayModalSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
    dayModalDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.separator,
      marginHorizontal: 20,
    },
    dayModalEmptyState: { alignItems: "center", gap: space.sm, paddingVertical: 32 },
    dayModalEmptyIcon: { fontSize: 34, opacity: 0.4 },
    dayModalEmptyText: { fontSize: 14, color: colors.textMuted },
  });

export default makeStyles;

export type TrackingStyles = ReturnType<typeof makeStyles>;
