import React, { useMemo, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  type ScrollViewInstance,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";

export interface LegalSection {
  readonly title: string;
  /** Paragraphs are separated by a blank line. */
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

/** Resolves false when the device has no mail client to take the mailto: intent. */
export const openEmail = async (email: string): Promise<boolean> => {
  try {
    await Linking.openURL(`mailto:${email}`);
    return true;
  } catch {
    return false;
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
  const { alert, AlertComponent } = useAlert();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const sectionY = useRef<Record<string, number>>({});

  const emailOrExplain = async (email: string): Promise<void> => {
    if (!(await openEmail(email)))
      alert(
        "No email app",
        `This device has no email app set up. The address is ${email}.`,
        [{ text: "OK" }],
        "info",
      );
  };

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
        <Text style={styles.title} accessibilityRole='header'>
          {title}
        </Text>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.updated}>Last updated: {updated}</Text>
        <View style={styles.index}>
          <Text style={styles.indexTitle}>Contents</Text>
          {sections.map((section) => (
            <TouchableOpacity
              key={section.title}
              style={styles.indexLink}
              onPress={() =>
                scrollRef.current?.scrollTo({ y: sectionY.current[section.title] ?? 0 })
              }
              accessibilityRole='link'
              accessibilityLabel={`Jump to ${section.title}`}
            >
              <Text style={styles.indexLinkText}>{section.title}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {sections.map((section) => (
          <View
            key={section.title}
            style={styles.section}
            onLayout={(e) => {
              sectionY.current[section.title] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.sectionTitle} accessibilityRole='header'>
              {section.title}
            </Text>
            {section.body.split("\n\n").map((paragraph) => (
              <Text key={paragraph} style={styles.sectionBody}>
                {paragraph}
              </Text>
            ))}
            {section.email && (
              <TouchableOpacity
                style={styles.emailButton}
                onPress={() => void emailOrExplain(section.email as string)}
                accessibilityRole='link'
                accessibilityLabel={`Email ${section.email}`}
              >
                <Text style={styles.emailText}>{section.email}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </ScrollView>
      {AlertComponent}
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
    index: { marginBottom: 24 },
    indexTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    indexLink: { minHeight: 44, justifyContent: "center" },
    indexLinkText: { fontSize: 14, color: colors.accent, fontWeight: "600" },
    section: { marginBottom: 20 },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sectionBody: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
      marginBottom: 10,
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
