import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

export function PartnerExercisePill({ username }: Readonly<{ username: string }>) {
  const { colors } = useTheme();
  const pillStyles = makePillStyles(colors);
  return (
    <View style={pillStyles.pill}>
      <View style={pillStyles.dot} />
      <Text style={pillStyles.text}>{username} is here</Text>
    </View>
  );
}

function getSetDiffLabel(diff: number | null): string {
  if (diff === null) return "Also on your partner's plan";
  if (diff === 0) return "Same sets";
  return diff > 0 ? `+${diff} partner sets` : `${diff} partner sets`;
}

function getSetDiffColors(
  colors: ThemeColors,
  diff: number | null,
): { text: string; bg: string; border: string } {
  if (diff !== null && diff > 0) {
    return {
      text: colors.warning,
      bg: colors.warningLight,
      border: colors.warning,
    };
  }
  return {
    text: colors.textSecondary,
    bg: colors.surfaceElevated,
    border: colors.surfaceBorder,
  };
}

export function PartnerExerciseMatchBadge({
  partnerSets,
  mySets,
}: Readonly<{
  partnerSets: number | null;
  mySets: number;
}>) {
  const { colors } = useTheme();
  const diff = partnerSets === null ? null : partnerSets - mySets;
  const diffText = getSetDiffLabel(diff);
  const {
    text: diffColor,
    bg: bgColor,
    border: borderColor,
  } = getSetDiffColors(colors, diff);
  return (
    <View
      style={[matchStyles.badge, { backgroundColor: bgColor, borderColor }]}
    >
      <Text style={[matchStyles.setsText, { color: diffColor }]}>
        🤝 {diffText}
      </Text>
    </View>
  );
}

export function PriorityMuscleGroupBadge({
  muscleGroup,
}: Readonly<{ muscleGroup: string }>) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        matchStyles.badge,
        { backgroundColor: colors.warningLight, borderColor: colors.warning },
      ]}
    >
      <Text style={[matchStyles.setsText, { color: colors.warning }]}>
        💪 Priority: {muscleGroup} is behind this week
      </Text>
    </View>
  );
}

const makePillStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.infoLight,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 4,
      alignSelf: "flex-start",
      marginBottom: 8,
    },
    dot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.accentDark,
    },
    text: { fontSize: 11, fontWeight: "700", color: colors.accentDark },
  });

const matchStyles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 8,
  },
  setsText: { fontSize: 11, fontWeight: "700" },
});
