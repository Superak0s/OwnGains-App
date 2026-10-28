import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ModalSheet from "@shared/components/ModalSheet";
import { SessionDetails } from "@shared/components/SessionDetails";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { sharingApi } from "../services";
import type { SessionRecord } from "../types";
import { groupSessionExercises } from "../utils";

export async function loadFriendSessionDetails(
  friendId: string | number,
  sessionId: string | number,
): Promise<SessionRecord> {
  const details = (await sharingApi.getFriendSessionDetails(friendId, sessionId)) as SessionRecord | null;
  if (!details) throw new Error("Session details unavailable");
  return { ...details, groupedExercises: groupSessionExercises(details.setTimings) };
}

interface SessionDetailsSheetProps {
  readonly session: SessionRecord | null;
  readonly visible: boolean;
  readonly onClose: () => void;
}

export default function SessionDetailsSheet({
  session,
  visible,
  onClose,
}: SessionDetailsSheetProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title='Session Details'
      scrollable={true}
      showCancelButton={false}
      showConfirmButton={false}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.modalHeaderTitle}>Workout Details</Text>
          <View style={styles.backButton} />
        </View>
        <ScrollView style={styles.modalScroll}>
          <View style={styles.sessionDetailsContent}>
            {session && <SessionDetails session={session} />}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
    },
    backButton: { width: 80 },
    backButtonText: { fontSize: 16, color: colors.accent, fontWeight: "600" },
    modalHeaderTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.textPrimary,
    },
    modalScroll: { flex: 1, backgroundColor: colors.background },
    sessionDetailsContent: { padding: 16, paddingBottom: 40 },
  });
