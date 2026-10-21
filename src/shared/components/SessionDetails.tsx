import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { TrainerLoggedBadge } from "@shared/components/TrainerLoggedBadge";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import type { GroupedExercise, SetTiming } from "@shared/types";
import { formatTime } from "@utils/timeEstimation";
import { formatClockTime, formatDate } from "@utils/format";
import { dayLabel } from "@utils/dayCarryOver";
import { kgToDisplay } from "@features/workout/utils";

type WeightUnit = "kg" | "lbs";

interface DetailsSession {
  readonly dayNumber?: number;
  readonly dayTitle?: string;
  readonly startTime?: string | number;
  readonly endTime?: string;
  readonly totalDuration?: number;
  readonly completedSets?: number;
  readonly primaryMuscles?: string[];
  readonly groupedExercises?: GroupedExercise[];
  readonly loggedByTrainerId?: string | null;
  readonly loggedByTrainerUsername?: string | null;
}

/** The part of a "Day N — Title" day title after the dash, or "" when the day has none. */
export function sessionTitle(session: { readonly dayTitle?: string | null }): string {
  if (!session.dayTitle) return "";
  const parts = session.dayTitle.split("—");
  return parts.length > 1 ? parts[1].trim() : session.dayTitle;
}

// Shared sessions can arrive with MySQL decimals serialized as strings.
const formatSetLine = (weight: unknown, reps: unknown, unit: WeightUnit): string =>
  `${kgToDisplay(Number(weight) || 0, unit)}${unit} × ${Number(reps) || 0}`;

/** A finished session's summary and sets, with weights in the viewer's unit. */
export function SessionDetails({
  session,
}: {
  readonly session: DetailsSession;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { weightUnit } = useWorkoutPick("weightUnit");
  const title = sessionTitle(session);
  return (
    <>
      <View style={styles.detailSection}>
        <Text style={styles.detailTitle} accessibilityRole="header">
          {dayLabel(session.dayNumber)}
        </Text>
        {!!title && <Text style={styles.detailSubtitle}>{title}</Text>}
        <TrainerLoggedBadge {...session} />
        {!!session.primaryMuscles?.length && (
          <View style={styles.muscleGroupsRow}>
            {session.primaryMuscles.map((group) => (
              <View key={group} style={styles.muscleTag}>
                <Text style={styles.muscleTagText}>{group}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.detailSection}>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>
            {formatDate(session.startTime ?? "", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Start Time</Text>
          <Text style={styles.detailValue}>
            {formatClockTime(session.startTime ?? "")}
          </Text>
        </View>
        {!!session.endTime && (
          <View style={styles.detailRow} accessible>
            <Text style={styles.detailLabel}>End Time</Text>
            <Text style={styles.detailValue}>
              {formatClockTime(session.endTime)}
            </Text>
          </View>
        )}
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={styles.detailValue}>
            {formatTime(session.totalDuration ?? 0, "N/A")}
          </Text>
        </View>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Sets Completed</Text>
          <Text style={styles.detailValue}>{`${session.completedSets ?? 0}`}</Text>
        </View>
      </View>

      {!!session.groupedExercises?.length && (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle} accessibilityRole="header">
            Exercises
          </Text>
          {session.groupedExercises.map((exercise) => (
            <ExerciseCard
              key={exercise.exerciseName}
              exercise={exercise}
              weightUnit={weightUnit}
              styles={styles}
            />
          ))}
        </View>
      )}
    </>
  );
}

function ExerciseCard({
  exercise,
  weightUnit,
  styles,
}: {
  readonly exercise: GroupedExercise;
  readonly weightUnit: WeightUnit;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
        <Text style={styles.exerciseSetsCount}>{`${exercise.sets.length} sets`}</Text>
      </View>
      {exercise.sets.map((set, index) => (
        <SetRow
          key={set.id ?? `${set.setIndex}-${set.endTime}`}
          set={set}
          isFirst={index === 0}
          weightUnit={weightUnit}
          styles={styles}
        />
      ))}
    </View>
  );
}

function SetRow({
  set,
  isFirst,
  weightUnit,
  styles,
}: {
  readonly set: SetTiming;
  readonly isFirst: boolean;
  readonly weightUnit: WeightUnit;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const line = formatSetLine(set.weight, set.reps, weightUnit);
  const duration = set.setDuration ? formatTime(set.setDuration) : "";
  return (
    <View
      style={[styles.setRow, isFirst && styles.setRowFirst]}
      accessible
      accessibilityLabel={[`Set ${set.setIndex + 1}`, line, duration]
        .filter(Boolean)
        .join(", ")}
    >
      <Text style={styles.setRowIndex}>{set.setIndex + 1}</Text>
      <Text style={styles.setRowMain}>{line}</Text>
      <Text style={styles.setRowDuration}>{duration}</Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    detailSection: { marginBottom: 25 },
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
      padding: 16,
      paddingBottom: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    exerciseHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 8,
    },
    exerciseName: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.textPrimary,
      flex: 1,
    },
    exerciseSetsCount: { fontSize: 14, color: colors.accent, fontWeight: "600" },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.inputBorder,
    },
    setRowFirst: { borderTopWidth: 0 },
    setRowIndex: {
      width: 28,
      fontSize: 14,
      fontWeight: "700",
      color: colors.textMuted,
    },
    setRowMain: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    setRowDuration: { fontSize: 14, color: colors.textSecondary },
  });
