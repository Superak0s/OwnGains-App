import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { TUTORIAL } from "./chapters";

export default function TutorialIntro({
  onStart,
  onSkip,
}: {
  readonly onStart: () => void;
  readonly onSkip: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={[StyleSheet.absoluteFill, styles.root]}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
    >
      <Text style={styles.icon}>💪</Text>
      <Text style={styles.title} accessibilityRole="header">Welcome to OwnGains</Text>
      <Text style={styles.subtitle}>
        A quick tour of every screen, {TUTORIAL.length} short chapters. You can replay any of them in Settings → About → Tutorial.
      </Text>
      <TouchableOpacity style={styles.primary} onPress={onStart} accessibilityRole="button" accessibilityLabel="Start the tutorial">
        <Text style={styles.primaryText}>Start the tutorial</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.skip} onPress={onSkip} accessibilityRole="button" accessibilityLabel="Skip the tutorial">
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: { backgroundColor: colors.background },
    content: { flexGrow: 1, justifyContent: "center", paddingHorizontal: 20, gap: 14 },
    icon: { fontSize: 56, textAlign: "center" },
    title: { fontSize: 26, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
    subtitle: { fontSize: 15, lineHeight: 21, color: colors.textSecondary, textAlign: "center", marginBottom: 8 },
    primary: { backgroundColor: colors.accent, borderRadius: 14, padding: 16, alignItems: "center" },
    primaryText: { color: colors.textOnAccent, fontSize: 16, fontWeight: "700" },
    skip: { alignSelf: "center", padding: 14 },
    skipText: { fontSize: 15, fontWeight: "600", color: colors.textMuted },
  });
