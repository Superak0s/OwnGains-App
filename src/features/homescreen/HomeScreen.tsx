import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
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
import { useAlert } from "@shared/components/CustomAlert";
import { workoutApi } from "@features/workout/services/index";
import { formatTime } from "@utils/timeEstimation";
import {
  formatDate as formatDateUtil,
  formatClockTime,
  parseDate,
  toDateString,
} from "@utils/format";
import { visibleDaysForSplit } from "@utils/programDays";
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
  readonly onCreatePlan: () => void;
  readonly styles: ReturnType<typeof makeStyles>;
};

function getDayStatusLabel(locked: boolean, sessionActive: boolean): string {
  if (locked) return "✓ Locked";
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
  onCreatePlan,
  styles,
}: NextWorkoutWidgetProps): React.JSX.Element {
  if (!selectedSplit || !workoutData) {
    return (
      <View style={styles.widgetEmpty}>
        <Text style={styles.widgetLineMuted}>
          No workout plan yet. Set one up to see today's session here.
        </Text>
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

  const dayTitle = getDayTitle(workoutData, currentDay);
  const locked = isDayLocked(currentDay);

  return (
    <View
      style={[styles.currentDayCard, locked && styles.currentDayCardLocked]}
    >
      <Text style={styles.currentDayText}>
        {dayTitle ? `Day ${displayDay} - ${dayTitle}` : `Day ${displayDay}`}
      </Text>
      <View style={locked ? styles.lockedBadge : styles.completeBadge}>
        <Text
          style={locked ? styles.lockedBadgeText : styles.completeBadgeText}
        >
          {getDayStatusLabel(locked, hasActiveSession())}
        </Text>
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
          accessibilityLabel={locked ? "View workout" : "Start workout"}
          onPress={onGoToWorkout}
        >
          <Text
            style={[
              styles.goToWorkoutButtonText,
              locked && styles.goToWorkoutButtonTextLocked,
            ]}
          >
            {locked ? "View Workout 👁️" : "Start Workout →"}
          </Text>
        </TouchableOpacity>
      </View>
      {locked && (
        <Text style={styles.lockedHintText}>
          💡 This day is view-only. Select another day to continue training.
        </Text>
      )}
    </View>
  );
}

type WeeklyProgressWidgetProps = {
  readonly selectedSplit: string | null;
  readonly days: readonly WorkoutDay[];
  readonly currentDay: number;
  readonly isDayLocked: (day: number) => boolean;
  readonly colors: ThemeColors;
  readonly styles: ReturnType<typeof makeStyles>;
};

function WeeklyProgressWidget({
  selectedSplit,
  days,
  currentDay,
  isDayLocked,
  colors,
  styles,
}: WeeklyProgressWidgetProps): React.JSX.Element {
  if (!selectedSplit || days.length === 0) {
    return (
      <Text style={styles.widgetLineMuted}>
        Start a program to see this week's progress here.
      </Text>
    );
  }

  const total = days.length;
  const lockedCount = days.filter((d) => isDayLocked(d.dayNumber)).length;
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
        {days.map((day) => (
          <WeeklyProgressDot
            key={day.dayNumber}
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
  done,
  isToday,
  styles,
}: {
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
      {done && <Text style={styles.weeklyProgressDotCheck}>✓</Text>}
    </View>
  );
}

type WorkoutStreakWidgetProps = {
  readonly loadingHistory: boolean;
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
  weeklyStreak,
  historyBounded,
  colors,
  styles,
}: WorkoutStreakWidgetProps): React.JSX.Element {
  if (loadingHistory) {
    return (
      <View style={styles.streakLoading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.streakWrap} accessible>
      <Text style={styles.streakEmoji}>
        {weeklyStreak.count > 0 ? "🔥" : "🕯️"}
      </Text>
      <Text style={styles.streakNumber}>
        {weeklyStreak.count}
        {historyBounded ? "+" : ""}
      </Text>
      <Text style={styles.streakLabel}>week streak</Text>
      <Text style={styles.streakSub}>{getStreakSubtitle(weeklyStreak)}</Text>
    </View>
  );
}

type WorkoutCalendarWidgetProps = {
  readonly loadingHistory: boolean;
  readonly colors: ThemeColors;
  readonly hasSessionOnDate: (date: Date) => boolean;
  readonly onDatePress: (date: Date) => void;
  readonly styles: ReturnType<typeof makeStyles>;
};

function WorkoutCalendarWidget({
  loadingHistory,
  colors,
  hasSessionOnDate,
  onDatePress,
  styles,
}: WorkoutCalendarWidgetProps): React.JSX.Element {
  if (loadingHistory) {
    return (
      <View style={styles.calendarLoading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

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
            `${describeLocalOnlyFeatures(nowOnServer)} ${nowOnServer.length > 1 ? "are" : "is"} saved to your server again. Entries logged on this phone in the meantime aren't shown, but they're still on this phone.`,
          );
        }
        if (nowLocal.length) {
          lines.push(
            `Your server no longer stores ${describeLocalOnlyFeatures(nowLocal)}. New entries stay on this phone, and the ones on the server aren't shown until it stores them again.`,
          );
        }
        alert("Server storage changed", lines.join("\n\n"), [{ text: "OK" }]);
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

  const widgetBoard = useWidgetBoard(addWidget, {
    onError: (message) => alert("Can't Add Widget", message, [{ text: "OK" }]),
  });

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
            onCreatePlan={() => navigation.navigate("Plan")}
            styles={styles}
          />
        );
      case "weekly_progress":
        return (
          <WeeklyProgressWidget
            selectedSplit={selectedSplit}
            days={visibleDays.map(({ day }) => day)}
            currentDay={currentDay}
            isDayLocked={isDayLocked}
            colors={colors}
            styles={styles}
          />
        );
      case "workout_streak":
        return (
          <WorkoutStreakWidget
            loadingHistory={firstHistoryLoad}
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
            colors={colors}
            hasSessionOnDate={hasSessionOnDate}
            onDatePress={setSelectedDate}
            styles={styles}
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
      await Promise.all([loadSessionHistory(), syncFromServer()]);
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
          `Day ${shownNumber} is locked this week, so your workout in progress can't move there. Pick another day or end the workout first.`,
          [{ text: "OK" }],
          "warning",
        );
        return;
      }
      alert(
        "Move Workout",
        `Continue your workout on Day ${shownNumber}? Exercises you've logged sets for come with you, and ones you haven't started are left behind. Where both days have the same exercise, Day ${shownNumber}'s sets and reps are used.`,
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

    if (isDayLocked(day)) {
      alert(
        "View Locked Day",
        `Day ${shownNumber} has been completed and locked this week. You can view the workout details but cannot make changes.\n\nSelect this day to view it in read-only mode.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "View Day",
            onPress: () => {
              saveCurrentDay(day);
              setShowDayPicker(false);
            },
          },
        ],
        "lock",
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
      setSelectedDate(null);
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
          <View style={styles.header}>
            <Text style={styles.title}>Workout Tracker</Text>
            {!selectedSplit && (
              <Text style={styles.subtitle}>
                Upload your workout plan and get started
              </Text>
            )}
          </View>

          {outdatedServer && (
            <View style={styles.errorBanner} accessibilityLiveRegion='polite'>
              <Text style={styles.errorBannerText}>
                This server runs version {outdatedServer.version}. Version{" "}
                {MIN_SERVER_VERSION} or newer is needed for blocking, reporting,
                data export and changing day mid-workout. Ask its operator to update.
              </Text>
            </View>
          )}

          {historyError && (
            <View style={styles.errorBanner} accessibilityLiveRegion='polite'>
              <Text style={styles.errorBannerText}>
                Couldn't load your workout history. Check your connection and
                try again.
              </Text>
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
            </View>
          )}

          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditHeader
              editMode={widgetBoard.editMode}
              onDone={() => widgetBoard.setEditMode(false)}
            />
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
            </View>
          )}

          <WidgetsPanel
            widgets={widgets}
            editMode={widgetBoard.editMode}
            onCycleSize={cycleWidgetSize}
            onRemove={removeWidget}
            onReorder={reorderWidgets}
            renderContent={renderWidgetContent}
            registry={HOME_WIDGET_REGISTRY}
          />

          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditButton onPress={widgetBoard.openGallery} />
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
              🔒 Locked days can be viewed in read-only mode • Resets every
              Monday
            </Text>
          </View>
        </ModalSheet>

        <ModalSheet
          visible={selectedDate !== null}
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
        isCurrent && styles.dayOptionCurrent,
        isLocked && styles.dayOptionComplete,
      ]}
      accessibilityRole='button'
      accessibilityLabel={[
        `Day ${displayNumber}`,
        (day.primaryMuscles ?? []).join(", "),
        isLocked ? "locked, opens in view-only mode" : "",
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
            isCurrent && styles.dayOptionTextCurrent,
            isLocked && styles.dayOptionTextComplete,
          ]}
        >
          {`Day ${displayNumber}${isLocked ? " 🔒" : ""}`}
        </Text>
        <Text style={styles.dayOptionMuscles}>
          {(day.primaryMuscles ?? []).join(", ")}
        </Text>
        {isLocked && (
          <Text style={styles.lockedText}>Locked - Tap to View</Text>
        )}
      </View>
      <View style={styles.dayOptionRight}>
        {isLocked && (
          <View style={styles.completeIcon}>
            <Text style={styles.completeIconText}>✓</Text>
          </View>
        )}
        {isCurrent && !isLocked && (
          <View style={styles.currentBadge}>
            <Text style={styles.currentBadgeText}>Current</Text>
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
          ? `Day ${session.dayNumber}, ${title}`
          : `Day ${session.dayNumber}`,
        formatSessionTime(session.startTime),
        session.totalDuration ? formatTime(session.totalDuration, "N/A") : "",
        `${session.completedSets} sets`,
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
            ? `Day ${session.dayNumber} - ${title}`
            : `Day ${session.dayNumber}`}
        </Text>
        <View style={styles.sessionListMeta}>
          <Text style={styles.sessionListTime}>
            {`⏱️ ${formatSessionTime(session.startTime)}`}
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
        <Text style={styles.detailTitle}>{`Day ${session.dayNumber}`}</Text>
        <Text style={styles.detailSubtitle}>{session.dayTitle ?? ""}</Text>
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
            <Text style={styles.detailSectionTitle}>Exercises</Text>
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

      {exercise.sets.map((set: SetTiming) => (
        <SetTimingCard
          key={set.id ?? `${set.setIndex}-${set.endTime}`}
          set={set}
          weightUnit={weightUnit}
          styles={styles}
        />
      ))}
    </View>
  );
}

function SetTimingCard({
  set,
  weightUnit,
  styles,
}: {
  readonly set: SetTiming;
  readonly weightUnit: "kg" | "lbs";
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <View style={styles.setTimingCard}>
      <View style={styles.setTimingHeader}>
        <Text style={styles.setTimingTitle}>{`Set ${set.setIndex + 1}`}</Text>
      </View>
      <View style={styles.setTimingDetails}>
        <Text style={styles.setTimingDetail}>
          {formatSetLine(set.weight, set.reps, weightUnit)}
        </Text>
        {!!set.setDuration && (
          <Text style={styles.setTimingDetail}>
            {`Duration: ${formatTime(set.setDuration)}`}
          </Text>
        )}
      </View>
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
    content: {
      padding: 10,
      paddingTop: 10,
      paddingBottom: 120,
    },
    header: {
      marginBottom: 30,
      alignItems: "center",
    },
    title: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.textSecondary,
      textAlign: "center",
    },
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
      color: colors.surface,
      fontWeight: "600",
      fontSize: 15,
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
      color: colors.surface,
      fontWeight: "600",
      fontSize: 15,
    },
    modalEmptyText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
      paddingVertical: 24,
    },
    currentDayCard: {
      backgroundColor: getDayOverviewTint(colors, false, false),
      borderRadius: 12,
      padding: 20,
      alignItems: "center",
      marginBottom: 20,
    },
    currentDayCardLocked: {
      backgroundColor: getDayOverviewTint(colors, true, false),
    },
    currentDayText: {
      fontSize: 20,
      fontWeight: "bold",
      color: onTint,
      marginBottom: 10,
      textAlign: "center",
    },
    completeBadge: {
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginBottom: 15,
    },
    completeBadgeText: {
      color: onTint,
      fontSize: 14,
      fontWeight: "600",
    },
    lockedBadge: {
      backgroundColor: "rgba(255, 255, 255, 0.3)",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      marginBottom: 15,
    },
    lockedBadgeText: {
      color: onTint,
      fontSize: 14,
      fontWeight: "600",
    },
    dayActions: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    changeDayButton: {
      flex: 1,
      backgroundColor: "rgba(255, 255, 255, 0.2)",
      paddingHorizontal: 20,
      paddingVertical: 12,
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
      backgroundColor: colors.surface,
      paddingVertical: 12,
      borderRadius: 8,
    },
    goToWorkoutButtonText: {
      color: colors.accent,
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    goToWorkoutButtonTextLocked: {
      color: colors.textSecondary,
    },
    lockedHintText: {
      marginTop: 12,
      fontSize: 13,
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
      color: colors.surface,
      fontSize: 12,
      fontWeight: "bold",
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
      color: colors.surface,
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
      color: colors.surface,
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
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      backgroundColor: colors.surface,
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
      color: colors.surfaceBorder,
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
      marginBottom: 16,
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
    setTimingCard: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
    },
    setTimingHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 6,
    },
    setTimingTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    setTimingDetails: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    setTimingDetail: {
      fontSize: 14,
      color: colors.textSecondary,
    },
  });
};
