import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import type { AppMode } from "@shared/services/appMode";
import { chaptersFor, onlineChaptersFor } from "./chapters";
import { ROLE_LABELS, type PickerMode, type Role } from "./tutorialState";

const ROLES: Array<{ role: Role; icon: string; body: string }> = [
  { role: "user", icon: "🏋️", body: "Log workouts, build plans, and track your progress and body data. You'll also learn how to let a trainer help you." },
  { role: "trainer", icon: "🧑‍🏫", body: "Coach clients: get their permission, run their sessions and follow their progress." },
  { role: "both", icon: "🤝", body: "Everything for your own training, plus coaching clients." },
];

const TITLES: Record<PickerMode, string> = {
  firstRun: "How will you use OwnGains?",
  onlineTour: "You're online. What should we show you?",
  change: "Choose your tutorial track",
};

export default function RolePicker({
  mode,
  appMode,
  onPick,
  onSkip,
}: {
  readonly mode: PickerMode;
  readonly appMode: AppMode;
  readonly onPick: (role: Role) => void;
  readonly onSkip: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <View style={[StyleSheet.absoluteFill, styles.root]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title} accessibilityRole="header">{TITLES[mode]}</Text>
        <Text style={styles.subtitle}>Pick one. You can replay or switch any time in Settings → Tutorial.</Text>
        {ROLES.map(({ role, icon, body }) => {
          const chapters = (mode === "onlineTour" ? onlineChaptersFor(role) : chaptersFor(role)).length;
          const needsOnline = role !== "user" && appMode === "offline";
          return (
            <TouchableOpacity
              key={role}
              style={styles.card}
              onPress={() => onPick(role)}
              accessibilityRole="button"
              accessibilityLabel={`${ROLE_LABELS[role]}. ${body}`}
            >
              <Text style={styles.icon}>{icon}</Text>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{ROLE_LABELS[role]}</Text>
                <Text style={styles.cardBody}>{body}</Text>
                <Text style={styles.meta}>
                  {chapters} chapters{needsOnline ? " · 🌐 needs online mode" : ""}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          style={styles.skip}
          onPress={onSkip}
          accessibilityRole="button"
          accessibilityLabel={mode === "change" ? "Cancel" : "Skip the tutorial"}
        >
          <Text style={styles.skipText}>{mode === "change" ? "Cancel" : "Skip"}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { backgroundColor: colors.background },
    content: { paddingHorizontal: 20, gap: 14 },
    title: { fontSize: 26, fontWeight: "800", color: colors.textPrimary },
    subtitle: { fontSize: 15, color: colors.textSecondary, marginBottom: 8 },
    card: {
      flexDirection: "row",
      gap: 14,
      padding: 16,
      borderRadius: 18,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    icon: { fontSize: 40 },
    cardText: { flex: 1, gap: 4 },
    cardTitle: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    cardBody: { fontSize: 14, lineHeight: 20, color: colors.textSecondary },
    meta: { fontSize: 12, fontWeight: "600", color: colors.accent },
    skip: { alignSelf: "center", padding: 14 },
    skipText: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  });
