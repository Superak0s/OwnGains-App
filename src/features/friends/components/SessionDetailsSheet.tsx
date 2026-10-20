import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ModalSheet from "@shared/components/ModalSheet";
import { TrainerLoggedBadge } from "@shared/components/TrainerLoggedBadge";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import type { GroupedExercise } from "@shared/types";
import { formatTime } from "@utils/timeEstimation";
import { formatDate } from "@utils/format";
import { dayLabel } from "@utils/dayCarryOver";
import { sharingApi } from "../services";
import type { SessionRecord } from "../types";
import { groupSessionExercises } from "../utils";

export const getSessionTitle = (s: SessionRecord | null): string => {
  if (!s?.dayTitle) return `Day ${s?.dayNumber ?? ""}`;
  const p = s.dayTitle.split("—");
  return p.length > 1 ? p[1].trim() : s.dayTitle;
};

export async function loadFriendSessionDetails(
  friendId: string | number,
  sessionId: string | number,
): Promise<SessionRecord> {
  const details = (await sharingApi.getFriendSessionDetails(friendId, sessionId)) as SessionRecord | null;
  if (!details) throw new Error("Session details unavailable");
  return { ...details, groupedExercises: groupSessionExercises(details.setTimings) };
}

interface SessionExerciseGroupProps {
  readonly exercise: GroupedExercise;
  readonly styles: ReturnType<typeof makeStyles>;
}

const SessionExerciseGroup = React.memo(function SessionExerciseGroup({
  exercise,
  styles,
}: SessionExerciseGroupProps): React.JSX.Element {
  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
        <Text style={styles.exerciseSetsCount}>
          {exercise.sets.length} sets
        </Text>
      </View>
      {exercise.sets.map((set) => (
        <View
          key={set.id ?? `set-${set.setIndex}`}
          style={styles.setTimingCard}
        >
          <Text style={styles.setTimingTitle}>Set {set.setIndex + 1}</Text>
          <Text style={styles.setTimingDetail}>
            {Number.parseFloat(String(set.weight ?? 0))}kg ×{" "}
            {Number.parseInt(String(set.reps ?? 0))}
          </Text>
        </View>
      ))}
    </View>
  );
});

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
  const sessionMuscles = [
    ...(session?.primaryMuscles ?? []),
    ...(session?.secondaryMuscles ?? []),
  ];
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
            {session && (
              <>
                <View style={styles.detailSection}>
                  <Text style={styles.detailTitle}>
                    {dayLabel(session.dayNumber)}
                  </Text>
                  <Text style={styles.detailSubtitle}>
                    {getSessionTitle(session)}
                  </Text>
                  <TrainerLoggedBadge {...session} />
                  {sessionMuscles.length > 0 && (
                    <View style={styles.muscleGroupsRow}>
                      {sessionMuscles.map((g) => (
                        <View key={g} style={styles.muscleTag}>
                          <Text style={styles.muscleTagText}>{g}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
                <View style={styles.detailSection}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(
                        session.startTime as string | number,
                        {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Duration</Text>
                    <Text style={styles.detailValue}>
                      {formatTime(session.totalDuration ?? 0, "N/A")}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Sets Completed</Text>
                    <Text style={styles.detailValue}>
                      {session.completedSets ?? 0}
                    </Text>
                  </View>
                </View>
                {Array.isArray(session.groupedExercises) &&
                  session.groupedExercises.length > 0 && (
                    <View style={styles.detailSection}>
                      <Text style={styles.detailSectionTitle}>Exercises</Text>
                      {session.groupedExercises.map((exercise) => (
                        <SessionExerciseGroup
                          key={exercise.exerciseName}
                          exercise={exercise}
                          styles={styles}
                        />
                      ))}
                    </View>
                  )}
              </>
            )}
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
    detailSection: { marginBottom: 20 },
    detailTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    detailSubtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    muscleGroupsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginRight: -8,
      marginBottom: -8,
    },
    muscleTag: {
      backgroundColor: colors.accentLight,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginRight: 8,
      marginBottom: 8,
    },
    muscleTagText: { color: colors.accent, fontSize: 13, fontWeight: "500" },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    detailLabel: { fontSize: 15, color: colors.textSecondary },
    detailValue: { fontSize: 15, fontWeight: "600", color: colors.textPrimary },
    detailSectionTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    exerciseCard: {
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    exerciseHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.inputBorder,
    },
    exerciseName: {
      fontSize: 17,
      fontWeight: "bold",
      color: colors.textPrimary,
      flex: 1,
    },
    exerciseSetsCount: {
      fontSize: 14,
      color: colors.accent,
      fontWeight: "600",
    },
    setTimingCard: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    setTimingTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    setTimingDetail: { fontSize: 14, color: colors.textSecondary },
  });
