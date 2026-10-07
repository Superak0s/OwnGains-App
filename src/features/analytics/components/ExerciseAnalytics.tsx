import React, { useState, useEffect, useMemo } from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  RefreshControl,
  Dimensions,
} from "react-native";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import ProgressChart from "@shared/components/ProgressChart";
import ModalSheet from "@shared/components/ModalSheet";
import ScrollTabBar from "@shared/components/ScrollTabBar";
import TrainingSummaryTab from "./TrainingSummaryTab";
import {
  formatDate as formatDateUtil,
  formatClockTime,
  toDateString,
} from "@utils/format";
import type {
  WorkoutData,
  FullSessionWithGroups,
  WidgetInstance,
} from "@shared/types";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { useWidgets, useWidgetBoard } from "@shared/context/hooks/useWidgets";
import WidgetGallery from "@shared/components/widgets/WidgetGallery";
import WidgetEditButton from "@shared/components/widgets/WidgetEditButton";
import {
  WidgetPullHint,
  WidgetEditHeader,
} from "@shared/components/widgets/WidgetBoardChrome";
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel";
import { embedInstance } from "@shared/components/widgets/embedWidget";
import {
  ANALYTICS_WIDGET_REGISTRY,
  DEFAULT_ANALYTICS_WIDGETS,
  fitsFocus,
  type AnalyticsWidgetType,
} from "../widgets";
import {
  WEEKLY_SET_TARGET,
  buildTrainingSetEntries,
  muscleCredit,
  weeklySetVolume,
} from "../utils/trainingSummary";
import type { CompletedDays, ExerciseHistoryEntry } from "../types";
import {
  buildAvailableExercises,
  buildExerciseHistory,
  buildProgressChartData,
  computeExerciseInsights,
  computeExerciseStats,
  dedupeHistory,
  exerciseBreakdown,
  workingSets,
} from "../utils/exerciseStats";
import type { ChartData, PersonalRecord } from "../utils/exerciseStats";
import { STORAGE_KEYS } from "@shared/services/storage";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { KG_TO_LBS, kgToDisplay } from "@features/workout/utils";
import {
  useExerciseSelection,
  setSelectedExercise,
  setSelectedMuscleGroup,
  hasAutoSelectedExercise,
  setAutoSelectedExercise,
} from "../utils/exerciseSelection";
import { SCREEN_PADDING } from "@shared/layout";

type FocusMode = "exercise" | "muscleGroup" | "training_summary";

const NO_SESSIONS: FullSessionWithGroups[] = [];

const FOCUS_MODE_TABS = [
  { key: "exercise", label: "Exercise" },
  { key: "muscleGroup", label: "Muscle Group" },
  { key: "training_summary", label: "Training Summary" },
];

const { width: screenWidth } = Dimensions.get("window");
// Extra horizontal padding a chart eats once it's nested inside a widget
// card (the card itself pads 14 on each side) on top of the outer content
// padding already subtracted from containerWidth.
const WIDGET_CARD_PADDING = 28;

const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
};

type ProgressWidgetType = "weight_progress" | "reps_progress";

const PROGRESS_WIDGET_CONFIG: Record<
  ProgressWidgetType,
  {
    title: string;
    icon: string;
    metric: "weight" | "reps";
    emptyText: string;
  }
> = {
  weight_progress: {
    title: "Weight Progress",
    icon: "💪",
    metric: "weight",
    emptyText: "No data yet to chart weight progress.",
  },
  reps_progress: {
    title: "Reps Progress",
    icon: "🔢",
    metric: "reps",
    emptyText: "No data yet to chart reps progress.",
  },
};

const chartInUnit = (chart: ChartData, unit: "kg" | "lbs"): ChartData =>
  unit === "kg"
    ? chart
    : {
        ...chart,
        datasets: chart.datasets.map((set) => ({
          data: set.data.map((kg) => Math.round(kg * KG_TO_LBS * 10) / 10),
        })),
      };

const fmt = (value?: number | null): string => {
  const n = Number.parseFloat(String(value ?? 0));
  if (!Number.isFinite(n)) return "0";
  return Number.parseFloat(n.toFixed(2)).toString();
};

const signedPercent = (value: number): string =>
  `${value > 0 ? "+" : ""}${fmt(value)}%`;

const restLabel = (seconds: number | null): string =>
  seconds === null
    ? "—"
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;

interface ExerciseAnalyticsProps {
  readonly sessions?: FullSessionWithGroups[];
  /** Older sessions trimmed to their record-setting sets, for the all-time records. */
  readonly recordSessions?: FullSessionWithGroups[];
  /** The records cover all history, not just `sessions`. */
  readonly recordsAllTime?: boolean;
  readonly workoutData?: WorkoutData | null;
  readonly selectedSplit?: string | null;
  readonly completedDays?: CompletedDays;
  readonly currentBodyWeight?: number | null;
  readonly onRefresh?: (() => void) | null;
  readonly refreshing?: boolean;
  readonly title?: string;
  readonly isLoading?: boolean;
  readonly error?: string | null;
  /** Used to key widget layout persistence per-user, same as HomeScreen. */
  readonly userId?: string | number | null;
  /** Render just this one widget instead of the whole analytics board, for
   *  hosting an analytics widget on another screen's board. */
  readonly embedWidget?: AnalyticsWidgetType;
  /** The most sessions `sessions` can hold. Reaching it means older ones were cut off. */
  readonly historyLimit?: number | null;
}

export default function ExerciseAnalytics({
  sessions = [],
  recordSessions = NO_SESSIONS,
  recordsAllTime = false,
  workoutData = null,
  selectedSplit = null,
  completedDays = {},
  currentBodyWeight = null,
  onRefresh = null,
  refreshing = false,
  title = "Progress",
  isLoading = false,
  error = null,
  userId = null,
  embedWidget,
  historyLimit = null,
}: Readonly<ExerciseAnalyticsProps>) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { weightUnit } = useWorkoutPick("weightUnit");
  const load = (kg?: number | null): string =>
    `${kgToDisplay(Number.parseFloat(fmt(kg)), weightUnit)}${weightUnit}`;
  const { exercise: selectedExercise, muscleGroup: selectedMuscleGroup } =
    useExerciseSelection();
  const [focusMode, setFocusMode] = useState<FocusMode>("exercise");
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showZeroSetExercises, setShowZeroSetExercises] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDateSets, setShowDateSets] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const {
    widgets,
    isLoaded: widgetsLoaded,
    availableToAdd,
    addWidget,
    removeWidget,
    cycleWidgetSize,
    reorderWidgets,
  } = useWidgets<AnalyticsWidgetType>(userId == null ? null : String(userId), {
    registry: ANALYTICS_WIDGET_REGISTRY,
    defaults: DEFAULT_ANALYTICS_WIDGETS,
    storageKey: STORAGE_KEYS.ANALYTICS_WIDGETS,
  });

  // Two-finger pull brings up the "deploy" panel for adding widgets. To
  // rearrange, resize, or remove widgets already on the screen, open that
  // same panel and tap "Edit Widgets". It closes the panel and switches
  // this screen into edit mode. Disabled on training_summary since that tab
  // has no widgets of its own, so pulling there shouldn't pop the analytics
  // widget gallery over unrelated content. Add failures show no alert: this
  // component has no alert plumbing, so the gallery just remains open.
  const widgetBoard = useWidgetBoard(addWidget, {
    pullEnabled: focusMode !== "training_summary",
  });

  const isGroupFocus = focusMode === "muscleGroup";
  const selection = isGroupFocus ? selectedMuscleGroup : selectedExercise;
  const selectPrompt = isGroupFocus
    ? "Select a muscle group"
    : "Select an exercise";

  const historySources = useMemo(
    () => ({ sessions, workoutData, selectedSplit, completedDays }),
    [sessions, workoutData, selectedSplit, completedDays],
  );

  const availableExercises = useMemo(
    () => buildAvailableExercises(historySources),
    [historySources],
  );

  useEffect(() => {
    if (availableExercises.length === 0 || hasAutoSelectedExercise()) return;
    setAutoSelectedExercise(true);
    const firstWithData = availableExercises.find((e) => e.totalSets > 0);
    setSelectedExercise(firstWithData?.name ?? availableExercises[0].name);
  }, [availableExercises]);

  // Only a split change invalidates the auto-picked exercise. Re-running this
  // on every `sessions` refresh would clobber the user's own pick.
  useEffect(() => {
    setAutoSelectedExercise(false);
  }, [selectedSplit]);

  const exerciseData = useMemo((): ExerciseHistoryEntry[] | null => {
    if (!selection) return null;
    const history = buildExerciseHistory(historySources, {
      selection,
      isGroupFocus,
      currentBodyWeight,
    });
    return dedupeHistory(history);
  }, [historySources, selection, isGroupFocus, currentBodyWeight]);

  // Warm-up sets stay in `exerciseData` for the calendar/day breakdown, but
  // they would skew every average, max and trend below.
  const workingSetData = useMemo(
    () => (exerciseData ? workingSets(exerciseData) : null),
    [exerciseData],
  );

  const recordSetData = useMemo((): ExerciseHistoryEntry[] => {
    if (!selection || recordSessions.length === 0) return [];
    const history = buildExerciseHistory(
      {
        sessions: recordSessions,
        workoutData: null,
        selectedSplit: null,
        completedDays: {},
      },
      { selection, isGroupFocus, currentBodyWeight },
    );
    return workingSets(history);
  }, [recordSessions, selection, isGroupFocus, currentBodyWeight]);

  const insights = useMemo(
    () => computeExerciseInsights(workingSetData, recordSetData),
    [workingSetData, recordSetData],
  );
  const stats = useMemo(
    () => computeExerciseStats(workingSetData),
    [workingSetData],
  );
  const chartDataByMetric = useMemo(
    () => ({
      weight: chartInUnit(
        buildProgressChartData(workingSetData, "weight"),
        weightUnit,
      ),
      reps: buildProgressChartData(workingSetData, "reps"),
      oneRepMax: chartInUnit(
        buildProgressChartData(workingSetData, "oneRepMax"),
        weightUnit,
      ),
    }),
    [workingSetData, weightUnit],
  );

  const trainingEntries = useMemo(
    () =>
      buildTrainingSetEntries(
        sessions,
        workoutData,
        selectedSplit,
        completedDays,
      ),
    [sessions, workoutData, selectedSplit, completedDays],
  );
  const weeklyVolume = useMemo(() => {
    if (!selection) return null;
    return weeklySetVolume(
      trainingEntries,
      isGroupFocus
        ? muscleCredit(selection)
        : (entry) => (entry.exerciseName === selection ? 1 : 0),
    );
  }, [trainingEntries, selection, isGroupFocus]);

  const groupExercises = useMemo(
    () => (isGroupFocus && exerciseData ? exerciseBreakdown(exerciseData) : []),
    [isGroupFocus, exerciseData],
  );

  const setDates = useMemo(
    () => new Set((exerciseData ?? []).map((set) => toDateString(set.date))),
    [exerciseData],
  );

  const getSetsForDate = (date: Date): ExerciseHistoryEntry[] =>
    exerciseData?.filter(
      (set) => toDateString(set.date) === toDateString(date),
    ) ?? [];

  const hasSetsOnDate = (date: Date): boolean =>
    setDates.has(toDateString(date));

  const handleDatePress = (date: Date) => {
    if (!hasSetsOnDate(date)) return;
    setSelectedDate(date);
    setShowDateSets(true);
  };

  const filteredExercises = useMemo(
    () =>
      availableExercises.filter((exercise) => {
        const query = searchQuery.toLowerCase();
        const matchesSearch =
          searchQuery.length === 0 ||
          exercise.name.toLowerCase().includes(query) ||
          exercise.primaryMuscles.some((muscle) =>
            muscle.toLowerCase().includes(query),
          );
        const hasData = exercise.totalSets > 0 || showZeroSetExercises;
        return matchesSearch && hasData;
      }),
    [availableExercises, searchQuery, showZeroSetExercises],
  );
  const zeroSetExerciseCount = useMemo(
    () => availableExercises.filter((e) => e.totalSets === 0).length,
    [availableExercises],
  );

  const selectedExerciseMeta = availableExercises.find(
    (e) => e.name === selectedExercise,
  );
  const chartWidth = (containerWidth || screenWidth - 40) - WIDGET_CARD_PADDING;

  const distinctMuscleGroups = useMemo(
    () =>
      Array.from(
        new Set(
          availableExercises
            .filter((e) => e.totalSets > 0)
            .flatMap((e) => e.primaryMuscles),
        ),
      ).sort((a, b) => a.localeCompare(b)),
    [availableExercises],
  );
  const mutedLine = (text: string): React.ReactNode => (
    <Text style={styles.widgetLineMuted}>{text}</Text>
  );

  const historyWindowNote =
    historyLimit != null && sessions.length >= historyLimit
      ? mutedLine(`Based on your last ${historyLimit} workouts.`)
      : null;
  const recordsWindowNote = recordsAllTime ? null : historyWindowNote;

  const statTile = (value: string, label: string): React.ReactNode => (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const wideStatTile = (value: string, label: string): React.ReactNode => (
    <View style={styles.statCardWide}>
      <Text style={styles.statValueSmall}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const renderSelectExerciseWidget = (): React.ReactNode => (
    <View>
      {selectedExercise &&
        focusMode === "exercise" &&
        selectedExerciseMeta?.name.toLowerCase().includes("assisted") &&
        !currentBodyWeight && (
          <View style={styles.warningBanner}>
            <Text style={styles.warningIcon}>⚠️</Text>
            <View style={styles.warningTextContainer}>
              <Text style={styles.warningTitle}>Body Weight Required</Text>
              <Text style={styles.warningText}>
                Body weight needed for accurate assisted exercise calculations
              </Text>
            </View>
          </View>
        )}
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={() => setShowDropdown(true)}
        accessibilityRole='button'
        accessibilityLabel={`${selection ?? selectPrompt}, change selection`}
        accessibilityState={{ expanded: showDropdown }}
      >
        <View style={styles.dropdownButtonContent}>
          <View style={styles.dropdownButtonLeft}>
            <Text style={styles.dropdownButtonText}>
              {selection ?? selectPrompt}
            </Text>
            {focusMode === "exercise" &&
              selectedExercise &&
              !!selectedExerciseMeta?.primaryMuscles.length && (
                <Text style={styles.dropdownButtonSubtext}>
                  {selectedExerciseMeta.primaryMuscles.join(", ")}
                </Text>
              )}
          </View>
          <Text style={styles.dropdownArrow}>▼</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  const renderSetDataWidget = (): React.ReactNode => {
    if (!selection) return mutedLine(`${selectPrompt} to see its stats here.`);
    if (!exerciseData?.length) {
      return (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataIcon}>📭</Text>
          <Text style={styles.noDataTitle}>No Data Yet</Text>
          <Text style={styles.noDataText}>
            No completed sets for "{selection}"
          </Text>
        </View>
      );
    }
    return (
      <View>
        <View style={styles.statsGrid}>
          {statTile(String(stats.totalSets), "Total Sets")}
          {statTile(String(stats.totalWorkouts), "Workouts")}
          {statTile(load(stats.extremeWeight), stats.extremeWeightLabel)}
          {statTile(String(stats.maxReps), "Max Reps")}
        </View>

        <View style={styles.statsRow}>
          {wideStatTile(load(stats.avgWeight), "Avg Weight")}
          {wideStatTile(fmt(stats.avgReps), "Avg Reps")}
        </View>
      </View>
    );
  };

  const renderLastWorkoutWidget = (): React.ReactNode => {
    if (!selection)
      return mutedLine(`${selectPrompt} to see your last workout.`);
    if (!stats.lastWorkout)
      return mutedLine(`No workouts logged yet for "${selection}".`);
    return (
      <View style={styles.lastWorkoutCardWidget}>
        <Text style={styles.lastWorkoutDate}>
          {formatDateUtil(stats.lastWorkout, LONG_DATE)}
        </Text>
      </View>
    );
  };

  const renderProgressWidget = (type: ProgressWidgetType): React.ReactNode => {
    const config = PROGRESS_WIDGET_CONFIG[type];
    if (!selection || !exerciseData?.length) return mutedLine(config.emptyText);
    return (
      <ProgressChart
        title={config.title}
        icon={config.icon}
        data={chartDataByMetric[config.metric]}
        yAxisSuffix={config.metric === "weight" ? weightUnit : undefined}
        chartWidth={chartWidth}
      />
    );
  };

  const renderWorkoutHistoryWidget = (): React.ReactNode => {
    if (!selection)
      return mutedLine(`${selectPrompt} to see its history here.`);
    if (!exerciseData?.length)
      return mutedLine("No completed sets to show on the calendar yet.");
    return (
      <UniversalCalendar
        hasDataOnDate={hasSetsOnDate}
        onDatePress={handleDatePress}
        initialView='week'
        legendText={`Workout day for ${selection}`}
        dotColor={colors.success}
      />
    );
  };

  const renderInsightGuard = (emptyText: string): React.ReactNode | null => {
    if (!selection) return mutedLine(`${selectPrompt} to see this.`);
    if (insights.workingSetCount === 0) return mutedLine(emptyText);
    return null;
  };

  const volumeVerdict = (sets: number): string => {
    if (sets < WEEKLY_SET_TARGET.min)
      return `Below the ${WEEKLY_SET_TARGET.min} sets a week most muscles need to grow.`;
    if (sets > WEEKLY_SET_TARGET.max)
      return `Above ${WEEKLY_SET_TARGET.max} sets a week, where extra sets add little.`;
    return `Inside the ${WEEKLY_SET_TARGET.min} to ${WEEKLY_SET_TARGET.max} sets a week range.`;
  };

  const renderWeeklyVolumeWidget = (): React.ReactNode => {
    if (!selection || !weeklyVolume)
      return mutedLine(`${selectPrompt} to see its weekly sets.`);
    const { thisWeek, average } = weeklyVolume;
    return (
      <View>
        <View style={styles.statsRow}>
          {wideStatTile(fmt(thisWeek), "This Week")}
          {wideStatTile(average === null ? "—" : fmt(average), "4-Week Avg")}
        </View>
        {isGroupFocus &&
          mutedLine(
            `${volumeVerdict(average ?? thisWeek)} Secondary muscles count as half a set.`,
          )}
      </View>
    );
  };

  const trendLabel = (change: number): string => {
    if (change > 0) return `▲ ${signedPercent(change)}`;
    if (change < 0) return `▼ ${signedPercent(change)}`;
    return "No change";
  };

  const renderGroupExercisesWidget = (): React.ReactNode => {
    if (!isGroupFocus) return mutedLine("Pick a muscle group to see this.");
    if (groupExercises.length === 0)
      return mutedLine(`No working sets for "${selection ?? ""}" yet.`);
    return (
      <View>
        {groupExercises.map((row) => (
          <TouchableOpacity
            key={row.exerciseName}
            style={styles.insightRow}
            accessibilityRole='button'
            accessibilityLabel={`Analyze ${row.exerciseName}`}
            onPress={() => {
              setSelectedExercise(row.exerciseName);
              setFocusMode("exercise");
            }}
          >
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.insightRowLabel}>{row.exerciseName}</Text>
              <Text style={styles.insightRowMeta}>{row.sets} sets</Text>
            </View>
            <View style={styles.insightRowRight}>
              <Text style={styles.insightRowValue}>
                {load(row.currentOneRepMax)}
              </Text>
              <Text style={styles.insightRowMeta}>
                {trendLabel(row.oneRepMaxChange30d)} · 30 days
              </Text>
            </View>
          </TouchableOpacity>
        ))}
        {historyWindowNote}
      </View>
    );
  };

  const renderOneRepMaxWidget = (): React.ReactNode => {
    const guard = renderInsightGuard(
      "No working sets yet. Warm-ups don't count towards your 1RM.",
    );
    if (guard) return guard;
    return (
      <View>
        <View style={styles.statsGrid}>
          {statTile(load(insights.currentOneRepMax), "Current 1RM")}
          {statTile(load(insights.bestOneRepMax), "Best 1RM")}
        </View>
        <View style={styles.statsRow}>
          {wideStatTile(
            signedPercent(insights.oneRepMaxChange30d),
            "Last 30 Days",
          )}
          {wideStatTile(
            signedPercent(insights.oneRepMaxChange90d),
            "Last 90 Days",
          )}
        </View>
        <ProgressChart
          title='Estimated 1RM'
          data={chartDataByMetric.oneRepMax}
          yAxisSuffix={weightUnit}
          chartWidth={chartWidth}
        />
        {historyWindowNote}
      </View>
    );
  };

  const renderRecordRow = (
    label: string,
    record: PersonalRecord | null,
    format: (value: number) => string,
  ): React.ReactNode => (
    <View style={styles.insightRow} key={label}>
      <Text style={styles.insightRowLabel}>{label}</Text>
      <View style={styles.insightRowRight}>
        <Text style={styles.insightRowValue}>
          {record ? format(record.value) : "—"}
        </Text>
        {record && (
          <Text style={styles.insightRowMeta}>
            {record.reps} reps · {formatDateUtil(record.date)}
          </Text>
        )}
      </View>
    </View>
  );

  const renderPersonalRecordsWidget = (): React.ReactNode => {
    const guard = renderInsightGuard("No working sets to draw records from.");
    if (guard) return guard;
    const { records } = insights;
    return (
      <View>
        {renderRecordRow("Heaviest Set", records.heaviestSet, load)}
        {renderRecordRow("Most Reps", records.mostReps, fmt)}
        {renderRecordRow("Best Estimated 1RM", records.bestOneRepMax, load)}
        {insights.repMaxTable.length > 0 && (
          <Text style={styles.insightSubheading}>Best at each rep count</Text>
        )}
        {insights.repMaxTable.map((row) => (
          <View style={styles.insightRow} key={row.reps}>
            <Text style={styles.insightRowLabel}>
              {row.reps} rep{row.reps === 1 ? "" : "s"}
            </Text>
            <View style={styles.insightRowRight}>
              <Text style={styles.insightRowValue}>{load(row.load)}</Text>
              <Text style={styles.insightRowMeta}>
                {formatDateUtil(row.date)}
              </Text>
            </View>
          </View>
        ))}
        {recordsWindowNote}
      </View>
    );
  };

  const renderProgressRateWidget = (): React.ReactNode => {
    const guard = renderInsightGuard(
      "Log a few sessions to see how fast you're progressing.",
    );
    if (guard) return guard;
    return (
      <View>
        <View style={styles.statsRow}>
          {wideStatTile(
            `${insights.progressPerWeek > 0 ? "+" : ""}${load(insights.progressPerWeek)}`,
            "1RM per Week",
          )}
          {wideStatTile(
            insights.weeksSinceRecord === null
              ? "—"
              : `${fmt(insights.weeksSinceRecord)}w`,
            "Since Last PR",
          )}
        </View>
        {insights.isStalled && (
          <View style={styles.insightBadge}>
            <Text style={styles.insightBadgeText}>
              ⚠️ No new personal record in over 4 weeks
            </Text>
          </View>
        )}
        {recordsWindowNote}
      </View>
    );
  };

  const renderRepDistributionWidget = (): React.ReactNode => {
    const guard = renderInsightGuard("No working sets to break down yet.");
    if (guard) return guard;
    const { repRanges } = insights;
    return (
      <View style={styles.statsRow}>
        {wideStatTile(`${repRanges.strength}%`, `Strength\n1-5 reps`)}
        {wideStatTile(`${repRanges.hypertrophy}%`, `Hypertrophy\n6-12 reps`)}
        {wideStatTile(`${repRanges.endurance}%`, `Endurance\n13+ reps`)}
      </View>
    );
  };

  const renderTrainingFrequencyWidget = (): React.ReactNode => {
    const guard = renderInsightGuard("No sessions logged for this exercise.");
    if (guard) return guard;
    return (
      <View style={styles.statsRow}>
        {wideStatTile(fmt(insights.sessionsPerWeek), "Sessions / Week")}
        {wideStatTile(
          insights.medianDaysBetween === null
            ? "—"
            : `${fmt(insights.medianDaysBetween)}d`,
          "Typical Gap",
        )}
        {wideStatTile(
          insights.daysSinceLast === null ? "—" : `${insights.daysSinceLast}d`,
          "Since Last",
        )}
      </View>
    );
  };

  const renderSetEfficiencyWidget = (): React.ReactNode => {
    const guard = renderInsightGuard(
      "Needs at least two working sets in a session.",
    );
    if (guard) return guard;
    return (
      <View>
        <View style={styles.statsRow}>
          {wideStatTile(restLabel(insights.medianRestSec), "Typical Rest")}
          {wideStatTile(
            insights.dropOffPct === null ? "—" : `${fmt(insights.dropOffPct)}%`,
            "Rep Drop-off",
          )}
        </View>
        {insights.restPerformance &&
          mutedLine(
            `Resting ${restLabel(insights.restPerformance.longRestSec)}: ${fmt(
              insights.restPerformance.longRestDropOffPct,
            )}% drop-off · ${restLabel(
              insights.restPerformance.shortRestSec,
            )}: ${fmt(insights.restPerformance.shortRestDropOffPct)}%`,
          )}
      </View>
    );
  };

  const renderWidgetContent = (
    instance: WidgetInstance<AnalyticsWidgetType>,
  ): React.ReactNode => {
    if (!embedWidget && !fitsFocus(instance.type, isGroupFocus))
      return mutedLine(
        isGroupFocus
          ? "Shown for one exercise, since weight from different exercises can't be compared."
          : "Shown for a muscle group.",
      );
    switch (instance.type) {
      case "select_exercise":
        return renderSelectExerciseWidget();
      case "workout_history":
        return renderWorkoutHistoryWidget();
      case "set_data":
        return renderSetDataWidget();
      case "last_workout":
        return renderLastWorkoutWidget();
      case "weight_progress":
      case "reps_progress":
        return renderProgressWidget(instance.type);
      case "weekly_volume":
        return renderWeeklyVolumeWidget();
      case "group_exercises":
        return renderGroupExercisesWidget();
      case "one_rep_max":
        return renderOneRepMaxWidget();
      case "personal_records":
        return renderPersonalRecordsWidget();
      case "progress_rate":
        return renderProgressRateWidget();
      case "rep_distribution":
        return renderRepDistributionWidget();
      case "training_frequency":
        return renderTrainingFrequencyWidget();
      case "set_efficiency":
        return renderSetEfficiencyWidget();
      default:
        return mutedLine("Coming soon");
    }
  };

  // Edit mode keeps every widget, because a reorder saves only the ids it is given.
  const boardWidgets = widgetBoard.editMode
    ? widgets
    : widgets.filter((w) => fitsFocus(w.type, isGroupFocus));

  const showAnalyticsChrome =
    focusMode !== "training_summary" &&
    !isLoading &&
    !error &&
    !!sessions?.length;

  const renderModals = (): React.ReactNode => (
    <>
      <ModalSheet
        visible={showDropdown}
        onClose={() => {
          setShowDropdown(false);
          setSearchQuery("");
        }}
        title={
          focusMode === "exercise" ? "Select Exercise" : "Select Muscle Group"
        }
        showCancelButton={false}
        showConfirmButton={false}
      >
        {focusMode === "exercise" ? (
          <>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder='Search exercises...'
                placeholderTextColor={colors.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize='none'
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  accessibilityRole='button'
                  accessibilityLabel='Clear search'
                  style={styles.clearSearchButton}
                  onPress={() => setSearchQuery("")}
                >
                  <Text style={styles.clearSearchText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterContainer}>
              <TouchableOpacity
                style={styles.filterButton}
                onPress={() => setShowZeroSetExercises(!showZeroSetExercises)}
                accessibilityRole='switch'
                accessibilityLabel='Show exercises with 0 sets'
                accessibilityState={{ checked: showZeroSetExercises }}
              >
                <Text style={styles.filterButtonText}>
                  {showZeroSetExercises ? "Hide" : "Show"} exercises with 0 sets
                </Text>
                <Text style={styles.filterButtonIcon}>
                  {showZeroSetExercises ? "👁️" : "👁️‍🗨️"}
                </Text>
              </TouchableOpacity>
              <Text style={styles.filterHint}>
                {zeroSetExerciseCount} exercises hidden
              </Text>
            </View>

            <FlatList
              data={filteredExercises}
              keyExtractor={(exercise) => exercise.name}
              style={styles.dropdownList}
              keyboardShouldPersistTaps='handled'
              ListEmptyComponent={
                <View style={styles.noResultsContainer}>
                  <Text style={styles.noResultsText}>
                    {searchQuery.length > 0
                      ? `No exercises match "${searchQuery}"`
                      : "No exercises with data"}
                  </Text>
                </View>
              }
              renderItem={({ item: exercise }) => (
                <TouchableOpacity
                  style={[
                    styles.dropdownItem,
                    selectedExercise === exercise.name &&
                      styles.dropdownItemSelected,
                  ]}
                  onPress={() => {
                    setSelectedExercise(exercise.name);
                    setShowDropdown(false);
                    setSearchQuery("");
                  }}
                  accessibilityRole='radio'
                  accessibilityState={{
                    selected: selectedExercise === exercise.name,
                  }}
                >
                  <View style={styles.dropdownItemContent}>
                    <Text
                      style={[
                        styles.dropdownItemText,
                        selectedExercise === exercise.name &&
                          styles.dropdownItemTextSelected,
                      ]}
                    >
                      {exercise.name}
                    </Text>
                    <View style={styles.dropdownItemMeta}>
                      {exercise.primaryMuscles.length > 0 && (
                        <Text style={styles.dropdownItemMuscle}>
                          {exercise.primaryMuscles.join(", ")}
                        </Text>
                      )}
                      <Text style={styles.dropdownItemSets}>
                        {exercise.totalSets} sets
                      </Text>
                    </View>
                  </View>
                  {selectedExercise === exercise.name && (
                    <Text style={styles.dropdownItemCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </>
        ) : (
          <FlatList
            data={distinctMuscleGroups}
            keyExtractor={(group) => group}
            style={styles.dropdownList}
            ListEmptyComponent={
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>No muscle groups found</Text>
              </View>
            }
            renderItem={({ item: group }) => (
              <TouchableOpacity
                style={[
                  styles.dropdownItem,
                  selectedMuscleGroup === group && styles.dropdownItemSelected,
                ]}
                onPress={() => {
                  setSelectedMuscleGroup(group);
                  setShowDropdown(false);
                }}
                accessibilityRole='radio'
                accessibilityState={{ selected: selectedMuscleGroup === group }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selectedMuscleGroup === group &&
                      styles.dropdownItemTextSelected,
                  ]}
                >
                  {group}
                </Text>
                {selectedMuscleGroup === group && (
                  <Text style={styles.dropdownItemCheck}>✓</Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </ModalSheet>

      <ModalSheet
        visible={showDateSets}
        onClose={() => setShowDateSets(false)}
        title={selectedDate ? formatDateUtil(selectedDate, LONG_DATE) : ""}
        showCancelButton={false}
        showConfirmButton={false}
        scrollable
      >
        {selectedDate &&
          getSetsForDate(selectedDate).map((set) => (
            <View
              key={`set-${set.date.getTime()}-${set.dayNumber}-${set.setNumber}`}
              style={styles.setCard}
            >
              <View style={styles.setCardHeader}>
                <Text style={styles.setCardTitle}>
                  {isGroupFocus
                    ? `${set.exerciseName} · Set ${set.setNumber}`
                    : `Set ${set.setNumber}`}
                </Text>
                <Text style={styles.setCardTime}>
                  {formatClockTime(set.date)}
                </Text>
              </View>
              <View style={styles.setCardStats}>
                <View style={styles.setCardStat}>
                  <Text style={styles.setCardStatValue}>
                    {load(set.weight)}
                  </Text>
                  <Text style={styles.setCardStatLabel}>Weight</Text>
                </View>
                <View style={styles.setCardStat}>
                  <Text style={styles.setCardStatValue}>{set.reps}</Text>
                  <Text style={styles.setCardStatLabel}>Reps</Text>
                </View>
              </View>
              <Text style={styles.setCardDay}>Day {set.dayNumber}</Text>
            </View>
          ))}
      </ModalSheet>
    </>
  );

  const renderExerciseAnalyticsBody = (): React.ReactNode => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size='large' color={colors.accent} />
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

    if (!sessions?.length) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>📊</Text>
          <Text style={styles.emptyTitle}>No Data Available</Text>
          <Text style={styles.emptyText}>No workout sessions found</Text>
        </View>
      );
    }

    return (
      <>
        {widgetsLoaded && widgets.length > 0 && (
          <WidgetEditHeader
            editMode={widgetBoard.editMode}
            onDone={() => widgetBoard.setEditMode(false)}
          />
        )}

        <WidgetsPanel
          widgets={boardWidgets}
          editMode={widgetBoard.editMode}
          onCycleSize={cycleWidgetSize}
          onRemove={removeWidget}
          onReorder={reorderWidgets}
          renderContent={renderWidgetContent}
          registry={ANALYTICS_WIDGET_REGISTRY}
        />

        {widgetsLoaded && widgets.length > 0 && (
          <WidgetEditButton onPress={widgetBoard.openGallery} />
        )}

        {renderModals()}
      </>
    );
  };

  const renderEmbedStatus = (): React.ReactNode => {
    if (isLoading) return <ActivityIndicator color={colors.accent} />;
    if (error) return <Text style={styles.emptyText}>{error}</Text>;
    if (!sessions?.length)
      return <Text style={styles.emptyText}>No workout sessions found</Text>;
    return null;
  };

  if (embedWidget)
    return (
      <>
        {renderEmbedStatus() ?? renderWidgetContent(embedInstance(embedWidget))}
        {renderModals()}
      </>
    );

  return (
    <View style={{ flex: 1 }} {...widgetBoard.panHandlers}>
      {showAnalyticsChrome && widgetBoard.isPulling && (
        <WidgetPullHint armed={widgetBoard.pullArmed} />
      )}

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ flexGrow: 1 }}
        scrollEnabled={!widgetBoard.isPulling}
        onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width - 40)}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[colors.accent]}
              tintColor={colors.accent}
            />
          ) : undefined
        }
      >
        <View style={styles.content}>
          <ScreenTitle title={title} />

          <ScrollTabBar
            tabs={FOCUS_MODE_TABS}
            activeTab={focusMode}
            onTabChange={(tab) => {
              const mode = tab as FocusMode;
              setFocusMode(mode);
              if (mode === "muscleGroup" && !selectedMuscleGroup)
                setSelectedMuscleGroup(distinctMuscleGroups[0] ?? null);
            }}
            storageKey='exerciseAnalytics_focusModeTabConfig'
          />

          {focusMode === "training_summary" ? (
            <TrainingSummaryTab
              sessions={sessions}
              workoutData={workoutData}
              selectedSplit={selectedSplit}
              completedDays={completedDays}
              isLoading={isLoading}
              error={error}
              userId={userId}
            />
          ) : (
            renderExerciseAnalyticsBody()
          )}
        </View>
      </ScrollView>

      <WidgetGallery
        visible={widgetBoard.galleryVisible}
        onClose={widgetBoard.closeGallery}
        availableWidgets={availableToAdd.filter((def) =>
          fitsFocus(def.type, isGroupFocus),
        )}
        onAddWidget={widgetBoard.add}
        hasPlacedWidgets={widgets.length > 0}
        onEditWidgets={widgetBoard.editWidgets}
      />
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { ...SCREEN_PADDING, flexGrow: 1 },

    widgetLineMuted: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    warningBanner: {
      backgroundColor: "#fff3cd",
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#ffc107",
    },
    warningIcon: { fontSize: 24, marginRight: 12 },
    warningTextContainer: { flex: 1 },
    warningTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#856404",
      marginBottom: 4,
    },
    warningText: { fontSize: 14, color: "#856404", lineHeight: 20 },
    dropdownButton: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.accent,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    dropdownButtonContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
    },
    dropdownButtonLeft: { flex: 1 },
    dropdownButtonText: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    dropdownButtonSubtext: { fontSize: 14, color: colors.accent },
    dropdownArrow: { fontSize: 16, color: colors.accent, marginLeft: 12 },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      position: "relative",
    },
    searchInput: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 12,
      paddingRight: 40,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    clearSearchButton: {
      position: "absolute",
      right: 24,
      top: 14,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.badgeBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    clearSearchText: { fontSize: 14, color: colors.textSecondary },
    filterContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      backgroundColor: colors.inputBackground,
    },
    filterButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.surface,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    filterButtonText: { fontSize: 14, fontWeight: "500", color: colors.accent },
    filterButtonIcon: { fontSize: 16 },
    filterHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 6,
      textAlign: "center",
    },
    dropdownList: { flex: 1 },
    dropdownItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    dropdownItemSelected: { backgroundColor: colors.accentLight },
    dropdownItemContent: { flex: 1 },
    dropdownItemText: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    dropdownItemTextSelected: { color: colors.accent, fontWeight: "600" },
    dropdownItemMeta: { flexDirection: "row", alignItems: "center", gap: 12 },
    dropdownItemMuscle: { fontSize: 13, color: colors.textSecondary },
    dropdownItemSets: {
      fontSize: 13,
      color: colors.success,
      fontWeight: "600",
    },
    dropdownItemCheck: { fontSize: 20, color: colors.accent, marginLeft: 12 },
    noResultsContainer: { padding: 40, alignItems: "center" },
    noResultsText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
    },
    setCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    setCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    setCardTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    setCardTime: { fontSize: 14, color: colors.textSecondary },
    setCardStats: {
      flexDirection: "row",
      justifyContent: "space-around",
      marginBottom: 8,
    },
    setCardStat: { alignItems: "center" },
    setCardStatValue: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.accent,
      marginBottom: 4,
    },
    setCardStatLabel: { fontSize: 12, color: colors.textSecondary },
    setCardDay: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 8,
    },
    loadingText: { marginTop: 12, fontSize: 16, color: colors.textSecondary },
    statsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      marginBottom: 10,
    },
    statCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flex: 1,
      minWidth: "47%",
      alignItems: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    statValue: {
      fontSize: 28,
      fontWeight: "bold",
      color: colors.accent,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: "center",
    },
    statsRow: { flexDirection: "row", gap: 10 },
    statCardWide: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    statValueSmall: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.accent,
      marginBottom: 4,
    },
    insightRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    insightRowLabel: { fontSize: 15, color: colors.textPrimary, flexShrink: 1 },
    insightRowRight: { alignItems: "flex-end" },
    insightRowValue: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.accent,
    },
    insightRowMeta: { fontSize: 12, color: colors.textSecondary },
    insightBadge: {
      marginTop: 10,
      padding: 12,
      borderRadius: 10,
      backgroundColor: colors.accentLight,
    },
    insightBadgeText: { fontSize: 14, color: colors.textPrimary },
    insightSubheading: {
      marginTop: 16,
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
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
    noDataIcon: { fontSize: 48, marginBottom: 16 },
    noDataTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    noDataText: {
      fontSize: 15,
      color: colors.textSecondary,
      textAlign: "center",
      lineHeight: 22,
    },
    lastWorkoutCardWidget: { alignItems: "flex-start" },
    lastWorkoutDate: {
      fontSize: 16,
      color: colors.textPrimary,
      fontWeight: "600",
    },
    noDataContainer: {
      padding: 40,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 16,
      marginTop: 4,
    },
    
    
    
  });
