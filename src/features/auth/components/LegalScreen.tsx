import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";

export interface LegalSection {
  readonly title: string;
  readonly body: string;
  /** Rendered after the body as a tappable mailto row. */
  readonly email?: string;
}

interface LegalScreenProps {
  readonly title: string;
  readonly updated: string;
  readonly sections: ReadonlyArray<LegalSection>;
  readonly onBack: () => void;
}

// A device with no mail client rejects the mailto: intent, and an unhandled
// rejection there just makes the tap do nothing.
const openEmail = async (email: string): Promise<void> => {
  try {
    await Linking.openURL(`mailto:${email}`);
  } catch {
    Alert.alert(
      "No email app",
      `This device has no email app set up. The address is ${email}.`,
      [{ text: "OK" }],
    );
  }
};

export default function LegalScreen({
  title,
  updated,
  sections,
  onBack,
}: LegalScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.backButton}
          accessibilityRole='button'
          accessibilityLabel='Go back'
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: {updated}</Text>
        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
            {section.email && (
              <TouchableOpacity
                style={styles.emailButton}
                onPress={() => void openEmail(section.email as string)}
                accessibilityRole='link'
                accessibilityLabel={`Email ${section.email}`}
              >
                <Text style={styles.emailText}>{section.email}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 8,
    },
    backButton: {
      minHeight: 44,
      justifyContent: "center",
      paddingRight: 12,
    },
    backButtonText: { color: colors.accent, fontSize: 16, fontWeight: "600" },
    title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.textPrimary },
    content: { paddingHorizontal: 24, paddingBottom: 40 },
    updated: { fontSize: 12, color: colors.textMuted, marginBottom: 20 },
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sectionBody: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    emailButton: {
      minHeight: 44,
      justifyContent: "center",
    },
    emailText: {
      fontSize: 14,
      color: colors.accent,
      fontWeight: "600",
    },
  });
