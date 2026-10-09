import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { FillBar } from "@shared/components/FillBar";
import ModalSheet from "@shared/components/ModalSheet";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { WorkoutData, FullSessionWithGroups } from "@shared/types";
import type { CompletedDays } from "../types";
import { loadFromStorage, STORAGE_KEYS } from "@shared/services/storage";
import {
  buildTrainingSetEntries,
  getPeriodDateRange,
  aggregateTrainingSummary,
  getUndertrainedMuscleGroups,
  type SummaryPeriod,
  type DateRange,
  type UndertrainedCalculationMode,
} from "../utils/trainingSummary";
import { muscleLabel as formatMuscleLabel } from "@utils/exerciseDb";
import { toDateString } from "@utils/format";

const MUSCLE_GROUP_BAR_COLORS = [
  "#4C6EF5",
  "#12B886",
  "#FA5252",
  "#FAB005",
  "#7950F2",
  "#15AABF",
  "#E64980",
  "#82C91E",
];

type Session = Pick<
  FullSessionWithGroups,
  "dayNumber" | "startTime" | "setTimings"
>;

const PERIOD_OPTIONS: { key: SummaryPeriod; label: string }[] = [
  { key: "quarter", label: "Last 90 Days" },
  { key: "month", label: "Last 30 Days" },
  { key: "week", label: "This Week" },
  { key: "custom", label: "Custom" },
];

interface Props {
  readonly sessions?: Session[];
  readonly workoutData?: WorkoutData | null;
  readonly selectedSplit?: string | null;
  readonly completedDays?: CompletedDays;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  readonly userId?: string | number | null;
}

export default function TrainingSummaryTab({
  sessions = [],
  workoutData = null,
  selectedSplit = null,
  completedDays = {},
  isLoading = false,
  error = null,
  userId = null,
}: Readonly<Props>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>("quarter");
  const [summaryCustomRange, setSummaryCustomRange] =
    useState<DateRange | null>(null);
  const [showSummaryRangePicker, setShowSummaryRangePicker] = useState(false);
  const [pendingRangeStart, setPendingRangeStart] = useState<Date | null>(null);
  const [calculationMode, setCalculationMode] = useState<UndertrainedCalculationMode>("days_done");

  useEffect(() => {
    (async () => {
      const mode = await loadFromStorage<string>(
        STORAGE_KEYS.UNDERTRAINED_CALCULATION_MODE,
        userId == null ? null : String(userId),
        false,
      );
      if (mode) setCalculationMode(mode as UndertrainedCalculationMode);
    })();
  }, [userId]);

  const allSetEntries = useMemo(
    () =>
      buildTrainingSetEntries(
        sessions,
        workoutData,
        selectedSplit,
        completedDays,
      ),
    [sessions, workoutData, selectedSplit, completedDays],
  );

  const trainedDays = useMemo(
    () => new Set(allSetEntries.map((entry) => toDateString(entry.date))),
    [allSetEntries],
  );

  const summaryRange = useMemo(
    () => getPeriodDateRange(summaryPeriod, summaryCustomRange),
    [summaryPeriod, summaryCustomRange],
  );

  const getRangeDecoration = (date: Date) => {
    const day = toDateString(date);
    if (pendingRangeStart) {
      return day === toDateString(pendingRangeStart)
        ? { backgroundColor: colors.accent, textColor: colors.textOnAccent }
        : null;
    }
    if (summaryPeriod !== "custom" || !summaryCustomRange) return null;
    const { start, end } = summaryRange;
    if (date < start || date > end) return null;
    const isEdge =
      day === toDateString(start) || day === toDateString(end);
    return isEdge
      ? { backgroundColor: colors.accent, textColor: colors.textOnAccent }
      : { backgroundColor: colors.accentLight };
  };

  const trainingSummary = useMemo(
    () => aggregateTrainingSummary(allSetEntries, summaryRange),
    [allSetEntries, summaryRange],
  );

  const undertrainedGroups = useMemo(
    () =>
      getUndertrainedMuscleGroups(
        allSetEntries,
        workoutData,
        selectedSplit,
        new Date(),
        calculationMode,
      ),
    [allSetEntries, workoutData, selectedSplit, calculationMode],
  );
  const topUndertrained = undertrainedGroups[0] ?? null;

  const handleSummaryRangeDatePress = (date: Date) => {
    if (!pendingRangeStart) {
      setPendingRangeStart(date);
      return;
    }
    setSummaryCustomRange({ start: pendingRangeStart, end: date });
    setPendingRangeStart(null);
    setShowSummaryRangePicker(false);
    setSummaryPeriod("custom");
  };

  if (isLoading) {
    return (
      <View style={styles.emptyContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading sessions...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>⚠️</Text>
        <Text style={styles.emptyTitle}>Something went wrong</Text>
        <Text style={styles.emptyText}>{error}</Text>
      </View>
    );
  }

  const maxMuscleSets = trainingSummary.primaryMuscles[0]?.sets ?? 0;

  return (
    <View style={styles.container}>
      {topUndertrained && (
        <View style={styles.undertrainedCard}>
          <Text style={styles.undertrainedTitle}>
            💪 {topUndertrained.primaryMuscle} is behind this week
          </Text>
          <Text style={styles.undertrainedSubtitle}>
            {Math.round(topUndertrained.deltaFromAvg)} points below average:{" "}
            {topUndertrained.actualSets} of {topUndertrained.targetSets} planned
            sets
          </Text>
        </View>
      )}

      <View style={styles.periodRow}>
        {PERIOD_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.key}
            style={[
              styles.periodChip,
              summaryPeriod === option.key && styles.periodChipActive,
            ]}
            onPress={() => {
              if (option.key === "custom") {
                setPendingRangeStart(null);
                setShowSummaryRangePicker(true);
                return;
              }
              setSummaryPeriod(option.key);
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={[
                styles.periodChipText,
                summaryPeriod === option.key && styles.periodChipTextActive,
              ]}
            >
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {trainingSummary.primaryMuscles.length === 0 ? (
        <Text style={styles.emptyMuted}>
          No sets logged in this period yet.
        </Text>
      ) : (
        <>
          <Text style={styles.listHeader}>By Muscle Group</Text>
          {trainingSummary.primaryMuscles.map((row, i) => (
            <View key={row.primaryMuscle} style={styles.muscleRow}>
              <Text style={styles.muscleName} numberOfLines={2}>
                {row.primaryMuscle}
              </Text>
              <FillBar
                percentage={
                  maxMuscleSets > 0 ? (row.sets / maxMuscleSets) * 100 : 0
                }
                color={
                  MUSCLE_GROUP_BAR_COLORS[i % MUSCLE_GROUP_BAR_COLORS.length]
                }
                styles={{ track: styles.muscleTrack, fill: styles.muscleFill }}
              />
              <Text style={styles.muscleSets}>{row.sets}</Text>
            </View>
          ))}

          <Text style={styles.listHeader}>By Exercise</Text>
          {trainingSummary.exercises.slice(0, 15).map((row) => {
            const muscleLabel = formatMuscleLabel(
              row.primaryMuscles,
              row.secondaryMuscles,
            );
            return (
              <View key={row.exerciseName} style={styles.listRow}>
                <View style={styles.listRowLeft}>
                  <Text style={styles.listRowText}>{row.exerciseName}</Text>
                  {muscleLabel ? (
                    <Text style={styles.listRowMuscle}>{muscleLabel}</Text>
                  ) : null}
                </View>
                <Text style={styles.listRowValue}>{row.sets} sets</Text>
              </View>
            );
          })}
          {trainingSummary.exercises.length > 15 && (
            <Text style={styles.emptyMuted}>
              +{trainingSummary.exercises.length - 15} more
            </Text>
          )}
        </>
      )}

      <ModalSheet
        visible={showSummaryRangePicker}
        onClose={() => {
          setShowSummaryRangePicker(false);
          setPendingRangeStart(null);
        }}
        title={pendingRangeStart ? "Select end date" : "Select start date"}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <UniversalCalendar
          hasDataOnDate={(date) => trainedDays.has(toDateString(date))}
          getDayDecoration={getRangeDecoration}
          onDatePress={handleSummaryRangeDatePress}
          initialView="month"
          legendText="Tap a start date, then an end date"
        />
      </ModalSheet>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, paddingBottom: 20 },
    undertrainedCard: {
      backgroundColor: colors.warningLight,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    undertrainedTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.warning,
    },
    undertrainedSubtitle: { fontSize: 12, color: colors.warning, marginTop: 2 },
    periodRow: { flexDirection: "row", gap: 6, marginBottom: 10 },
    periodChip: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 8,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    periodChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    periodChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    periodChipTextActive: { color: colors.surface },
    muscleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 5,
    },
    muscleName: { width: 96, fontSize: 13, color: colors.textPrimary },
    muscleTrack: {
      flex: 1,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.surfaceBorder,
      overflow: "hidden",
    },
    muscleFill: { height: "100%", borderRadius: 5 },
    muscleSets: {
      width: 26,
      textAlign: "right",
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    listHeader: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginTop: 4,
      marginBottom: 8,
    },
    listRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
    },
    listRowLeft: { flex: 1 },
    listRowText: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    listRowMuscle: { fontSize: 13, color: colors.textSecondary },
    listRowValue: { fontSize: 13, color: colors.success, fontWeight: "600" },
    emptyMuted: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 40,
    },
    emptyIcon: { fontSize: 64, marginBottom: 20 },
    emptyTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: "center",
    },
    emptyText: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 24,
    },
    loadingText: { marginTop: 12, fontSize: 16, color: colors.textSecondary },
  });
