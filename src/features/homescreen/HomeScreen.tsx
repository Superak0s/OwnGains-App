import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import ModalSheet from "@shared/components/ModalSheet";
import { TrainerLoggedBadge, trainerLoggedLabel } from "@shared/components/TrainerLoggedBadge";
import { useAlert } from "@shared/components/CustomAlert";
import { showToast } from "@shared/components/toast";
import { workoutApi } from "@features/workout/services/index";
import { formatTime } from "@utils/timeEstimation";
import {
  formatDate as formatDateUtil,
  formatClockTime,
  parseDate,
  toDateString,
} from "@utils/format";
import { visibleDaysForSplit } from "@utils/programDays";
import { dayLabel } from "@utils/dayCarryOver";
import {
  kgToDisplay,
  getDayOverviewTint,
  getDayOverviewTextColor,
} from "@features/workout/utils";
import { useWidgets, useWidgetBoard } from "@shared/context/hooks/useWidgets";
import WidgetGallery from "@shared/components/widgets/WidgetGallery";
import WidgetEditButton from "@shared/components/widgets/WidgetEditButton";
import {
  WidgetPullHint,
  WidgetEditHeader,
} from "@shared/components/widgets/WidgetBoardChrome";
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel";
import ForeignWidget from "./ForeignWidget";
import { sorenessApi } from "@features/tracking/services";
import { needsFollowUp } from "@features/tracking/utils";
import HealthWidget from "@features/healthConnect/HealthWidget";
import {
  HOME_WIDGET_REGISTRY,
  HOME_WIDGET_SOURCE,
  HOME_WIDGET_SUBSOURCE,
  DEFAULT_HOME_WIDGETS,
  type HomeWidgetType,
} from "./widgets";
import { computeWeeklyStreak, sessionDateKey } from "./streak";
import type {
  WorkoutData,
  WorkoutDay,
  WorkoutSession,
  FullSessionWithGroups,
  WidgetInstance,
  SetTiming,
  GroupedExercise,
  RootStackParamList,
} from "@shared/types";
import { STORAGE_KEYS } from "@shared/services/storage";
import { isServerless, onAppModeChange } from "@shared/services/appMode";
import { setAppRole } from "@shared/services/appRole";
import { useTutorial } from "@features/tutorial/TutorialContext";
import {
  describeLocalOnlyFeatures,
  onLocalOnlyFeaturesChange,
} from "@shared/services/localOnlyFeatures";
import {
  MIN_SERVER_VERSION,
  useOutdatedServer,
} from "@shared/services/serverVersion";
import { captureException, metric } from "@shared/services/crashReporting";
import { tutorialAnchor } from "@features/tutorial/anchors";
import { SCREEN_PADDING } from "@shared/layout";

// One year of near-daily training. The weekly streak and the calendar dots
// can only reach back as far as this fetch does, so it bounds both.
const SESSION_HISTORY_LIMIT = 365;
// Refetching on focus costs a 365-session payload, so it only pays off
// if the data could have changed since the last successful load.
const HISTORY_STALE_MS = 60 * 1000;


type NextWorkoutWidgetProps = {
  readonly selectedSplit: string | null;
  readonly workoutData: WorkoutData | null;
  readonly currentDay: number;
  readonly displayDay: number;
  readonly isDayLocked: (day: number) => boolean;
  readonly hasActiveSession: () => boolean;
  readonly onChangeDay: () => void;
  readonly onGoToWorkout: () => void;
  readonly onLogPastWorkout: () => void;
  readonly onCreatePlan: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
};

function getDayStatusLabel(locked: boolean, sessionActive: boolean): string {
  if (locked) return "✓ Done";
  return sessionActive ? "In Progress" : "Not Started";
}

function NextWorkoutWidget({
  selectedSplit,
  workoutData,
  currentDay,
  displayDay,
  isDayLocked,
  hasActiveSession,
  onChangeDay,
  onGoToWorkout,
  onLogPastWorkout,
  onCreatePlan,
  styles,
}: NextWorkoutWidgetProps): React.JSX.Element {
  if (!selectedSplit || !workoutData) {
    return (
      <SetUpPlanPrompt
        message="No workout plan yet. Set one up to see today's session here."
        onCreatePlan={onCreatePlan}
        styles={styles}
      />
    );
  }

  const dayTitle = getDayTitle(workoutData, currentDay);
  const locked = isDayLocked(currentDay);
  const sessionActive = hasActiveSession();
  let goLabel = "Start Workout";
  if (locked) goLabel = "View Workout";
  else if (sessionActive) goLabel = "Resume Workout";

  return (
    <View>
      <View style={styles.currentDayHeader}>
        <Text style={styles.currentDayText} numberOfLines={1}>
          {dayTitle ? `${dayLabel(displayDay)} - ${dayTitle}` : dayLabel(displayDay)}
        </Text>
        <View style={locked ? styles.lockedBadge : styles.completeBadge}>
          <Text
            style={locked ? styles.lockedBadgeText : styles.completeBadgeText}
          >
            {getDayStatusLabel(locked, sessionActive)}
          </Text>
        </View>
      </View>
      <View style={styles.dayActions}>
        <TouchableOpacity
          style={styles.changeDayButton}
          accessibilityRole='button'
          accessibilityLabel='Change day'
          ref={tutorialAnchor("home.changeDay")}
          onPress={onChangeDay}
        >
          <Text style={styles.changeDayButtonText}>Change Day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.goToWorkoutButton}
          accessibilityRole='button'
          accessibilityLabel={goLabel}
          onPress={onGoToWorkout}
        >
          <Text style={styles.goToWorkoutButtonText}>{`${goLabel} →`}</Text>
        </TouchableOpacity>
      </View>
      {!locked && !sessionActive && (
        <TouchableOpacity
          style={styles.logPastButton}
          accessibilityRole='button'
          accessibilityLabel='Log a past workout without timings'
          onPress={onLogPastWorkout}
        >
          <Text style={styles.logPastButtonText}>Log a past workout</Text>
        </TouchableOpacity>
      )}
      {locked && (
        <Text style={styles.lockedHintText}>
          You finished this day. Pick another to keep training.
        </Text>
      )}
    </View>
  );
}

type WeeklyProgressWidgetProps = {
  readonly selectedSplit: string | null;
  readonly days: readonly { day: WorkoutDay; displayNumber: number }[];
  readonly currentDay: number;
  readonly isDayLocked: (day: number) => boolean;
  readonly onCreatePlan: () => void;
  readonly colors: ThemeColors;
  readonly styles: ReturnType<typeof makeStyles>;
};

function SetUpPlanPrompt({
  message,
  onCreatePlan,
  styles,
}: {
  readonly message: string;
  readonly onCreatePlan: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.widgetEmpty}>
      <Text style={styles.widgetLineMuted}>{message}</Text>
      <TouchableOpacity
        style={styles.widgetEmptyButton}
        accessibilityRole='button'
        accessibilityLabel='Set up a workout plan'
        onPress={onCreatePlan}
      >
        <Text style={styles.widgetEmptyButtonText}>Set Up a Plan →</Text>
      </TouchableOpacity>
    </View>
  );
}

function HistoryLoadFailed({
  onRetry,
  styles,
}: {
  readonly onRetry: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.widgetEmpty}>
      <Text style={styles.widgetLineMuted}>Couldn't load your history.</Text>
      <TouchableOpacity
        style={styles.widgetRetryButton}
        accessibilityRole='button'
        accessibilityLabel='Retry loading workout history'
        onPress={onRetry}
      >
        <Text style={styles.widgetRetryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function WeeklyProgressWidget({
  selectedSplit,
  days,
  currentDay,
  isDayLocked,
  onCreatePlan,
  colors,
  styles,
}: WeeklyProgressWidgetProps): React.JSX.Element {
  if (!selectedSplit || days.length === 0) {
    return (
      <SetUpPlanPrompt
        message="Set up a plan to see this week's progress here."
        onCreatePlan={onCreatePlan}
        styles={styles}
      />
    );
  }

  const total = days.length;
  const lockedCount = days.filter(({ day }) => isDayLocked(day.dayNumber)).length;
  const percent = total > 0 ? Math.round((lockedCount / total) * 100) : 0;

  return (
    <View style={styles.weeklyProgressWrap}>
      <View style={styles.weeklyProgressHeaderRow}>
        <Text style={styles.weeklyProgressPercent}>{percent}%</Text>
        <Text style={styles.weeklyProgressCount}>
          {lockedCount}/{total} days done
        </Text>
      </View>
      <View
        style={styles.weeklyProgressTrack}
        accessibilityRole='progressbar'
        accessibilityLabel={`${lockedCount} of ${total} days done this week`}
        accessibilityValue={{ min: 0, max: 100, now: percent }}
      >
        <View
          style={[
            styles.weeklyProgressFill,
            {
              width: `${percent}%`,
              backgroundColor: percent === 100 ? colors.success : colors.accent,
            },
          ]}
        />
      </View>
      <View
        style={styles.weeklyProgressDots}
        importantForAccessibility='no-hide-descendants'
      >
        {days.map(({ day, displayNumber }) => (
          <WeeklyProgressDot
            key={day.dayNumber}
            label={displayNumber}
            done={isDayLocked(day.dayNumber)}
            isToday={day.dayNumber === currentDay}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
}

function WeeklyProgressDot({
  label,
  done,
  isToday,
  styles,
}: {
  readonly label: number;
  readonly done: boolean;
  readonly isToday: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View
      style={[
        styles.weeklyProgressDot,
        done && styles.weeklyProgressDotDone,
        isToday && !done && styles.weeklyProgressDotToday,
      ]}
    >
      {done ? (
        <Text style={styles.weeklyProgressDotCheck}>✓</Text>
      ) : (
        <Text
          style={[
            styles.weeklyProgressDotNumber,
            isToday && styles.weeklyProgressDotNumberToday,
          ]}
        >
          {label}
        </Text>
      )}
    </View>
  );
}

type WorkoutStreakWidgetProps = {
  readonly loadingHistory: boolean;
  readonly loadFailed: boolean;
  readonly onRetry: () => void;
  readonly weeklyStreak: { count: number; currentWeekLogged: boolean };
  readonly historyBounded: boolean;
  readonly colors: ThemeColors;
  readonly styles: ReturnType<typeof makeStyles>;
};

function getStreakSubtitle(weeklyStreak: {
  count: number;
  currentWeekLogged: boolean;
}): string {
  if (weeklyStreak.currentWeekLogged) return "Logged this week";
  if (weeklyStreak.count > 0) return "Log a workout this week to keep it going";
  return "Complete a workout to start your streak";
}

function WorkoutStreakWidget({
  loadingHistory,
  loadFailed,
  onRetry,
  weeklyStreak,
  historyBounded,
  colors,
  styles,
}: WorkoutStreakWidgetProps): React.JSX.Element {
  if (loadingHistory) {
    return (
      <View style={styles.streakLoading}>
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel='Loading workout history'
        />
      </View>
    );
  }
  if (loadFailed) return <HistoryLoadFailed onRetry={onRetry} styles={styles} />;

  return (
    <View
      style={styles.streakWrap}
      accessible
      accessibilityLabel={`${weeklyStreak.count}${historyBounded ? " or more" : ""} week streak. ${getStreakSubtitle(weeklyStreak)}`}
    >
      {weeklyStreak.count > 0 && <Text style={styles.streakEmoji}>🔥</Text>}
      <Text style={styles.streakNumber}>
        {weeklyStreak.count}
        {historyBounded ? "+" : ""}
      </Text>
      <Text style={styles.streakLabel}>week streak</Text>
      <Text style={styles.streakSub}>{getStreakSubtitle(weeklyStreak)}</Text>
    </View>
  );
}

function SwitchToTrainerWidget({
  isOffline,
  styles,
}: {
  readonly isOffline: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const { offerTrainerTour } = useTutorial();
  return (
    <TouchableOpacity
      style={styles.streakWrap}
      disabled={isOffline}
      onPress={() => {
        void setAppRole("trainer");
        offerTrainerTour();
      }}
      accessibilityRole='button'
      accessibilityLabel={isOffline ? "Trainer Mode needs online mode" : "Switch to Trainer Mode"}
      accessibilityState={{ disabled: isOffline }}
    >
      <Text style={styles.streakEmoji}>👥</Text>
      <Text style={styles.streakLabel}>Trainer Mode</Text>
      <Text style={styles.streakSub}>
        {isOffline ? "Needs online mode" : "Tap to coach your clients"}
      </Text>
    </TouchableOpacity>
  );
}

type WorkoutCalendarWidgetProps = {
  readonly loadingHistory: boolean;
  readonly loadFailed: boolean;
  readonly onRetry: () => void;
  readonly colors: ThemeColors;
  readonly hasSessionOnDate: (date: Date) => boolean;
  readonly onDatePress: (date: Date) => void;
  readonly styles: ReturnType<typeof makeStyles>;
};

function WorkoutCalendarWidget({
  loadingHistory,
  loadFailed,
  onRetry,
  colors,
  hasSessionOnDate,
  onDatePress,
  styles,
}: WorkoutCalendarWidgetProps): React.JSX.Element {
  if (loadingHistory) {
    return (
      <View style={styles.calendarLoading}>
        <ActivityIndicator
          color={colors.accent}
          accessibilityLabel='Loading workout history'
        />
      </View>
    );
  }
  if (loadFailed) return <HistoryLoadFailed onRetry={onRetry} styles={styles} />;

  return (
    <UniversalCalendar
      hasDataOnDate={hasSessionOnDate}
      onDatePress={onDatePress}
      initialView='month'
      legendText='Workout day'
      dotColor={colors.success}
    />
  );
}

function getDayTitle(
  workoutData: WorkoutData | null,
  dayNumber: number,
): string {
  const day = workoutData?.days?.find(
    (d: WorkoutDay) => d.dayNumber === dayNumber,
  );
  return day?.primaryMuscles?.join("/") ?? "";
}

function formatSessionTime(dateString: string | null | undefined): string {
  const date = parseDate(dateString);
  return date ? formatClockTime(date) : "";
}

function getSessionTitle(session: WorkoutSession): string {
  if (!session?.dayTitle) return "";
  const parts = session.dayTitle.split("—");
  return parts.length > 1 ? parts[1].trim() : session.dayTitle;
}

function formatSetLine(
  weight: unknown,
  reps: unknown,
  weightUnit: "kg" | "lbs",
): string {
  const w = typeof weight === "number" ? weight : 0;
  const r = typeof reps === "number" ? reps : 0;
  return `${kgToDisplay(w, weightUnit)}${weightUnit} × ${r}`;
}

function groupSetTimingsByExercise(
  setTimings: SetTiming[] | undefined,
): GroupedExercise[] {
  if (!setTimings || setTimings.length === 0) return [];

  const exerciseMap = new Map<string, GroupedExercise>();
  setTimings.forEach((timing) => {
    const key = timing.exerciseName || `Exercise ${timing.exerciseId ?? "?"}`;
    if (!exerciseMap.has(key)) {
      exerciseMap.set(key, { exerciseName: key, sets: [] });
    }
    exerciseMap.get(key)!.sets.push(timing);
  });

  return Array.from(exerciseMap.values());
}

export default function HomeScreen(): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { logout, user, recheckConsent } = useAuth();
  const outdatedServer = useOutdatedServer(user?.id);
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {
    workoutData,
    selectedSplit,
    currentDay,
    saveCurrentDay,
    isDayLocked,
    fetchSessionHistory,
    syncFromServer,
    hasActiveSession,
    startWorkout,
    currentSessionId,
    userId,
    weightUnit,
  } = useWorkoutPick(
    "workoutData",
    "selectedSplit",
    "currentDay",
    "saveCurrentDay",
    "isDayLocked",
    "fetchSessionHistory",
    "syncFromServer",
    "hasActiveSession",
    "startWorkout",
    "currentSessionId",
    "userId",
    "weightUnit",
  );
  const { alert, AlertComponent } = useAlert();
  const [showDayPicker, setShowDayPicker] = useState<boolean>(false);
  const [sessionHistory, setSessionHistory] = useState<WorkoutSession[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const historyRequestRef = useRef(0);
  const isMountedRef = useRef(true);
  const historyFetchedAtRef = useRef(0);

  useEffect(
    () =>
      onLocalOnlyFeaturesChange(({ nowLocal, nowOnServer }) => {
        const lines: string[] = [];
        if (nowOnServer.length) {
          lines.push(
            `${describeLocalOnlyFeatures(nowOnServer)} ${nowOnServer.length > 1 ? "are" : "is"} saved to your server again. Entries from the meantime stay on this phone.`,
          );
        }
        if (nowLocal.length) {
          lines.push(
            `${describeLocalOnlyFeatures(nowLocal)} now ${nowLocal.length > 1 ? "stay" : "stays"} on this phone. Older entries on your server are hidden for now.`,
          );
        }
        alert("Where your data is saved changed", lines.join("\n\n"), [
          { text: "OK" },
        ]);
        if (nowOnServer.length) recheckConsent();
      }),
    [alert, recheckConsent],
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const [selectedSession, setSelectedSession] =
    useState<FullSessionWithGroups | null>(null);
  const [showSessionDetails, setShowSessionDetails] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [historyError, setHistoryError] = useState<boolean>(false);
  const [loadingSessionId, setLoadingSessionId] = useState<
    string | number | null
  >(null);
  const {
    widgets,
    isLoaded: widgetsLoaded,
    availableToAdd,
    addWidget,
    removeWidget,
    cycleWidgetSize,
    reorderWidgets,
    resetToDefaults,
  } = useWidgets<HomeWidgetType>(userId ?? null, {
    registry: HOME_WIDGET_REGISTRY,
    defaults: DEFAULT_HOME_WIDGETS,
    storageKey: STORAGE_KEYS.HOME_WIDGETS,
  });

  const [isOffline, setIsOffline] = useState<boolean>(false);
  useEffect(() => {
    void isServerless().then(setIsOffline);
    return onAppModeChange.subscribe(() => {
      void isServerless().then(setIsOffline);
    });
  }, []);

  // Friends widgets are server-mediated, with nothing behind them in offline mode.
  const galleryWidgets = useMemo(
    () =>
      isOffline
        ? availableToAdd.filter(
            (def) => HOME_WIDGET_SOURCE[def.type] !== "Friends",
          )
        : availableToAdd,
    [isOffline, availableToAdd],
  );

  const [sorenessDue, setSorenessDue] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!widgets.some((w) => w.type === "doms_followup")) return;
      sorenessApi
        .getActiveSoreness()
        .then((res) => setSorenessDue((res.data ?? []).some((s) => needsFollowUp(s))))
        .catch(() => setSorenessDue(false));
    }, [widgets]),
  );

  const scrollRef = useRef<ScrollView>(null);
  // A widget added at the end of the board is otherwise below the fold, and
  // DOMS follow-up is hidden until one is due, so the add looked like a no-op.
  const [justAdded, setJustAdded] = useState<HomeWidgetType | null>(null);
  useFocusEffect(useCallback(() => () => setJustAdded(null), []));
  const addAndReveal = useCallback(
    async (type: HomeWidgetType) => {
      const result = await addWidget(type);
      if (result.success) {
        setJustAdded(type);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
      }
      return result;
    },
    [addWidget],
  );

  const widgetBoard = useWidgetBoard(addAndReveal, {
    onError: (message) => alert("Can't Add Widget", message, [{ text: "OK" }]),
  });

  const { closeGallery } = widgetBoard;
  const restoreDefaults = useCallback(() => {
    closeGallery();
    void resetToDefaults();
  }, [closeGallery, resetToDefaults]);

  const visibleDays = useMemo(
    () => visibleDaysForSplit(workoutData?.days ?? [], selectedSplit),
    [workoutData, selectedSplit],
  );

  const displayDay = useMemo(
    () =>
      visibleDays.find(({ day }) => day.dayNumber === currentDay)
        ?.displayNumber ?? currentDay,
    [visibleDays, currentDay],
  );

  const [pastWorkoutDate, setPastWorkoutDate] = useState<Date | null>(null);

  const logPastWorkout = async (): Promise<void> => {
    if (!pastWorkoutDate) return;
    const startAt = new Date();
    startAt.setFullYear(
      pastWorkoutDate.getFullYear(),
      pastWorkoutDate.getMonth(),
      pastWorkoutDate.getDate(),
    );
    setPastWorkoutDate(null);
    const sessionId = await startWorkout(true, startAt).catch(() => null);
    if (sessionId) navigation.navigate("Workout");
    else alert("Couldn't start", "Couldn't start the workout. Try again.", [{ text: "OK" }]);
  };

  const pickPastWorkoutDate = (date: Date): void => {
    if (date <= new Date()) setPastWorkoutDate(date);
  };

  const pastWorkoutDayDecoration = (date: Date) =>
    pastWorkoutDate && toDateString(date) === toDateString(pastWorkoutDate)
      ? { backgroundColor: colors.accent, textColor: colors.textOnAccent }
      : null;

  const renderWidgetContent = (
    instance: WidgetInstance<HomeWidgetType>,
  ): React.ReactNode => {
    switch (instance.type) {
      case "next_workout":
        return (
          <NextWorkoutWidget
            selectedSplit={selectedSplit}
            workoutData={workoutData}
            currentDay={currentDay}
            displayDay={displayDay}
            isDayLocked={isDayLocked}
            hasActiveSession={hasActiveSession}
            onChangeDay={openDayPicker}
            onGoToWorkout={() => navigation.navigate("Workout")}
            onLogPastWorkout={() => setPastWorkoutDate(new Date())}
            onCreatePlan={() => navigation.navigate("Plan")}
            styles={styles}
          />
        );
      case "weekly_progress":
        return (
          <WeeklyProgressWidget
            selectedSplit={selectedSplit}
            days={visibleDays}
            currentDay={currentDay}
            isDayLocked={isDayLocked}
            onCreatePlan={() => navigation.navigate("Plan")}
            colors={colors}
            styles={styles}
          />
        );
      case "workout_streak":
        return (
          <WorkoutStreakWidget
            loadingHistory={firstHistoryLoad}
            loadFailed={historyLoadFailed}
            onRetry={retryHistory}
            weeklyStreak={weeklyStreak}
            historyBounded={sessionHistory.length >= SESSION_HISTORY_LIMIT}
            colors={colors}
            styles={styles}
          />
        );
      case "workout_calendar":
        return (
          <WorkoutCalendarWidget
            loadingHistory={firstHistoryLoad}
            loadFailed={historyLoadFailed}
            onRetry={retryHistory}
            colors={colors}
            hasSessionOnDate={hasSessionOnDate}
            onDatePress={(date) => {
              if (hasSessionOnDate(date)) setSelectedDate(date);
            }}
            styles={styles}
          />
        );
      case "switch_to_trainer":
        return <SwitchToTrainerWidget isOffline={isOffline} styles={styles} />;
      case "health_steps":
      case "health_heart_rate":
      case "health_sleep":
      case "health_steps_trend":
      case "health_heart_rate_trend":
      case "health_sleep_trend":
        return (
          <HealthWidget
            type={instance.type}
            onOpenSettings={() => navigation.navigate("Settings")}
          />
        );
      default:
        return <ForeignWidget type={instance.type} />;
    }
  };

  function handleHistoryError(error: unknown): void {
    if ((error as Error)?.message === "SESSION_EXPIRED") {
      alert(
        "Session Expired",
        "Your session has expired. Please log in again.",
        [
          {
            text: "OK",
            // Login isn't a registered route while signed in. Ending the
            // session swaps the navigator over to it.
            onPress: () => void logout(),
          },
        ],
        "warning",
      );
    } else {
      captureException(error, { stage: "loadSessionHistory" });
    }
  }

  // A user switch, or a workout starting or ending while this tab is in
  // the background, makes the loaded history stale regardless of its age.
  useEffect(() => {
    historyFetchedAtRef.current = 0;
  }, [userId, currentSessionId]);

  // Logged sessions are listed whatever split is selected.
  // Filtering by split hid real history behind an empty state. The focus
  // refetch skips data that is still fresh. Pull-to-refresh and the error
  // retry bypass it.
  useFocusEffect(
    useCallback(() => {
      const stale = Date.now() - historyFetchedAtRef.current > HISTORY_STALE_MS;
      if (stale || hasActiveSession()) {
        loadSessionHistory().catch(handleHistoryError);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reload on focus and when the signed-in user changes
    }, [userId]),
  );

  async function loadSessionHistory(): Promise<void> {
    const requestId = ++historyRequestRef.current;
    const isCurrent = () =>
      isMountedRef.current && historyRequestRef.current === requestId;
    setLoadingHistory(true);
    try {
      // No set timings. The calendar and streak only need start times,
      // and a session's details load on demand when it's opened.
      const sessions = await fetchSessionHistory(SESSION_HISTORY_LIMIT, false);
      if (!isCurrent()) return;
      setSessionHistory(sessions);
      setHistoryError(false);
      historyFetchedAtRef.current = Date.now();
    } catch (error) {
      if (isCurrent()) setHistoryError(true);
      throw error;
    } finally {
      if (isCurrent()) setLoadingHistory(false);
    }
  }

  async function onRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      const [, synced] = await Promise.all([
        loadSessionHistory(),
        syncFromServer(),
      ]);
      if (!synced) {
        showToast("Couldn't sync with the server. Showing what's on this device.");
      }
    } catch (error) {
      handleHistoryError(error);
    } finally {
      setRefreshing(false);
    }
  }

  function openDayPicker(): void {
    setShowDayPicker(true);
  }

  function handleSelectDay(day: number): void {
    const shownNumber =
      visibleDays.find((d) => d.day.dayNumber === day)?.displayNumber ?? day;
    if (day === currentDay) {
      setShowDayPicker(false);
      return;
    }

    if (hasActiveSession()) {
      if (isDayLocked(day)) {
        alert(
          "Day Already Completed",
          `You already finished Day ${shownNumber} this week, so your workout in progress can't move there. Pick another day or end the workout first.`,
          [{ text: "OK" }],
          "warning",
        );
        return;
      }
      alert(
        "Move Workout",
        `Logged exercises move to Day ${shownNumber}. Ones you haven't started stay behind.\n\nShared exercises use Day ${shownNumber}'s sets and reps.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Move",
            onPress: () => {
              void saveCurrentDay(day);
              setShowDayPicker(false);
            },
          },
        ],
        "warning",
      );
      return;
    }

    saveCurrentDay(day);
    setShowDayPicker(false);
  }

  async function handleSessionPress(session: WorkoutSession): Promise<void> {
    if (loadingSessionId !== null) return;
    setLoadingSessionId(session.id);
    try {
      const details = await workoutApi.getSession(session.id);

      details.groupedExercises = groupSetTimingsByExercise(details.setTimings);

      setSelectedSession(details);
      setShowSessionDetails(true);
    } catch (error) {
      console.error("Failed to load session details:", error);
      metric.count("home.session_details_load_failed");
      captureException(error, { stage: "loadSessionDetails" });
      alert(
        "Couldn't Load Session",
        "We couldn't load this workout. Check your connection and try again.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Retry",
            onPress: () => {
              handleSessionPress(session).catch(() => {});
            },
          },
        ],
        "error",
      );
    } finally {
      setLoadingSessionId(null);
    }
  }

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, WorkoutSession[]>();
    for (const session of sessionHistory) {
      const dateStr = sessionDateKey(session.startTime);
      if (!dateStr) continue;
      const existing = map.get(dateStr);
      if (existing) existing.push(session);
      else map.set(dateStr, [session]);
    }
    return map;
  }, [sessionHistory]);

  const weeklyStreak = useMemo(
    () => computeWeeklyStreak(sessionsByDate.keys()),
    [sessionsByDate],
  );

  const getSessionsForDate = useCallback(
    (date: Date): WorkoutSession[] =>
      sessionsByDate.get(toDateString(date)) ?? [],
    [sessionsByDate],
  );

  const hasSessionOnDate = useCallback(
    (date: Date): boolean => sessionsByDate.has(toDateString(date)),
    [sessionsByDate],
  );

  const firstHistoryLoad = loadingHistory && sessionHistory.length === 0;
  const historyLoadFailed =
    historyError && !loadingHistory && sessionHistory.length === 0;
  const retryHistory = () => {
    loadSessionHistory().catch(handleHistoryError);
  };
  const [serverNoticeOpen, setServerNoticeOpen] = useState(false);
  const [serverNoticeDismissed, setServerNoticeDismissed] = useState(false);

  const visibleWidgets =
    sorenessDue || widgetBoard.editMode || justAdded === "doms_followup"
      ? widgets
      : widgets.filter((w) => w.type !== "doms_followup");
  const nextWorkoutTint =
    selectedSplit && workoutData
      ? getDayOverviewTint(colors, isDayLocked(currentDay), false)
      : undefined;

  const sessionsForSelectedDate = selectedDate
    ? getSessionsForDate(selectedDate)
    : [];

  return (
    <SafeAreaView
      style={{ flex: 1 }}
      edges={["top"]}
      {...widgetBoard.panHandlers}
    >
      {widgetBoard.isPulling && (
        <WidgetPullHint armed={widgetBoard.pullArmed} />
      )}
      <ScrollView
        ref={scrollRef}
        style={styles.container}
        scrollEnabled={!widgetBoard.isPulling}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            tintColor={colors.accent}
            title='Pull to refresh'
            titleColor={colors.textSecondary}
          />
        }
      >
        <View style={styles.content}>
          <ScreenTitle
            title='Home'
            subtitle={
              selectedSplit ? null : "Set up a workout plan to get started"
            }
          />

          {outdatedServer && !serverNoticeDismissed && (
            <View style={styles.noticeBanner} accessibilityLiveRegion='polite'>
              <View style={styles.noticeBannerRow}>
                <Text style={styles.noticeBannerText}>
                  Your server is out of date. Some features are off.
                </Text>
                <TouchableOpacity
                  accessibilityRole='button'
                  accessibilityState={{ expanded: serverNoticeOpen }}
                  onPress={() => setServerNoticeOpen((open) => !open)}
                  style={styles.noticeBannerAction}
                >
                  <Text style={styles.noticeBannerLink}>
                    {serverNoticeOpen ? "Less" : "Details"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole='button'
                  accessibilityLabel='Dismiss server notice'
                  onPress={() => setServerNoticeDismissed(true)}
                  style={styles.noticeBannerAction}
                >
                  <Text style={styles.noticeBannerLink}>✕</Text>
                </TouchableOpacity>
              </View>
              {serverNoticeOpen && (
                <Text style={styles.noticeBannerDetail}>
                  It runs version {outdatedServer.version}. Blocking, reporting,
                  data export and changing day mid-workout need version{" "}
                  {MIN_SERVER_VERSION} or newer. Ask the person who runs it to
                  update.
                </Text>
              )}
            </View>
          )}

          {historyError && (
            <View style={styles.errorBanner} accessibilityLiveRegion='polite'>
              <Text style={styles.errorBannerText}>
                Couldn't load your workout history. Check your connection and
                try again.
              </Text>
              {loadingHistory ? (
                <ActivityIndicator
                  size='small'
                  color={colors.error}
                  accessibilityLabel='Retrying'
                />
              ) : (
                <TouchableOpacity
                  accessibilityRole='button'
                  accessibilityLabel='Retry loading workout history'
                  onPress={() => {
                    loadSessionHistory().catch(handleHistoryError);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.errorBannerRetry}>Retry</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditHeader
              editMode={widgetBoard.editMode}
              onDone={() => widgetBoard.setEditMode(false)}
            />
          )}

          {!widgetsLoaded && (
            <View
              accessible
              accessibilityLabel='Loading widgets'
              style={styles.skeletonWrap}
            >
              <View style={[styles.skeletonCard, styles.skeletonCardTall]} />
              <View style={styles.skeletonCard} />
              <View style={styles.skeletonCard} />
            </View>
          )}

          {widgetsLoaded && widgets.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                No widgets on your home screen yet
              </Text>
              <TouchableOpacity
                style={styles.emptyButton}
                accessibilityRole='button'
                onPress={widgetBoard.openGallery}
              >
                <Text style={styles.emptyButtonText}>+ Add a Widget</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emptySecondaryButton}
                accessibilityRole='button'
                onPress={() => void resetToDefaults()}
              >
                <Text style={styles.emptySecondaryButtonText}>
                  Restore default widgets
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <WidgetsPanel
            widgets={visibleWidgets}
            editMode={widgetBoard.editMode}
            onCycleSize={cycleWidgetSize}
            onRemove={removeWidget}
            onReorder={reorderWidgets}
            renderContent={renderWidgetContent}
            registry={HOME_WIDGET_REGISTRY}
            getCardBackgroundColor={(w) =>
              w.type === "next_workout" ? nextWorkoutTint : undefined
            }
            getHeaderTextColor={(w) =>
              w.type === "next_workout" && nextWorkoutTint
                ? getDayOverviewTextColor(colors)
                : undefined
            }
            getCardStyleOverride={(w) =>
              w.type === "next_workout" && nextWorkoutTint && !widgetBoard.editMode
                ? { borderColor: nextWorkoutTint }
                : undefined
            }
          />

          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditButton
              onPress={widgetBoard.openGallery}
              editMode={widgetBoard.editMode}
              onDone={() => widgetBoard.setEditMode(false)}
            />
          )}
        </View>

        <ModalSheet
          visible={showDayPicker}
          onClose={() => setShowDayPicker(false)}
          title='Select Workout Day'
          showCancelButton={false}
          showConfirmButton={false}
          scrollable
        >
          {visibleDays.map(({ day, displayNumber }) => (
            <DayOptionRow
              key={day.dayNumber}
              day={day}
              displayNumber={displayNumber}
              isCurrent={day.dayNumber === currentDay}
              isLocked={isDayLocked(day.dayNumber)}
              onPress={() => handleSelectDay(day.dayNumber)}
              styles={styles}
            />
          ))}
          <View style={styles.modalFooter}>
            <Text style={styles.modalFooterText}>
              Days you finished can be viewed but not changed. They reset every
              Monday.
            </Text>
          </View>
        </ModalSheet>

        <ModalSheet
          visible={selectedDate !== null && !showSessionDetails}
          onClose={() => setSelectedDate(null)}
          title={
            selectedDate
              ? formatDateUtil(selectedDate, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })
              : ""
          }
          showCancelButton={false}
          showConfirmButton={false}
          scrollable
        >
          {sessionsForSelectedDate.length === 0 ? (
            <Text style={styles.modalEmptyText}>
              No workouts logged on this day.
            </Text>
          ) : (
            sessionsForSelectedDate.map((session) => (
              <SessionListItem
                key={session.id}
                session={session}
                loading={loadingSessionId === session.id}
                onPress={() => handleSessionPress(session)}
                styles={styles}
              />
            ))
          )}
        </ModalSheet>

        <ModalSheet
          visible={pastWorkoutDate !== null}
          onClose={() => setPastWorkoutDate(null)}
          title='Log a past workout'
          subtitle='Pick the day you trained. Timings are not recorded.'
          confirmText='Start logging'
          onConfirm={() => void logPastWorkout()}
        >
          <UniversalCalendar
            onDatePress={pickPastWorkoutDate}
            initialView='month'
            getDayDecoration={pastWorkoutDayDecoration}
          />
        </ModalSheet>

        <ModalSheet
          visible={showSessionDetails}
          onClose={() => setShowSessionDetails(false)}
          title='Session Details'
          showCancelButton={false}
          showConfirmButton={false}
          scrollable={true}
        >
          {selectedSession && (
            <SessionDetails
              session={selectedSession}
              weightUnit={weightUnit}
              styles={styles}
            />
          )}
        </ModalSheet>
      </ScrollView>

      <WidgetGallery
        visible={widgetBoard.galleryVisible}
        onClose={widgetBoard.closeGallery}
        availableWidgets={galleryWidgets}
        onAddWidget={widgetBoard.add}
        hasPlacedWidgets={widgets.length > 0}
        onEditWidgets={widgetBoard.editWidgets}
        sources={HOME_WIDGET_SOURCE}
        subSources={HOME_WIDGET_SUBSOURCE}
        onRestoreDefaults={restoreDefaults}
      />

      {AlertComponent}
    </SafeAreaView>
  );
}

function DayOptionRow({
  day,
  displayNumber,
  isCurrent,
  isLocked,
  onPress,
  styles,
}: {
  readonly day: WorkoutDay;
  readonly displayNumber: number;
  readonly isCurrent: boolean;
  readonly isLocked: boolean;
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.dayOption,
        isLocked && styles.dayOptionComplete,
        isCurrent && styles.dayOptionCurrent,
      ]}
      accessibilityRole='button'
      accessibilityLabel={[
        `Day ${displayNumber}`,
        (day.primaryMuscles ?? []).join(", "),
        isLocked ? "done this week, opens in view-only mode" : "",
        isCurrent ? "current day" : "",
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ selected: isCurrent }}
      onPress={onPress}
    >
      <View style={styles.dayOptionLeft}>
        <Text
          style={[
            styles.dayOptionNumber,
            isLocked && styles.dayOptionTextComplete,
            isCurrent && styles.dayOptionTextCurrent,
          ]}
        >
          {`Day ${displayNumber}`}
        </Text>
        <Text style={styles.dayOptionMuscles}>
          {(day.primaryMuscles ?? []).join(", ")}
        </Text>
        {isLocked && (
          <Text style={styles.lockedText}>Done · tap to view</Text>
        )}
      </View>
      <View style={styles.dayOptionRight}>
        {isCurrent && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current</Text>
          </View>
        )}
        {isLocked && (
          <View style={styles.completeIcon}>
            <Text style={styles.completeIconText}>✓</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function SessionListItem({
  session,
  loading,
  onPress,
  styles,
}: {
  readonly session: WorkoutSession;
  readonly loading: boolean;
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  const title = getSessionTitle(session);
  return (
    <TouchableOpacity
      style={styles.sessionListItem}
      accessibilityRole='button'
      accessibilityLabel={[
        title
          ? `${dayLabel(session.dayNumber)}, ${title}`
          : dayLabel(session.dayNumber),
        formatSessionTime(session.startTime),
        session.totalDuration ? formatTime(session.totalDuration, "N/A") : "",
        `${session.completedSets} sets`,
        trainerLoggedLabel(session),
      ]
        .filter(Boolean)
        .join(", ")}
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      onPress={onPress}
    >
      <View style={styles.sessionListLeft}>
        <Text style={styles.sessionListTitle}>
          {title
            ? `${dayLabel(session.dayNumber)} - ${title}`
            : dayLabel(session.dayNumber)}
        </Text>
        <View style={styles.sessionListMeta}>
          <Text style={styles.sessionListTime}>
            {formatSessionTime(session.startTime)}
          </Text>
          {!!session.totalDuration && (
            <Text style={styles.sessionListDuration}>
              {` • ${formatTime(session.totalDuration, "N/A")}`}
            </Text>
          )}
          <Text style={styles.sessionListSets}>
            {` • ${session.completedSets} sets`}
          </Text>
        </View>
        <TrainerLoggedBadge {...session} />
      </View>
      {loading ? (
        <ActivityIndicator size='small' />
      ) : (
        <Text style={styles.sessionListArrow}>›</Text>
      )}
    </TouchableOpacity>
  );
}

function SessionDetails({
  session,
  weightUnit,
  styles,
}: {
  readonly session: FullSessionWithGroups;
  readonly weightUnit: "kg" | "lbs";
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <>
      <View style={styles.detailSection}>
        <Text style={styles.detailTitle} accessibilityRole='header'>
          {dayLabel(session.dayNumber)}
        </Text>
        {!!getSessionTitle(session) && (
          <Text style={styles.detailSubtitle}>{getSessionTitle(session)}</Text>
        )}
        <TrainerLoggedBadge {...session} />
        {Array.isArray(session.primaryMuscles) &&
          session.primaryMuscles.length > 0 && (
            <View style={styles.muscleGroupsRow}>
              {session.primaryMuscles.map((group: string) => (
                <View key={group} style={styles.muscleTag}>
                  <Text style={styles.muscleTagText}>{String(group)}</Text>
                </View>
              ))}
            </View>
          )}
      </View>

      <View style={styles.detailSection}>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>
            {session.startTime
              ? formatDateUtil(session.startTime, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : "—"}
          </Text>
        </View>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Start Time</Text>
          <Text style={styles.detailValue}>
            {formatSessionTime(session.startTime)}
          </Text>
        </View>
        {!!session.endTime && (
          <View style={styles.detailRow} accessible>
            <Text style={styles.detailLabel}>End Time</Text>
            <Text style={styles.detailValue}>
              {formatSessionTime(session.endTime)}
            </Text>
          </View>
        )}
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Duration</Text>
          <Text style={styles.detailValue}>
            {formatTime(session.totalDuration as number, "N/A")}
          </Text>
        </View>
        <View style={styles.detailRow} accessible>
          <Text style={styles.detailLabel}>Sets Completed</Text>
          <Text
            style={styles.detailValue}
          >{`${session.completedSets ?? 0}`}</Text>
        </View>
      </View>

      {Array.isArray(session.groupedExercises) &&
        session.groupedExercises.length > 0 && (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle} accessibilityRole='header'>
              Exercises
            </Text>
            {session.groupedExercises.map((exercise: GroupedExercise) => (
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
  readonly weightUnit: "kg" | "lbs";
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.exerciseCard}>
      <View style={styles.exerciseHeader}>
        <Text style={styles.exerciseName}>{exercise.exerciseName}</Text>
        <Text
          style={styles.exerciseSetsCount}
        >{`${exercise.sets.length} sets`}</Text>
      </View>

      {exercise.sets.map((set: SetTiming, index: number) => (
        <SetTimingCard
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

function SetTimingCard({
  set,
  isFirst,
  weightUnit,
  styles,
}: {
  readonly set: SetTiming;
  readonly isFirst: boolean;
  readonly weightUnit: "kg" | "lbs";
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View
      style={[styles.setRow, isFirst && styles.setRowFirst]}
      accessible
      accessibilityLabel={[
        `Set ${set.setIndex + 1}`,
        formatSetLine(set.weight, set.reps, weightUnit),
        set.setDuration ? formatTime(set.setDuration) : "",
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <Text style={styles.setRowIndex}>{set.setIndex + 1}</Text>
      <Text style={styles.setRowMain}>
        {formatSetLine(set.weight, set.reps, weightUnit)}
      </Text>
      <Text style={styles.setRowDuration}>
        {set.setDuration ? formatTime(set.setDuration) : ""}
      </Text>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => {
  const onTint = getDayOverviewTextColor(colors);
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: SCREEN_PADDING,
    errorBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      padding: 12,
      marginBottom: 16,
      borderRadius: 12,
      backgroundColor: colors.error + "1A",
    },
    errorBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.error,
    },
    errorBannerRetry: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.error,
    },
    noticeBanner: {
      paddingLeft: 12,
      paddingVertical: 2,
      marginBottom: 16,
      borderRadius: 12,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    noticeBannerRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    noticeBannerText: {
      flex: 1,
      fontSize: 13,
      color: colors.textSecondary,
    },
    noticeBannerAction: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    noticeBannerLink: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent,
    },
    noticeBannerDetail: {
      fontSize: 12,
      color: colors.textSecondary,
      paddingRight: 12,
      paddingBottom: 10,
    },
    skeletonWrap: {
      marginBottom: 20,
    },
    skeletonCard: {
      height: 70,
      borderRadius: 14,
      marginBottom: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    skeletonCardTall: {
      height: 120,
    },
    widgetLineMuted: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    widgetEmpty: {
      alignItems: "center",
      paddingVertical: 8,
    },
    widgetEmptyButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
      marginTop: 16,
    },
    widgetEmptyButtonText: {
      color: colors.textOnAccent,
      fontWeight: "600",
      fontSize: 15,
    },
    widgetRetryButton: {
      minHeight: 44,
      paddingHorizontal: 20,
      justifyContent: "center",
      marginTop: 8,
    },
    widgetRetryButtonText: {
      color: colors.accent,
      fontWeight: "700",
      fontSize: 14,
    },
    emptyState: {
      alignItems: "center",
      padding: 40,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      marginBottom: 20,
    },
    emptyButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 12,
    },
    emptyButtonText: {
      color: colors.textOnAccent,
      fontWeight: "600",
      fontSize: 15,
    },
    emptySecondaryButton: {
      minHeight: 44,
      paddingHorizontal: 16,
      justifyContent: "center",
      marginTop: 8,
    },
    emptySecondaryButtonText: {
      color: colors.accent,
      fontWeight: "600",
      fontSize: 14,
    },
    modalEmptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },
    currentDayHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    currentDayText: {
      flex: 1,
      fontSize: 17,
      fontWeight: "bold",
      color: onTint,
    },
    completeBadge: {
      backgroundColor: `${onTint}33`,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 16,
    },
    completeBadgeText: {
      color: onTint,
      fontSize: 12,
      fontWeight: "600",
    },
    lockedBadge: {
      backgroundColor: `${onTint}4D`,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 16,
    },
    lockedBadgeText: {
      color: onTint,
      fontSize: 12,
      fontWeight: "600",
    },
    dayActions: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    changeDayButton: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
      backgroundColor: `${onTint}33`,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: onTint,
    },
    changeDayButtonText: {
      color: onTint,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    goToWorkoutButton: {
      flex: 1,
      minHeight: 44,
      justifyContent: "center",
      backgroundColor: colors.surface,
      paddingVertical: 9,
      borderRadius: 8,
    },
    goToWorkoutButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    logPastButton: {
      alignSelf: "center",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 12,
    },
    logPastButtonText: {
      color: onTint,
      fontSize: 13,
      fontWeight: "600",
      textDecorationLine: "underline",
    },
    lockedHintText: {
      marginTop: 8,
      fontSize: 12,
      color: onTint,
      opacity: 0.9,
      textAlign: "center",
    },
    calendarLoading: {
      paddingVertical: 40,
      alignItems: "center",
    },
    weeklyProgressWrap: {
      paddingVertical: 2,
    },
    weeklyProgressHeaderRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    weeklyProgressPercent: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.textPrimary,
    },
    weeklyProgressCount: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    weeklyProgressTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.inputBackground,
      overflow: "hidden",
      marginBottom: 12,
    },
    weeklyProgressFill: {
      height: "100%",
      borderRadius: 4,
    },
    weeklyProgressDots: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    weeklyProgressDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
    },
    weeklyProgressDotToday: {
      borderColor: colors.accent,
      borderStyle: "dashed",
    },
    weeklyProgressDotDone: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    weeklyProgressDotCheck: {
      color: colors.textOnAccent,
      fontSize: 12,
      fontWeight: "bold",
    },
    weeklyProgressDotNumber: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: "700",
    },
    weeklyProgressDotNumberToday: {
      color: colors.accent,
    },
    streakWrap: {
      alignItems: "center",
      paddingVertical: 4,
    },
    streakLoading: {
      paddingVertical: 16,
      alignItems: "center",
    },
    streakEmoji: {
      fontSize: 24,
      marginBottom: 2,
    },
    streakNumber: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.textPrimary,
      lineHeight: 34,
    },
    streakLabel: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    streakSub: {
      fontSize: 12,
      color: colors.textSecondary,
      textAlign: "center",
    },
    dayOption: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
    },
    dayOptionCurrent: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    dayOptionComplete: {
      backgroundColor: colors.background,
      borderColor: colors.surfaceBorder,
    },
    dayOptionLeft: {
      flex: 1,
    },
    dayOptionNumber: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    dayOptionTextCurrent: {
      color: colors.accent,
    },
    dayOptionTextComplete: {
      color: colors.textMuted,
    },
    dayOptionMuscles: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    lockedText: {
      fontSize: 12,
      color: colors.success,
      fontWeight: "600",
      fontStyle: "italic",
    },
    dayOptionRight: {
      marginLeft: 10,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    completeIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    completeIconText: {
      color: colors.textOnAccent,
      fontSize: 18,
      fontWeight: "bold",
    },
    currentBadge: {
      backgroundColor: colors.accent,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    currentBadgeText: {
      color: colors.textOnAccent,
      fontSize: 12,
      fontWeight: "600",
    },
    modalFooter: {
      padding: 15,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceBorder,
      alignItems: "center",
    },
    modalFooterText: {
      fontSize: 13,
      color: colors.textSecondary,
      fontStyle: "italic",
      textAlign: "center",
    },
    sessionListItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 16,
      paddingHorizontal: 12,
      backgroundColor: colors.inputBackground,
      borderRadius: 8,
      marginBottom: 8,
    },
    sessionListLeft: {
      flex: 1,
    },
    sessionListTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 6,
    },
    sessionListMeta: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
    },
    sessionListTime: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    sessionListDuration: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    sessionListSets: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    sessionListArrow: {
      fontSize: 24,
      color: colors.textMuted,
      marginLeft: 10,
    },
    detailSection: {
      marginBottom: 25,
    },
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
    muscleTagText: {
      color: colors.accent,
      fontSize: 13,
      fontWeight: "500",
    },
    detailRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    detailLabel: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
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
    exerciseSetsCount: {
      fontSize: 14,
      color: colors.accent,
      fontWeight: "600",
    },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.inputBorder,
    },
    setRowFirst: {
      borderTopWidth: 0,
    },
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
    setRowDuration: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });
};
