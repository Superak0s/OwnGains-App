import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useDeferredValue,
  useCallback,
  useEffectEvent,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useWorkoutPick, WorkoutProvider } from "@shared/context/WorkoutContext";
import { useJointSessionContextOptional } from "@shared/context/JointSessionContext";
import { getAppMode, onAppModeChange } from "@shared/services/appMode";
import { getAppRole, onAppRoleChange } from "@shared/services/appRole";
import {
  getActiveTrainee,
  setActiveTrainee,
  onActiveTraineeChange,
} from "@shared/services/trainerEvents";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import ModalSheet from "@shared/components/ModalSheet";
import { Button, EmptyState } from "@shared/components/ui";
import { useAlert } from "@shared/components/CustomAlert";
import {
  promptForAlarmPermissions,
  promptForExactAlarms,
} from "@shared/services/notifications";
import { alarmsAvailable } from "@shared/services/supplementAlarms";
import {
  getAllExerciseNames,
  getAllMuscleGroups,
  checkForTypo,
  getCanonicalName,
  normalizeExerciseName,
  getExercisesByMuscleGroup,
  splitExercises,
} from "@utils/exerciseMatching";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  loadFromStorage,
  saveToStorage,
  STORAGE_KEYS,
} from "@shared/services/storage";
import { useWidgets, useWidgetBoard } from "@shared/context/hooks/useWidgets";
import WidgetGallery from "@shared/components/widgets/WidgetGallery";
import WidgetEditButton from "@shared/components/widgets/WidgetEditButton";
import {
  WidgetPullHint,
  WidgetEditHeader,
} from "@shared/components/widgets/WidgetBoardChrome";
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel";
import {
  WORKOUT_WIDGET_REGISTRY,
  DEFAULT_WORKOUT_WIDGETS,
  type WorkoutWidgetType,
} from "./widgets";
import type {
  WidgetInstance,
  Exercise,
  MachineMeta,
  SetDetail,
  RootStackParamList,
  WorkoutSession,
} from "@shared/types";
import {
  toSuggestions,
  parseMuscleList,
  type ExerciseSuggestion,
} from "@utils/exerciseDb";
import {
  WIDGET_GROUP_RADIUS,
  activeMachine,
  editMachineMeta,
  kgToDisplay,
  validateWeightInput,
  parseReps,
  MAX_REPS,
  displayToKg,
  beatsBest,
  getEmptyStateInfo,
  getDayOverviewTint,
  getDayOverviewTextColor,
  computeProgressPercentage,
  getAddingSetsSubtitle,
  checkIsSelectedSetAssisted,
  isAssistedExercise,
  getLocalHistoryEntries,
  getServerHistoryEntries,
  pickBestPerformanceSummary,
  suggestNextSetLoad,
  progressionStepKg,
  resolveExerciseMuscles,
  exercisesForMuscle,
  muscleDisplayName,
  resolveExerciseUnit,
  parseRestDuration,
  EMPTY_WORKOUT_TITLE,
  type ProgressionSuggestion,
  type WeightUnit,
} from "./utils";
import { useExerciseUnits } from "./hooks/useExerciseUnits";
import { UndoBar } from "./components/UndoBar";
import { isDarkColor, toRgbHex } from "@utils/color";
import { estimateOneRepMax } from "@utils/oneRepMax";
import { INACTIVITY_THRESHOLD_MS } from "@utils/session";
import { showToast } from "@shared/components/toast";
import type { MachinePatch } from "@shared/context/hooks/useProgramOperations";
import { PartnerBanner } from "./components/PartnerBanner";
import { PrCelebration } from "./components/PrCelebration";
import {
  EMPTY_SET_DRAFT,
  SetDetailsForm,
  type SetDraft,
} from "./components/SetDetailsForm";
import { TrainerBanner } from "./components/TrainerBanner";
import { WatchersBanner } from "./components/WatchersBanner";
import { sharingApi } from "@features/friends/services/index";
import { TrainerSessionBar } from "./components/TrainerSessionBar";
import {
  takeTraineeStart,
  type CustomWorkout,
  type TraineeOption,
} from "@shared/services/trainerEvents";
import { userFacingError } from "@shared/services/apiError";
import { CUSTOM_DAY } from "@utils/dayCarryOver";

const MAX_ADDITIONAL_SETS = 20;
// An hour of rest is already far past any real set. Beyond it the reminder is
// a typo scheduling a notification days away.
const MAX_REST_REMINDER_SECONDS = 3600;
import { ExerciseCard, SET_GAP } from "./components/ExerciseCard";
import {
  MuscleBrowseChips,
  AdvancedMuscles,
} from "./components/ExerciseMuscleFields";
import {
  SuggestionList,
  type SuggestionItem,
} from "./components/SuggestionList";
import { SessionStatsWidget } from "./components/SessionStatsTicker";
import { useRestReminder } from "./hooks/useRestReminder";
import {
  buildTrainingSetEntries,
  getUndertrainedMuscleGroups,
  type UndertrainedCalculationMode,
} from "../analytics/utils/trainingSummary";
import { captureException, log, metric } from "@shared/services/crashReporting";
import { tutorialAnchor } from "@features/tutorial/anchors";
import { SCREEN_PADDING } from "@shared/layout";
import { toTimeString } from "@utils/format";

interface CurrentDayWorkout {
  dayNumber: number;
  dayTitle?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  exercises: Exercise[];
  totalSets: number;
}

interface WorkoutScreenBodyProps {
  readonly hidePartnerControls?: boolean;
  readonly header?: React.ReactNode;
  /** False for the trainer/trainee pane hidden behind the other tab. */
  readonly visible?: boolean;
}

function exerciseAt(
  day: CurrentDayWorkout | null,
  index: number | null,
): Exercise | null {
  if (index === null) return null;
  return day?.exercises[index] ?? null;
}

function stickyTarget(
  prev: { day: number; target: string | null },
  day: number,
  muscle: string | undefined,
): { day: number; target: string | null } {
  const computed = muscle ? normalizeExerciseName(muscle) : null;
  if (prev.day !== day) return { day, target: computed };
  return { day, target: prev.target ?? computed };
}

// The flag is resolved once per exercise instead of inside the comparator
// and again at each render site.
function orderByPriority(exercises: Exercise[], target: string | null) {
  const ordered = exercises.map((exercise, originalIndex) => ({
    exercise,
    originalIndex,
    isPriority:
      target !== null &&
      [
        ...(exercise.primaryMuscles ?? []),
        ...(exercise.secondaryMuscles ?? []),
      ].some((m) => normalizeExerciseName(m) === target),
  }));
  if (target !== null) {
    ordered.sort((a, b) => Number(!a.isPriority) - Number(!b.isPriority));
  }
  return ordered;
}

function WorkoutScreenBody({
  hidePartnerControls = false,
  header,
  visible = true,
}: WorkoutScreenBodyProps): React.JSX.Element {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const {
    userId: targetUserId,
    sessionWorkoutData: workoutData,
    activeTrainer,
    selectedSplit,
    currentDay,
    completedDays,
    saveSetDetails: saveSetDetailsCtx,
    deleteSetDetails: deleteSetDetailsCtx,
    isSetComplete,
    getSetDetails,
    getExerciseCompletedSets,
    isDayComplete,
    isDayLocked,
    getEstimatedTimeRemaining,
    getEstimatedEndTime,
    getExerciseRestTime,
    getLastSetExercise,
    workoutStartTime,
    untimedSession,
    endWorkout,
    updateExerciseName,
    updateExerciseMachines,
    addExtraSetsToExercise,
    addNewExercise,
    lastActivityTime,
    weightUnit,
    fetchSessionHistory,
    fetchRecordSessions,
    hasActiveSession,
    actAs,
    saveSelectedSplit,
    resetDay,
    startCustomWorkout,
    isLoading,
  } = useWorkoutPick(
    "userId",
    "sessionWorkoutData",
    "activeTrainer",
    "selectedSplit",
    "currentDay",
    "completedDays",
    "saveSetDetails",
    "deleteSetDetails",
    "actAs",
    "saveSelectedSplit",
    "resetDay",
    "isSetComplete",
    "getSetDetails",
    "getExerciseCompletedSets",
    "isDayComplete",
    "isDayLocked",
    "getEstimatedTimeRemaining",
    "getEstimatedEndTime",
    "getExerciseRestTime",
    "getLastSetExercise",
    "workoutStartTime",
    "untimedSession",
    "endWorkout",
    "updateExerciseName",
    "updateExerciseMachines",
    "addExtraSetsToExercise",
    "addNewExercise",
    "lastActivityTime",
    "weightUnit",
    "fetchSessionHistory",
    "fetchRecordSessions",
    "hasActiveSession",
    "startCustomWorkout",
    "isLoading",
  );

  const joint = useJointSessionContextOptional();
  const isInJointSession = !hidePartnerControls && !!joint?.isInJointSession;
  const jointSession = joint?.jointSession ?? null;
  const partnerProgress = joint?.partnerProgress ?? null;
  const isPartnerReady = joint?.isPartnerReady ?? false;
  const syncPulse = joint?.syncPulse ?? false;
  const partnerCompletedSets = joint?.partnerCompletedSets ?? [];
  const pushJointProgress = joint?.pushJointProgress;
  const leaveJointSession = joint?.leaveJointSession;

  const { alert, AlertComponent } = useAlert();
  // Only a trainee provider's edits reject: the client's server refused them.
  const reportRefused = useCallback(
    (edit: Promise<void>) =>
      void edit.catch((error: unknown) =>
        alert(
          "Couldn't Change Program",
          userFacingError(error, "The change was not saved."),
          [{ text: "OK" }],
          "error",
        ),
      ),
    [alert],
  );

  const startFreeWorkout = useCallback(
    async (start: CustomWorkout) => {
      const fail = (text: string) =>
        alert("Couldn't Start Workout", text, [{ text: "OK" }], "error");
      try {
        const id = await startCustomWorkout(start.dayTitle, start.exercises);
        if (!id) fail("Finish the open workout first.");
      } catch (error) {
        fail(userFacingError(error, "The workout could not be started."));
      }
    },
    [startCustomWorkout, alert],
  );
  const startEmptyWorkout = useCallback(
    () => startFreeWorkout({ dayTitle: EMPTY_WORKOUT_TITLE, exercises: [] }),
    [startFreeWorkout],
  );

  useEffect(() => {
    if (!actAs || isLoading) return;
    const queued = takeTraineeStart(actAs.userId);
    if (queued?.split) void saveSelectedSplit(queued.split);
    if (queued?.start) void startFreeWorkout(queued.start);
  }, [actAs, isLoading, startFreeWorkout, saveSelectedSplit]);

  const warnDayLocked = useCallback(
    (message: string) => alert("Day Locked", message, [{ text: "OK" }], "lock"),
    [alert],
  );

  const isMountedRef = useRef<boolean>(true);
  // Latched per day: the target is derived from completedDays, so without this
  // logging a set re-sorts the exercise list under the user's finger.
  const priorityTargetRef = useRef<{ day: number; target: string | null }>({
    day: -1,
    target: null,
  });
  useEffect(() => {
    // Fast refresh runs cleanup then the effect again on the same refs.
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const partner = jointSession?.participants?.find(
    (p) => p.userId !== user?.id,
  );
  const partnerUsername = partner?.username ?? "Partner";

  const [showSetModal, setShowSetModal] = useState<boolean>(false);
  const [selectedSet, setSelectedSet] = useState<{
    exerciseIndex: number;
    setIndex: number;
  } | null>(null);
  const [setDraft, setSetDraft] = useState<SetDraft>(EMPTY_SET_DRAFT);
  const [setFormDirty, setSetFormDirty] = useState(false);
  const [revokedTrainer, setRevokedTrainer] = useState<string | null>(null);
  const [setFormKey, setSetFormKey] = useState(0);
  const setDraftStartedRef = useRef(false);
  const [performanceHistory, setPerformanceHistory] =
    useState<ReturnType<typeof pickBestPerformanceSummary>>(null);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [progression, setProgression] = useState<ProgressionSuggestion | null>(
    null,
  );
  const [prCelebration, setPrCelebration] = useState<{
    exerciseName: string;
    detail: string;
  } | null>(null);
  const [showEditNameModal, setShowEditNameModal] = useState<boolean>(false);
  const [machinesFor, setMachinesFor] = useState<number | null>(null);
  const [newMachineName, setNewMachineName] = useState<string>("");
  const [settingsFor, setSettingsFor] = useState<number | null>(null);
  const [editMachine, setEditMachine] = useState<{
    key: string;
    name: string;
    note: string;
    pin: string;
  } | null>(null);
  const [editingExercise, setEditingExercise] = useState<{
    index: number;
    exercise: {
      name: string;
      primaryMuscles?: string[];
      secondaryMuscles?: string[];
      sets: number;
    };
  } | null>(null);
  const [newExerciseName, setNewExerciseName] = useState<string>("");
  const [newPrimaryMuscles, setNewPrimaryMuscles] = useState<string>("");
  const [newSecondaryMuscles, setNewSecondaryMuscles] = useState<string>("");
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);
  const [browseMuscle, setBrowseMuscle] = useState<string | null>(null);
  const [showAddSetsModal, setShowAddSetsModal] = useState<boolean>(false);
  const [addingSetsExercise, setAddingSetsExercise] = useState<{
    index: number;
    exercise: Exercise & { sets?: number };
  } | null>(null);
  const [additionalSets, setAdditionalSets] = useState<string>("");
  const [showAddExerciseModal, setShowAddExerciseModal] =
    useState<boolean>(false);
  const [newExercise, setNewExercise] = useState<{
    name: string;
    exerciseId?: string;
    primaryMuscles: string;
    secondaryMuscles: string;
    sets: string;
    reps: string;
  }>({
    name: "",
    primaryMuscles: "",
    secondaryMuscles: "",
    sets: "",
    reps: "",
  });
  const [newExerciseSuggestions, setNewExerciseSuggestions] = useState<
    ExerciseSuggestion[]
  >([]);
  const [restReminderEnabled, setRestReminderEnabled] =
    useState<boolean>(false);
  const [restReminderSeconds, setRestReminderSeconds] = useState<number>(0);
  const [showRestReminderModal, setShowRestReminderModal] =
    useState<boolean>(false);
  const [tempRestReminderSeconds, setTempRestReminderSeconds] =
    useState<string>("");
  const [restReminderAlarm, setRestReminderAlarm] = useState(false);
  const [tempRestReminderAlarm, setTempRestReminderAlarm] = useState(false);
  const [undertrainedDisplayMode, setUndertrainedDisplayMode] = useState<
    "banner" | "per_exercise" | "both" | "off"
  >("off");
  const [undertrainedCalculationMode, setUndertrainedCalculationMode] =
    useState<UndertrainedCalculationMode>("days_done");
  const [dismissedUndertrainedBanner, setDismissedUndertrainedBanner] =
    useState<boolean>(false);

  const {
    widgets,
    isLoaded: widgetsLoaded,
    availableToAdd,
    addWidget,
    removeWidget,
    cycleWidgetSize,
    customizeWidget,
    reorderWidgets,
  } = useWidgets<WorkoutWidgetType>(targetUserId, {
    registry: WORKOUT_WIDGET_REGISTRY,
    defaults: DEFAULT_WORKOUT_WIDGETS,
    storageKey: STORAGE_KEYS.WORKOUT_WIDGETS,
  });

  const widgetBoard = useWidgetBoard(addWidget, {
    onError: (message) =>
      alert("Can't Add Widget", message, [{ text: "OK" }], "error"),
  });

  const allExerciseNames = useMemo(
    () => getAllExerciseNames(workoutData, selectedSplit),
    [workoutData, selectedSplit],
  );
  const allMuscleGroups = useMemo(
    () => getAllMuscleGroups(workoutData, selectedSplit),
    [workoutData, selectedSplit],
  );
  const muscleBrowseResults = useMemo(
    () =>
      browseMuscle
        ? exercisesForMuscle(
            browseMuscle,
            splitExercises(workoutData, selectedSplit),
          )
        : [],
    [browseMuscle, workoutData, selectedSplit],
  );
  const swapSuggestions = useMemo(
    () =>
      editingExercise
        ? getExercisesByMuscleGroup(
            workoutData,
            selectedSplit,
            newPrimaryMuscles,
            editingExercise.exercise.name,
          )
        : [],
    [workoutData, selectedSplit, newPrimaryMuscles, editingExercise],
  );

  useEffect(() => {
    (async () => {
      const [displayMode, calcMode] = await Promise.all([
        loadFromStorage<string>(
          STORAGE_KEYS.UNDERTRAINED_DISPLAY_MODE,
          user?.id ?? null,
          false,
        ),
        loadFromStorage<string>(
          STORAGE_KEYS.UNDERTRAINED_CALCULATION_MODE,
          user?.id ?? null,
          false,
        ),
      ]);
      if (displayMode) {
        setUndertrainedDisplayMode(
          displayMode as "banner" | "per_exercise" | "both" | "off",
        );
      }
      if (calcMode) {
        setUndertrainedCalculationMode(calcMode as UndertrainedCalculationMode);
      }
    })();
  }, [user?.id]);

  const undertrainedEntries = useMemo(
    () =>
      buildTrainingSetEntries([], workoutData, selectedSplit, completedDays),
    [workoutData, selectedSplit, completedDays],
  );

  const topUndertrainedGroup = useMemo(() => {
    if (undertrainedDisplayMode === "off" || !hasActiveSession()) return null;
    const groups = getUndertrainedMuscleGroups(
      undertrainedEntries,
      workoutData,
      selectedSplit,
      new Date(),
      undertrainedCalculationMode,
    );
    return groups[0] ?? null;
  }, [
    undertrainedDisplayMode,
    hasActiveSession,
    undertrainedEntries,
    workoutData,
    selectedSplit,
    undertrainedCalculationMode,
  ]);

  const undertrainedCandidates = useMemo(
    () =>
      topUndertrainedGroup
        ? getExercisesByMuscleGroup(
            workoutData,
            selectedSplit,
            topUndertrainedGroup.primaryMuscle,
          )
        : [],
    [topUndertrainedGroup, workoutData, selectedSplit],
  );

  const showUndertrainedBanner =
    ["banner", "both"].includes(undertrainedDisplayMode) &&
    !dismissedUndertrainedBanner &&
    !!topUndertrainedGroup &&
    undertrainedCandidates.length > 0;

  const showUndertrainedPerExercise = ["per_exercise", "both"].includes(
    undertrainedDisplayMode,
  );

  const dayLockedByPlan = isDayLocked(currentDay);
  // A trainer can log on a day the client already finished: they get a warning instead of a lock.
  const isCurrentDayLocked = dayLockedByPlan && !actAs;
  useRestReminder({
    enabled: !actAs && !untimedSession,
    workoutStartTime,
    isCurrentDayLocked,
    restReminderEnabled,
    restReminderSeconds,
    asAlarm: restReminderAlarm,
  });
  const areAllSetsComplete = isDayComplete(currentDay);

  // A fresh object per render would give every dayWorkout-dependent callback a
  // new identity, defeating ExerciseCard's memo comparator.
  const dayWorkout = useMemo((): CurrentDayWorkout | null => {
    if (!workoutData?.days || !selectedSplit) return null;
    const day = workoutData.days.find((d) => d.dayNumber === currentDay);
    if (!day?.split[selectedSplit]) return null;
    return {
      dayNumber: day.dayNumber,
      dayTitle: day.dayTitle,
      primaryMuscles: day.primaryMuscles,
      secondaryMuscles: day.secondaryMuscles,
      exercises: day.split[selectedSplit].exercises || [],
      totalSets: day.split[selectedSplit].totalSets || 0,
    };
  }, [workoutData, selectedSplit, currentDay]);

  const { units: exerciseUnits, setExerciseUnit } = useExerciseUnits(
    user?.id ?? null,
  );
  const unitFor = useCallback(
    (exerciseIndex: number | undefined): WeightUnit =>
      resolveExerciseUnit(
        exerciseUnits,
        dayWorkout?.exercises?.[exerciseIndex ?? -1]?.name,
        weightUnit,
      ),
    [exerciseUnits, dayWorkout, weightUnit],
  );
  const selectedUnit = unitFor(selectedSet?.exerciseIndex);
  const selectedExerciseName =
    dayWorkout?.exercises?.[selectedSet?.exerciseIndex ?? -1]?.name;
  const switchSelectedUnit = useCallback(
    (unit: WeightUnit) => {
      if (selectedExerciseName) setExerciseUnit(selectedExerciseName, unit);
    },
    [selectedExerciseName, setExerciseUnit],
  );

  const todayExerciseNames = new Set(
    (dayWorkout?.exercises ?? []).map((exercise) =>
      normalizeExerciseName(exercise.name),
    ),
  );
  const undertrainedSuggestionCandidates = undertrainedCandidates.filter(
    (name) => !todayExerciseNames.has(normalizeExerciseName(name)),
  );

  useEffect(() => {
    if (!workoutStartTime || isCurrentDayLocked) return;
    (async () => {
      try {
        const stored = await loadFromStorage<number | null>(
          STORAGE_KEYS.REST_REMINDER_SECONDS,
          user?.id ?? null,
        );
        const asAlarm =
          (await loadFromStorage<boolean | null>(
            STORAGE_KEYS.REST_REMINDER_ALARM,
            user?.id ?? null,
          )) === true;
        const secs = Number(stored ?? 0) || 0;
        setRestReminderSeconds(secs);
        setRestReminderEnabled(secs > 0);
        setRestReminderAlarm(asAlarm);
        if (secs > 0 && !asAlarm) void promptForExactAlarms(alert, "rest reminders");
      } catch (err) {
        console.warn("Failed to load rest reminder setting:", err);
        metric.count("workout.rest_reminder_load_failed");
        log.warn("workout.rest_reminder_load_failed");
      }
    })();
  }, [workoutStartTime, isCurrentDayLocked, user?.id, alert]);

  const onSetModalOpen = useEffectEvent(() => {
    void loadPerformanceHistory();
  });
  useEffect(() => {
    if (showSetModal && selectedSet) onSetModalOpen();
  }, [showSetModal, selectedSet]);

  // On the first set of an exercise there is no earlier set in this session to
  // progress from, so seed the prompt from what was logged last time instead.
  const seedProgression = useEffectEvent(
    async (last: { weight: number; reps: number }) => {
      if (progression || setDraftStartedRef.current) return;
      if (!(last.weight > 0 && last.reps > 0)) return;
      if (!(await isPrefEnabled(STORAGE_KEYS.AUTO_PROGRESSION))) return;
      if (!isMountedRef.current) return;
      setProgression({
        weightKg: last.weight,
        reps: last.reps,
        direction: "same",
        reason: "Last session",
      });
    },
  );
  useEffect(() => {
    if (showSetModal && performanceHistory)
      void seedProgression(performanceHistory.last);
  }, [performanceHistory, showSetModal]);

  const deferredExerciseName = useDeferredValue(newExerciseName);
  const nameSuggestions = useMemo<SuggestionItem[]>(() => {
    const query = deferredExerciseName.trim();
    if (!showEditNameModal || !query) return [];
    const seen = new Set([normalizeExerciseName(query)]);
    return [
      ...checkForTypo(query, allExerciseNames).suggestions.map((s) => ({
        name: s.name,
        meta: `${Math.round(s.similarity * 100)}% match`,
      })),
      ...toSuggestions(query, 60).map((s) => ({ name: s.label, meta: s.meta })),
    ].filter((s) => {
      const key = normalizeExerciseName(s.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [deferredExerciseName, showEditNameModal, allExerciseNames]);

  const musclesForEditedName = (name: string) => {
    if (!editingExercise) return null;
    const { exercise } = editingExercise;
    return normalizeExerciseName(name) === normalizeExerciseName(exercise.name)
      ? {
          primary: exercise.primaryMuscles ?? [],
          secondary: exercise.secondaryMuscles ?? [],
        }
      : resolveExerciseMuscles(
          name,
          splitExercises(workoutData, selectedSplit),
        );
  };

  const fillMusclesForName = useEffectEvent((name: string) => {
    const muscles = musclesForEditedName(name);
    if (!muscles) return;
    setNewPrimaryMuscles(muscles.primary.join(", "));
    setNewSecondaryMuscles(muscles.secondary.join(", "));
  });
  useEffect(() => fillMusclesForName(newExerciseName), [newExerciseName]);

  const fillNewExerciseMuscles = useEffectEvent((name: string) => {
    if (!showAddExerciseModal) return;
    const muscles = resolveExerciseMuscles(
      name,
      splitExercises(workoutData, selectedSplit),
    );
    if (!muscles) return;
    setNewExercise((prev) => ({
      ...prev,
      primaryMuscles: muscles.primary.join(", "),
      secondaryMuscles: muscles.secondary.join(", "),
    }));
  });
  useEffect(() => fillNewExerciseMuscles(newExercise.name), [newExercise.name]);

  useEffect(() => {
    if (showAddExerciseModal && newExercise.name.trim().length > 1) {
      setNewExerciseSuggestions(toSuggestions(newExercise.name, 5));
    } else setNewExerciseSuggestions([]);
  }, [newExercise.name, showAddExerciseModal]);

  const autoCompleteNoticeShownRef = useRef(false);
  useEffect(() => {
    if (autoCompleteNoticeShownRef.current) return;
    if (!isDayLocked(currentDay) || !workoutStartTime || !lastActivityTime)
      return;
    if (
      Date.now() - new Date(lastActivityTime).getTime() <
      INACTIVITY_THRESHOLD_MS
    )
      return;
    autoCompleteNoticeShownRef.current = true;
    alert(
      "Session Auto-Completed",
      "Your workout ended after 30 minutes with no sets logged. Every set you logged is saved. Start the day again to begin a new session.",
      [{ text: "OK" }],
      "info",
    );
  }, [currentDay, workoutStartTime, lastActivityTime, isDayLocked, alert]);

  // Every set-modal open needs the same 50 sessions. Refetching them per tap
  // stalls logging between sets on a slow gym connection.
  const sessionHistoryCacheRef = useRef<{
    fetcher: typeof fetchSessionHistory;
    sessions: Promise<WorkoutSession[]>;
  } | null>(null);
  const cachedFetchSessionHistory = useCallback(
    (limit: number, includeTimings: boolean): Promise<WorkoutSession[]> => {
      const cached = sessionHistoryCacheRef.current;
      if (cached?.fetcher === fetchSessionHistory) return cached.sessions;
      const sessions = fetchSessionHistory(limit, includeTimings);
      const entry = { fetcher: fetchSessionHistory, sessions };
      sessionHistoryCacheRef.current = entry;
      sessions.catch(() => {
        if (sessionHistoryCacheRef.current === entry)
          sessionHistoryCacheRef.current = null;
      });
      return sessions;
    },
    [fetchSessionHistory],
  );
  const recordSessionsCacheRef = useRef<{
    fetcher: typeof fetchRecordSessions;
    sessions: Promise<WorkoutSession[] | null>;
  } | null>(null);
  const cachedFetchRecordSessions = useCallback((): Promise<
    WorkoutSession[] | null
  > => {
    const cached = recordSessionsCacheRef.current;
    if (cached?.fetcher === fetchRecordSessions) return cached.sessions;
    const sessions = fetchRecordSessions();
    const entry = { fetcher: fetchRecordSessions, sessions };
    recordSessionsCacheRef.current = entry;
    void sessions.then((records) => {
      if (records === null && recordSessionsCacheRef.current === entry)
        recordSessionsCacheRef.current = null;
    });
    return sessions;
  }, [fetchRecordSessions]);
  const deleteSetDetails = useCallback(
    (...args: Parameters<typeof deleteSetDetailsCtx>) => {
      sessionHistoryCacheRef.current = null;
      recordSessionsCacheRef.current = null;
      return deleteSetDetailsCtx(...args);
    },
    [deleteSetDetailsCtx],
  );

  const historyRequestRef = useRef(0);
  const historyCompleteRef = useRef(true);
  const [historyFailed, setHistoryFailed] = useState(false);
  const loadPerformanceHistory = useCallback(async () => {
    if (!selectedSet || !dayWorkout) return;
    const requestId = ++historyRequestRef.current;
    const isCurrent = () =>
      isMountedRef.current && historyRequestRef.current === requestId;
    setLoadingHistory(true);
    setHistoryFailed(false);
    try {
      const exercise = dayWorkout.exercises[selectedSet.exerciseIndex];
      if (!exercise) {
        if (isCurrent()) setPerformanceHistory(null);
        return;
      }
      const canonicalName = getCanonicalName(exercise.name, allExerciseNames);
      const machine = exercise.bestAcrossMachines
        ? null
        : activeMachine(exercise);

      // completedDays is wiped every Monday, so on its own it makes the best
      // set of the current week the all-time best. Stored history is always
      // consulted and the two are merged.
      const localHistory = getLocalHistoryEntries(
        completedDays,
        workoutData,
        selectedSplit,
        canonicalName,
        allExerciseNames,
        machine,
      );
      const storedHistory =
        typeof fetchSessionHistory === "function"
          ? await getServerHistoryEntries(
              cachedFetchSessionHistory,
              exercise.name,
              canonicalName,
              allExerciseNames,
              machine,
              cachedFetchRecordSessions,
            )
          : [];
      if (isCurrent()) {
        historyCompleteRef.current = storedHistory !== null;
        setHistoryFailed(storedHistory === null);
      }
      const history = [...(storedHistory ?? []), ...localHistory];

      if (!history.length) {
        if (isCurrent()) setPerformanceHistory(null);
        return;
      }

      const summary = pickBestPerformanceSummary(
        history,
        isAssistedExercise(exercise.name),
      );
      if (isCurrent()) setPerformanceHistory(summary);
    } catch (e) {
      console.error("Error loading performance history:", e);
      metric.count("workout.performance_history_load_failed");
      captureException(e, { stage: "loadPerformanceHistory" });
      if (isCurrent()) {
        setPerformanceHistory(null);
        setHistoryFailed(true);
      }
    } finally {
      if (isCurrent()) setLoadingHistory(false);
    }
  }, [
    selectedSet,
    dayWorkout,
    completedDays,
    workoutData,
    selectedSplit,
    allExerciseNames,
    fetchSessionHistory,
    cachedFetchSessionHistory,
    cachedFetchRecordSessions,
  ]);

  const isPrefEnabled = useCallback(
    async (key: string): Promise<boolean> =>
      (await loadFromStorage<boolean>(key, user?.id ?? null)) !== false,
    [user?.id],
  );

  const openSetForm = useCallback((draft: SetDraft) => {
    setSetDraft(draft);
    setSetFormKey((k) => k + 1);
    setDraftStartedRef.current = draft.weight !== "" || draft.reps !== "";
    setProgression(null);
    setPerformanceHistory(null);
  }, []);
  const dismissProgression = useCallback(() => setProgression(null), []);

  const openSetModalForNewEntry = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      let previous: SetDetail | null = null;
      for (let i = setIndex - 1; i >= 0; i--) {
        const detail = getSetDetails(
          currentDay,
          exerciseIndex,
          i,
        ) as SetDetail | null;
        if (detail && !detail.isWarmup) {
          previous = detail;
          break;
        }
      }
      setSelectedSet({ exerciseIndex, setIndex });
      openSetForm(
        previous
          ? {
              ...EMPTY_SET_DRAFT,
              weight: kgToDisplay(previous.weight || 0, unitFor(exerciseIndex)),
            }
          : EMPTY_SET_DRAFT,
      );
      setShowSetModal(true);

      void (async () => {
        const exercise = dayWorkout?.exercises?.[exerciseIndex];
        // More weight on an assisted machine makes the lift easier, so the
        // load rules would progress it backwards.
        if (!exercise || !previous || isAssistedExercise(exercise.name)) return;
        const suggestion = suggestNextSetLoad(
          previous,
          exercise.reps,
          progressionStepKg(unitFor(exerciseIndex)),
        );
        if (!suggestion) return;
        if (!(await isPrefEnabled(STORAGE_KEYS.AUTO_PROGRESSION))) return;
        if (isMountedRef.current) setProgression(suggestion);
      })();
    },
    [dayWorkout, currentDay, getSetDetails, isPrefEnabled, openSetForm, unitFor],
  );

  const showSetSummary = useCallback(
    (exerciseIndex: number, existing: SetDetail) => {
      const unit = unitFor(exerciseIndex);
      const displayWeight = existing.weight
        ? kgToDisplay(existing.weight, unit)
        : "0";
      let msg = `Weight: ${displayWeight} ${unit}
Reps: ${existing.reps || 0}`;
      if (existing.rir != null) msg += `
RIR: ${existing.rir}`;
      if (existing.isWarmup) msg = `Warm-up set
${msg}`;
      if (existing.note) msg += `

Note: ${existing.note}`;
      alert("Set Completed", msg, [{ text: "OK" }], "info");
    },
    [unitFor, alert],
  );

  const openCompletedSet = useCallback(
    (exerciseIndex: number, setIndex: number, existing: SetDetail) => {
      const unit = unitFor(exerciseIndex);
      const displayWeight = existing.weight
        ? kgToDisplay(existing.weight, unit)
        : "0";
      // A trainer may only edit sets while the trainee's workout is open.
      if (actAs && !hasActiveSession()) {
        showSetSummary(exerciseIndex, existing);
        return;
      }
      setSelectedSet({ exerciseIndex, setIndex });
      openSetForm({
        weight: existing.weight ? displayWeight : "",
        reps: existing.reps?.toString() || "",
        note: existing.note || "",
        isWarmup: existing.isWarmup || false,
        rir: existing.rir ?? null,
      });
      setShowSetModal(true);
    },
    [unitFor, actAs, openSetForm, hasActiveSession, showSetSummary],
  );

  const handleDeleteSelectedSet = useCallback(() => {
    if (!selectedSet) return;
    const { exerciseIndex, setIndex } = selectedSet;
    const existing = getSetDetails(
      currentDay,
      exerciseIndex,
      setIndex,
    ) as SetDetail | null;
    if (!existing) return;
    const unit = unitFor(exerciseIndex);
    const displayWeight = existing.weight
      ? kgToDisplay(existing.weight, unit)
      : "0";
    alert(
      "Delete this set?",
      `${displayWeight} ${unit} × ${existing.reps || 0} will be removed.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const deleted = await deleteSetDetails(
              currentDay,
              exerciseIndex,
              setIndex,
            );
            if (!deleted) {
              alert(
                "Not Deleted",
                "The set could not be removed. Please try again.",
                [{ text: "OK" }],
                "error",
              );
              return;
            }
            if (isMountedRef.current) {
              setShowSetModal(false);
              setSelectedSet(null);
              setQuickAdded(null);
              setDeletedSet({
                day: currentDay,
                exerciseIndex,
                setIndex,
                detail: existing,
                sessionStartedAt: workoutStartTime,
              });
            }
          },
        },
      ],
      "warning",
    );
  }, [
    selectedSet,
    getSetDetails,
    currentDay,
    unitFor,
    alert,
    deleteSetDetails,
    workoutStartTime,
  ]);

  const [deletedSet, setDeletedSet] = useState<{
    day: number;
    exerciseIndex: number;
    setIndex: number;
    detail: SetDetail;
    sessionStartedAt: string | null;
  } | null>(null);
  const clearDeletedSet = useCallback(() => setDeletedSet(null), []);
  const undoDeleteSet = useCallback(() => {
    if (!deletedSet) return;
    setDeletedSet(null);
    const { day, exerciseIndex, setIndex, detail, sessionStartedAt } = deletedSet;
    const exercise = dayWorkout?.exercises?.[exerciseIndex];
    const slotStillFree =
      day === currentDay &&
      hasActiveSession() &&
      workoutStartTime === sessionStartedAt &&
      (exercise?.sets ?? 0) > setIndex &&
      !getSetDetails(day, exerciseIndex, setIndex);
    if (!slotStillFree) {
      showToast("The workout changed since, so the set was not put back");
      return;
    }
    void saveSetDetailsCtx(day, exerciseIndex, setIndex, detail.weight, detail.reps, {
      note: detail.note,
      isWarmup: detail.isWarmup,
      rir: detail.rir,
      restoring: detail,
    }).catch(() =>
      alert("Not Restored", "The set could not be put back. Log it again.", [{ text: "OK" }], "error"),
    );
  }, [
    deletedSet,
    saveSetDetailsCtx,
    alert,
    dayWorkout,
    currentDay,
    hasActiveSession,
    workoutStartTime,
    getSetDetails,
  ]);

  const handleSetPress = useCallback(
    (exerciseIndex: number, setIndex: number) => {
      const existing = getSetDetails(
        currentDay,
        exerciseIndex,
        setIndex,
      ) as SetDetail | null;
      if (isCurrentDayLocked) {
        if (existing) showSetSummary(exerciseIndex, existing);
        else warnDayLocked("This day has been completed and locked.");
        return;
      }
      if (existing) {
        openCompletedSet(exerciseIndex, setIndex, existing);
      } else {
        openSetModalForNewEntry(exerciseIndex, setIndex);
      }
    },
    [
      isCurrentDayLocked,
      warnDayLocked,
      getSetDetails,
      currentDay,
      openCompletedSet,
      openSetModalForNewEntry,
      showSetSummary,
    ],
  );

  // performanceHistory only covers sessions before today, so beating its best
  // estimated 1RM is a real PR rather than a re-celebration of this session.
  // performanceHistory is not refetched after a save, so without a per-session
  // record of what has already been beaten every heavier set in the same
  // exercise (and every re-save of the same set) celebrates again.
  const celebratedBestRef = useRef<Record<string, number>>({});
  const celebrateIfPersonalRecord = useCallback(
    async (weightInKg: number, reps: number, isWarmup: boolean): Promise<void> => {
      const best = performanceHistory?.best;
      // Without the stored sessions the only baseline is this week's local
      // log, which would celebrate lifts that are nowhere near a real PR.
      if (isWarmup || !best || !historyCompleteRef.current) return;
      const exerciseName =
        (dayWorkout?.exercises ?? [])[selectedSet?.exerciseIndex ?? -1]?.name ??
        "this exercise";
      // The logged weight is assistance, which Epley would read as load.
      if (isAssistedExercise(exerciseName)) return;
      // Epley has no answer without load, so a bodyweight movement is judged
      // on reps instead. Otherwise it can never register a PR at all.
      const bodyweight = weightInKg <= 0;
      const current = bodyweight ? reps : estimateOneRepMax(weightInKg, reps);
      const bodyweightBest = best.weight <= 0 ? best.reps : 0;
      const previousBest = Math.max(
        bodyweight ? bodyweightBest : best.oneRepMax,
        celebratedBestRef.current[exerciseName] ?? 0,
      );
      if (previousBest <= 0 || !beatsBest(current, previousBest)) return;
      if (!(await isPrefEnabled(STORAGE_KEYS.PR_CELEBRATION))) return;
      celebratedBestRef.current[exerciseName] = current;
      metric.count("workout.pr", 1, { attributes: { bodyweight } });
      if (!isMountedRef.current) return;
      setPrCelebration({
        exerciseName,
        detail: bodyweight
          ? `${reps} reps`
          : `Est. 1RM ${kgToDisplay(current, selectedUnit)}${selectedUnit}`,
      });
    },
    [
      performanceHistory,
      isPrefEnabled,
      dayWorkout,
      selectedSet,
      selectedUnit,
    ],
  );

  // These submit handlers close their own modal, but a fast double-tap fires
  // both presses before the close re-renders and adds the set/exercise twice.
  const lastSubmitRef = useRef(new Map<string, number>());
  const once = useCallback(
    (key: string, fn: () => void) => () => {
      const now = Date.now();
      if (now - (lastSubmitRef.current.get(key) ?? 0) < 600) return;
      lastSubmitRef.current.set(key, now);
      fn();
    },
    [],
  );

  const isSavingSetRef = useRef(false);
  const [isSavingSet, setIsSavingSet] = useState(false);
  const handleSaveSetDetails = useCallback(async (draft: SetDraft) => {
    if (!selectedSet || isSavingSetRef.current) return;
    const { weight, reps } = draft;

    // Bodyweight movements legitimately have no added load, so only reps
    // are required.
    const weightInKg = displayToKg(weight, selectedUnit);
    const r = parseReps(reps);

    if (r === null) {
      alert(
        "Invalid Set",
        `Enter a whole rep count between 1 and ${MAX_REPS}.`,
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    // An empty field otherwise stores 0 kg, which the UI renders as a
    // deliberate bodyweight set and nothing can tell apart from a typo.
    if (weight.trim() === "") {
      alert(
        "Weight missing",
        "Enter a weight, or 0 for a bodyweight set.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    const invalidWeight = validateWeightInput(weight, selectedUnit);
    if (invalidWeight) {
      alert("Check the weight", invalidWeight, [{ text: "OK" }], "error");
      return;
    }

    isSavingSetRef.current = true;
    setIsSavingSet(true);
    try {
      // Always stored in kg, since the server only ever receives kg.
      const saved = await saveSetDetailsCtx(
        currentDay,
        selectedSet.exerciseIndex,
        selectedSet.setIndex,
        weightInKg,
        r,
        { note: draft.note.trim(), isWarmup: draft.isWarmup, rir: draft.rir ?? undefined },
      );
      // saveSetDetails has already told the user why the set wasn't kept.
      if (!saved) return;
      sessionHistoryCacheRef.current = null;

      void celebrateIfPersonalRecord(weightInKg, r, draft.isWarmup);

      if (isInJointSession) {
        // The set is already saved, so a partner update failing must not
        // report it as unsaved.
        void Promise.resolve(
          pushJointProgress?.({
            exerciseIndex: selectedSet.exerciseIndex,
            setIndex: selectedSet.setIndex,
            exerciseName:
              (dayWorkout?.exercises ?? [])[selectedSet.exerciseIndex]?.name ??
              "Exercise",
            readyForNext: false,
          }),
        ).catch((error: unknown) =>
          captureException(error, { stage: "pushJointProgress" }),
        );
      }
    } catch (error) {
      console.error("Failed to save set:", error);
      metric.count("workout.set_save_failed");
      captureException(error, { stage: "saveSet" });
      alert(
        "Set Not Saved",
        "Something went wrong saving this set. Your entry is still here. Tap Save to try again.",
        [{ text: "OK" }],
        "error",
      );
      return;
    } finally {
      isSavingSetRef.current = false;
      if (isMountedRef.current) setIsSavingSet(false);
    }

    if (isMountedRef.current) {
      setShowSetModal(false);
      setSelectedSet(null);
      setProgression(null);
      setPerformanceHistory(null);
    }
  }, [
    selectedSet,
    celebrateIfPersonalRecord,
    currentDay,
    saveSetDetailsCtx,
    isInJointSession,
    dayWorkout,
    pushJointProgress,
    alert,
    selectedUnit,
  ]);

  const handleOpenRestReminderModal = useCallback(() => {
    // Suggest the rest this user actually takes on the exercise they just did,
    // so the reminder is per-exercise without asking them to configure one each.
    const lastExercise = getLastSetExercise(currentDay);
    const suggested = lastExercise
      ? getExerciseRestTime(currentDay, lastExercise.index)
      : null;
    setTempRestReminderSeconds(String(restReminderSeconds || suggested || 60));
    setTempRestReminderAlarm(restReminderAlarm);
    setShowRestReminderModal(true);
  }, [getLastSetExercise, getExerciseRestTime, currentDay, restReminderSeconds, restReminderAlarm]);

  const parsedRestInput = parseRestDuration(tempRestReminderSeconds);
  const handleSaveRestReminder = async (overrideSeconds?: number) => {
    if (
      overrideSeconds === undefined &&
      tempRestReminderSeconds.trim() !== "" &&
      parsedRestInput === null
    )
      return;
    const raw = overrideSeconds ?? parsedRestInput ?? 0;
    const secs = Math.min(
      Math.max(0, Number(raw) || 0),
      MAX_REST_REMINDER_SECONDS,
    );
    setRestReminderSeconds(secs);
    setRestReminderEnabled(secs > 0);
    setRestReminderAlarm(tempRestReminderAlarm);
    try {
      await saveToStorage(
        STORAGE_KEYS.REST_REMINDER_SECONDS,
        secs,
        user?.id ?? null,
      );
      await saveToStorage(
        STORAGE_KEYS.REST_REMINDER_ALARM,
        tempRestReminderAlarm,
        user?.id ?? null,
      );
    } catch (err) {
      console.warn("Failed to save rest reminder setting:", err);
      metric.count("workout.rest_reminder_save_failed");
      log.warn("workout.rest_reminder_save_failed");
    }
    setShowRestReminderModal(false);
    if (secs > 0 && !tempRestReminderAlarm) {
      void promptForExactAlarms(alert, "rest reminders");
    }
    showToast(
      secs > 0
        ? `Rest reminder set to ${formatDuration(secs)}`
        : "Rest reminder turned off",
    );
  };

  const handleEditExerciseName = useCallback(
    (exerciseIndex: number) => {
      if (isCurrentDayLocked) {
        warnDayLocked("Cannot edit exercises on a locked day.");
        return;
      }
      const exercise = (dayWorkout?.exercises ?? [])[exerciseIndex];
      if (!exercise) return;
      setEditingExercise({ index: exerciseIndex, exercise });
      setNewExerciseName(exercise.name);
      setNewPrimaryMuscles((exercise.primaryMuscles ?? []).join(", "));
      setNewSecondaryMuscles((exercise.secondaryMuscles ?? []).join(", "));
      setShowEditNameModal(true);
    },
    [isCurrentDayLocked, dayWorkout, warnDayLocked],
  );

  const handleOpenMachines = useCallback(
    (exerciseIndex: number) => {
      if (isCurrentDayLocked) {
        warnDayLocked("Cannot switch machines on a locked day.");
        return;
      }
      setMachinesFor(exerciseIndex);
    },
    [isCurrentDayLocked, warnDayLocked],
  );

  const machineExercise = exerciseAt(dayWorkout, machinesFor);

  const patchMachines = (index: number | null, patch: MachinePatch) => {
    if (index === null || !selectedSplit) return;
    reportRefused(updateExerciseMachines(currentDay, selectedSplit, index, patch));
  };

  const handleSelectMachine = (name: string) => {
    patchMachines(machinesFor, { selectedMachine: name });
    setMachinesFor(null);
  };

  const handleRemoveMachine = (name: string) => {
    if (machinesFor === null) return;
    const index = machinesFor;
    const remaining = (machineExercise?.machines ?? []).filter(
      (v: string) => v !== name,
    );
    const clearsAField =
      remaining.length === 0 &&
      (machineExercise?.selectedMachine === name ||
        machineExercise?.defaultMachine === name);
    // Clearing a machine field is a destructive edit the server refuses from a trainer.
    if (actAs && clearsAField) {
      alert(
        "Can't Remove Machine",
        `"${name}" is ${actAs.username}'s only machine for this exercise. Only ${actAs.username} can remove it.`,
        [{ text: "OK" }],
        "info",
      );
      return;
    }
    alert(
      "Remove machine?",
      `"${name}" will no longer be listed. Sets you already logged under it are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            const patch: MachinePatch = {
              machines: remaining,
              machineMeta: editMachineMeta(
                machineExercise?.machineMeta,
                name,
                name,
                {},
              ),
            };
            // null, not undefined: JSON.stringify drops an undefined key, so
            // the server would keep the machine that was just removed.
            if (machineExercise?.selectedMachine === name) {
              patch.selectedMachine = remaining[0] ?? null;
            }
            if (machineExercise?.defaultMachine === name) {
              patch.defaultMachine = remaining[0] ?? null;
            }
            patchMachines(index, patch);
          },
        },
      ],
      "warning",
    );
  };

  const handleOpenExerciseSettings = useCallback(
    (exerciseIndex: number) => {
      if (isCurrentDayLocked) {
        warnDayLocked("Cannot change exercise settings on a locked day.");
        return;
      }
      setSettingsFor(exerciseIndex);
    },
    [isCurrentDayLocked, warnDayLocked],
  );

  const settingsExercise = exerciseAt(dayWorkout, settingsFor);

  const handleSetDefaultMachine = (name: string) => {
    patchMachines(settingsFor, {
      defaultMachine: name,
      selectedMachine: settingsExercise?.selectedMachine ?? name,
    });
  };

  const handleAddMachine = () => {
    const trimmed = newMachineName.trim();
    if (settingsFor === null || !trimmed) return;
    const existing = settingsExercise?.machines ?? [];
    patchMachines(settingsFor, {
      machines: [...new Set([...existing, trimmed])],
      selectedMachine: settingsExercise?.selectedMachine ?? trimmed,
      defaultMachine: settingsExercise?.defaultMachine ?? trimmed,
    });
    setNewMachineName("");
  };

  const handleSaveMachineEdit = () => {
    if (settingsFor === null || !editMachine) return;
    const name = editMachine.name.trim() || editMachine.key;
    const swap = (v?: string) => (v === editMachine.key ? name : v);
    const note = editMachine.note.trim();
    const pin = Number.parseInt(editMachine.pin, 10);
    const entry: MachineMeta = {};
    if (note) entry.note = note;
    if (Number.isFinite(pin)) entry.pin = pin;
    const meta = editMachineMeta(
      settingsExercise?.machineMeta,
      editMachine.key,
      name,
      entry,
    );
    patchMachines(settingsFor, {
      machines: [
        ...new Set(
          (settingsExercise?.machines ?? []).map((v: string) => swap(v) as string),
        ),
      ],
      selectedMachine: swap(settingsExercise?.selectedMachine),
      defaultMachine: swap(settingsExercise?.defaultMachine),
      machineMeta: meta,
    });
    setEditMachine(null);
  };

  const handleToggleBestAcrossMachines = () => {
    patchMachines(settingsFor, {
      bestAcrossMachines: !settingsExercise?.bestAcrossMachines,
    });
  };

  const closeEditModal = () => {
    setShowEditNameModal(false);
    setEditingExercise(null);
    setNewExerciseName("");
    setNewPrimaryMuscles("");
    setNewSecondaryMuscles("");
    setShowAdvancedEdit(false);
    setBrowseMuscle(null);
  };

  const applyExerciseNameEdit = (
    finalName: string,
    primaryMuscles: string[],
    secondaryMuscles: string[],
  ) => {
    reportRefused(
      updateExerciseName(
        currentDay,
        selectedSplit!,
        editingExercise!.index,
        finalName,
        primaryMuscles,
        secondaryMuscles,
      ),
    );
    closeEditModal();
  };

  const handlePickEditSuggestion = (name: string) => {
    setNewExerciseName(name);
    setBrowseMuscle(null);
  };

  const resolveExerciseNameTypo = (
    trimmed: string,
    buildPrompt: (suggestion: string) => string,
    apply: (finalName: string) => void,
  ) => {
    const tc = checkForTypo(trimmed, allExerciseNames);

    if (tc.exactMatch) {
      apply(tc.exactMatch);
      if (tc.exactMatch !== trimmed) showToast(`Matched to "${tc.exactMatch}"`);
      return;
    }

    if (tc.isLikelyTypo && tc.suggestions.length > 0) {
      const top = tc.suggestions[0];
      alert(
        "Did you mean?",
        buildPrompt(top.name),
        [
          {
            text: "Use Original",
            style: "cancel",
            onPress: () => apply(trimmed),
          },
          {
            text: `Use "${top.name}"`,
            onPress: () => apply(top.name),
          },
        ],
        "warning",
      );
      return;
    }

    apply(trimmed);
  };

  const handleSaveExerciseName = () => {
    if (!editingExercise || !newExerciseName.trim()) {
      alert(
        "Name needed",
        "Enter a name for the exercise.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    const trimmed = newExerciseName.trim();
    const primaryMuscles = parseMuscleList(newPrimaryMuscles);
    const secondaryMuscles = parseMuscleList(newSecondaryMuscles);
    resolveExerciseNameTypo(
      trimmed,
      (suggestion) =>
        `"${trimmed}" is similar to "${suggestion}". Use that instead?`,
      (finalName) =>
        applyExerciseNameEdit(finalName, primaryMuscles, secondaryMuscles),
    );
  };

  const handleQuickAddSet = useCallback(
    (exerciseIndex: number) => {
      if (isCurrentDayLocked) {
        warnDayLocked("Cannot add sets to a locked day.");
        return;
      }
      const exercise = dayWorkout?.exercises?.[exerciseIndex];
      reportRefused(addExtraSetsToExercise(currentDay, selectedSplit!, exerciseIndex, 1));
      // The server refuses destructive program edits from a trainer, so an
      // undo would fail for them.
      if (actAs || !exercise) {
        showToast("Set added. Long-press ＋ to add or remove several");
        return;
      }
      // Both undo bars sit in the same spot, so only the latest one is offered.
      setDeletedSet(null);
      setQuickAdded({
        day: currentDay,
        exerciseIndex,
        setIndex: exercise.sets ?? 0,
        name: exercise.name,
      });
    },
    [
      isCurrentDayLocked,
      warnDayLocked,
      addExtraSetsToExercise,
      currentDay,
      selectedSplit,
      dayWorkout,
      actAs,
      reportRefused,
    ],
  );

  const [quickAdded, setQuickAdded] = useState<{
    day: number;
    exerciseIndex: number;
    setIndex: number;
    name: string;
  } | null>(null);
  const clearQuickAdded = useCallback(() => setQuickAdded(null), []);
  const undoQuickAdd = useCallback(() => {
    if (!quickAdded) return;
    setQuickAdded(null);
    const { day, exerciseIndex, setIndex } = quickAdded;
    const exercise = dayWorkout?.exercises?.[exerciseIndex];
    const stillLast = day === currentDay && exercise?.sets === setIndex + 1;
    if (!stillLast || getSetDetails(day, exerciseIndex, setIndex)) {
      showToast("That set was already logged, so it was kept");
      return;
    }
    reportRefused(addExtraSetsToExercise(day, selectedSplit!, exerciseIndex, -1));
  }, [
    quickAdded,
    dayWorkout,
    currentDay,
    getSetDetails,
    addExtraSetsToExercise,
    selectedSplit,
    reportRefused,
  ]);

  const handleAddMultipleSets = useCallback(
    (exerciseIndex: number) => {
      if (isCurrentDayLocked) {
        warnDayLocked("Cannot add sets to a locked day.");
        return;
      }
      const exercise = (dayWorkout?.exercises ?? [])[exerciseIndex];
      if (!exercise) return;
      setAddingSetsExercise({ index: exerciseIndex, exercise });
      setAdditionalSets("");
      setShowAddSetsModal(true);
    },
    [isCurrentDayLocked, dayWorkout, warnDayLocked],
  );

  const onlyOneSet = (addingSetsExercise?.exercise.sets ?? 1) <= 1;
  const handleRemoveOneSet = () => {
    // The server refuses every destructive program edit from a trainer.
    if (!addingSetsExercise || actAs) return;
    if (onlyOneSet) return;
    const { index, exercise } = addingSetsExercise;
    const removedSetIndex = (exercise.sets ?? 1) - 1;
    const isLogged =
      completedDays?.[currentDay]?.[index]?.[removedSetIndex] !== undefined;

    const removeSet = async () => {
      // Drop the logged data with the row, or it stays counted in
      // getCompletedSetsCount with no way for the user to reach it.
      if (isLogged) await deleteSetDetails(currentDay, index, removedSetIndex);
      await addExtraSetsToExercise(currentDay, selectedSplit!, index, -1);
    };

    alert(
      isLogged ? "Remove Logged Set?" : "Remove Set?",
      isLogged
        ? `Set ${removedSetIndex + 1} of ${exercise.name} has already been logged. Removing it deletes what you logged.`
        : `Set ${removedSetIndex + 1} of ${exercise.name} will be removed from your program.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            setShowAddSetsModal(false);
            setAddingSetsExercise(null);
            setAdditionalSets("");
            reportRefused(removeSet());
          },
        },
      ],
      "warning",
    );
  };

  const handleSaveAdditionalSets = () => {
    if (!addingSetsExercise) return;
    const sets = Number.parseInt(additionalSets, 10);
    if (Number.isNaN(sets) || sets < 1 || sets > MAX_ADDITIONAL_SETS) {
      alert(
        "Check the number of sets",
        `Enter a number of sets from 1 to ${MAX_ADDITIONAL_SETS}.`,
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    reportRefused(
      addExtraSetsToExercise(
        currentDay,
        selectedSplit!,
        addingSetsExercise.index,
        sets,
      ),
    );
    setShowAddSetsModal(false);
    setAddingSetsExercise(null);
    setAdditionalSets("");
  };

  const handleAddNewExercise = () => {
    if (isCurrentDayLocked) {
      warnDayLocked("Cannot add exercises to a locked day.");
      return;
    }
    setNewExercise({
      name: "",
      primaryMuscles: "",
      secondaryMuscles: "",
      sets: "",
      reps: "",
    });
    setShowAddExerciseModal(true);
  };

  const handlePickUndertrainedSuggestion = (name: string) => {
    if (isCurrentDayLocked) {
      warnDayLocked("Cannot add exercises to a locked day.");
      return;
    }
    if (!topUndertrainedGroup) return;
    setNewExercise({
      name,
      primaryMuscles: topUndertrainedGroup.primaryMuscle,
      secondaryMuscles: "",
      sets: "",
      reps: "",
    });
    setShowAddExerciseModal(true);
  };

  const closeAddExerciseModal = () => {
    setShowAddExerciseModal(false);
    setNewExercise({
      name: "",
      primaryMuscles: "",
      secondaryMuscles: "",
      sets: "",
      reps: "",
    });
    setNewExerciseSuggestions([]);
    setShowAdvancedEdit(false);
    setBrowseMuscle(null);
  };

  const handlePickNewExerciseName = (name: string) => {
    setNewExercise((prev) => ({ ...prev, name, exerciseId: undefined }));
    setBrowseMuscle(null);
  };

  const applyNewExercise = (
    finalName: string,
    primaryMuscles: string[],
    secondaryMuscles: string[],
    setsNum: number,
  ) => {
    reportRefused(
      addNewExercise(currentDay, selectedSplit!, {
        name: finalName,
        // The typo check can substitute a plan-local name for the one the user
        // picked, which would leave the id pointing at a different exercise.
        exerciseId:
          finalName === newExercise.name.trim()
            ? newExercise.exerciseId
            : undefined,
        primaryMuscles,
        secondaryMuscles,
        sets: setsNum,
        reps: newExercise.reps.trim() || undefined,
      }),
    );
    closeAddExerciseModal();
  };

  const handleSaveNewExercise = () => {
    const { name, primaryMuscles, secondaryMuscles, sets } = newExercise;
    if (!name.trim()) {
      alert("Name needed", "Enter a name for the exercise.", [{ text: "OK" }], "error");
      return;
    }
    const setsNum = Number.parseInt(sets, 10);
    if (Number.isNaN(setsNum) || setsNum < 1) {
      alert(
        "Check the number of sets",
        "Enter at least 1 set.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    const trimmed = name.trim();
    const trimmedPrimary = parseMuscleList(primaryMuscles);
    const trimmedSecondary = parseMuscleList(secondaryMuscles);
    resolveExerciseNameTypo(
      trimmed,
      (suggestion) => `"${trimmed}" is similar to "${suggestion}".`,
      (finalName) =>
        applyNewExercise(finalName, trimmedPrimary, trimmedSecondary, setsNum),
    );
  };

  const handleDbSuggestionPress = (suggestion: ExerciseSuggestion) => {
    setNewExercise({
      ...newExercise,
      name: suggestion.label,
      exerciseId: suggestion.id,
    });
    setNewExerciseSuggestions([]);
  };

  const isCustomDay = currentDay === CUSTOM_DAY;
  const getCompleteWorkoutMessage = (done: number, total: number): string => {
    const lock = isCustomDay
      ? "It is saved to your history only, not to your plan."
      : "The day will be locked and view-only.";
    const joint = isInJointSession
      ? ` You'll also leave the joint session with ${partnerUsername}.`
      : "";
    if (done >= total) return `All ${total} sets are logged. ${lock}${joint}`;
    const missing = total - done;
    return `${missing} of ${total} sets ${missing === 1 ? "isn't" : "aren't"} logged. ${lock}${joint}`;
  };

  const confirmCompleteWorkout = async () => {
    if (isInJointSession) await leaveJointSession?.();
    const ended = await endWorkout();
    if (ended)
      alert(
        "Workout Finished!",
        isCustomDay ? "Saved to your history." : `Day ${currentDay} is now locked.`,
        [{ text: "OK" }],
        "success",
      );
  };

  const stopTrainer = () => {
    if (!activeTrainer) return;
    const trainer = activeTrainer;
    alert(
      `Stop ${trainer}?`,
      `${trainer} will no longer be able to log workouts for you. You can allow it again from Friends.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Stop",
          style: "destructive",
          onPress: async () => {
            try {
              const grants = await sharingApi.getGrantedPermissions();
              await Promise.all(
                grants
                  .filter(
                    (g) =>
                      g.permissionType === "trainer" && g.toUsername === trainer,
                  )
                  .map((g) => sharingApi.revokePermission(g.id)),
              );
              if (isMountedRef.current) setRevokedTrainer(trainer);
            } catch (error) {
              captureException(error, { stage: "revokeTrainer" });
              alert(
                "Couldn't stop the trainer",
                "Check your connection and try again.",
                [{ text: "OK" }],
                "error",
              );
            }
          },
        },
      ],
      "warning",
    );
  };

  const confirmRestartDay = () =>
    alert(
      actAs
        ? `Start Day ${currentDay} again for ${actAs.username}?`
        : `Start Day ${currentDay} again?`,
      "The day reopens empty for a new session. The sets already logged stay in history.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start again", onPress: () => void resetDay(currentDay) },
      ],
      "warning",
    );

  const handleLeaveJointSession = () =>
    alert(
      "Leave joint session?",
      `You'll stop sharing this workout with ${partnerUsername}. Your logged sets are kept.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Leave", onPress: () => void leaveJointSession?.() },
      ],
      "session",
    );

  const handleCompleteWorkout = () => {
    if (isCurrentDayLocked) {
      alert(
        "Day Already Locked",
        "This day has already been completed.",
        [{ text: "OK" }],
        "lock",
      );
      return;
    }
    const done = getCompletedSetsCount();
    const total = dayWorkout?.totalSets || 0;
    alert(
      isCustomDay ? "Finish workout?" : `Finish Day ${currentDay}?`,
      getCompleteWorkoutMessage(done, total),
      [
        { text: "Keep logging", style: "cancel" },
        {
          text: isCustomDay ? "Finish" : "Finish & lock",
          onPress: confirmCompleteWorkout,
        },
      ],
      "session",
    );
  };

  const getCompletedSetsCount = useCallback((): number => {
    if (!dayWorkout) return 0;
    return dayWorkout.exercises.reduce(
      (n: number, _: Exercise, i: number) =>
        n + (getExerciseCompletedSets(currentDay, i) as number),
      0,
    );
  }, [dayWorkout, getExerciseCompletedSets, currentDay]);

  const partnerNameSet = useMemo(() => {
    const partnerExerciseNames = partner?.exerciseNames;
    if (!isInJointSession || !partnerExerciseNames?.length) {
      return new Set<string>();
    }
    const partnerSet = new Set<string>(
      partnerExerciseNames.map((e) =>
        normalizeExerciseName(typeof e === "string" ? e : e.name),
      ),
    );
    const myExerciseNames = (dayWorkout?.exercises ?? [])
      .map((ex) => (ex.name ? normalizeExerciseName(ex.name) : undefined))
      .filter(Boolean) as string[];
    return new Set<string>(myExerciseNames.filter((n) => partnerSet.has(n)));
  }, [isInJointSession, partner, dayWorkout]);

  if (isLoading && !workoutData)
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {header}
        <View style={styles.emptyContainer}>
          <ActivityIndicator
            size='large'
            color={colors.accent}
            accessibilityLabel='Loading your workout'
          />
        </View>
      </SafeAreaView>
    );

  const emptyState = getEmptyStateInfo(
    workoutData,
    selectedSplit,
    dayWorkout,
    currentDay,
    actAs?.username,
  );
  if (emptyState)
    return (
      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {header}
        <EmptyState
          icon={emptyState.icon}
          title={emptyState.title}
          text={emptyState.text}
          style={styles.emptyContainer}
        >
          {emptyState.actionTab && emptyState.actionLabel && (
            <Button
              label={emptyState.actionLabel}
              onPress={() => navigation.navigate(emptyState.actionTab!)}
            />
          )}
          {!workoutStartTime && !actAs && (
            <Button label='Start empty workout' onPress={startEmptyWorkout} />
          )}
        </EmptyState>
      </SafeAreaView>
    );

  // One tint for the whole fused day-status group: accent while active,
  // success once complete, muted once locked.
  const allSetsComplete = areAllSetsComplete && !isCurrentDayLocked;
  const dayOverviewTint = getDayOverviewTint(
    colors,
    isCurrentDayLocked,
    allSetsComplete,
  );
  const widgetHeaderTextColor = getDayOverviewTextColor(colors);

  // Each margin edge is set individually because in React Native's layout
  // engine a later style's specific edge overrides an earlier style's `margin`
  // shorthand, so `{ margin: 0 }` would not clear styles.widget's marginBottom.
  const getWidgetCardStyleOverride = (
    instance: WidgetInstance<WorkoutWidgetType>,
  ): object | undefined => {
    if (widgetBoard.editMode) return undefined;
    const base = {
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      borderWidth: 0,
      shadowOpacity: 0,
      elevation: 0,
      borderRadius: 0,
    };
    switch (instance.type) {
      case "day_number":
        return {
          ...base,
          width: "50%",
          borderTopLeftRadius: WIDGET_GROUP_RADIUS,
        };
      case "total_sets":
        return {
          ...base,
          width: "50%",
          borderTopRightRadius: WIDGET_GROUP_RADIUS,
        };
      case "progress":
        return base;
      case "session_stats":
        return {
          ...base,
          // separates the fused group from the exercise list below
          marginBottom: 12,
          borderBottomLeftRadius: WIDGET_GROUP_RADIUS,
          borderBottomRightRadius: WIDGET_GROUP_RADIUS,
        };
      default:
        return undefined;
    }
  };

  const completedSetsCount = getCompletedSetsCount();
  const totalSetsCount = dayWorkout?.totalSets ?? 0;
  const progressPercentage = computeProgressPercentage(
    completedSetsCount,
    totalSetsCount,
  );
  const estimatedRemaining = untimedSession
    ? null
    : getEstimatedTimeRemaining(currentDay);
  const estimatedEnd = untimedSession ? null : getEstimatedEndTime(currentDay);

  const partnerParticipant = isInJointSession ? partner : null;

  priorityTargetRef.current = stickyTarget(
    priorityTargetRef.current,
    currentDay,
    showUndertrainedPerExercise ? topUndertrainedGroup?.primaryMuscle : undefined,
  );
  const priorityMuscleTarget = priorityTargetRef.current.target;
  const orderedExercises = orderByPriority(
    dayWorkout?.exercises ?? [],
    priorityMuscleTarget,
  );

  const renderWidgetContent = (
    instance: WidgetInstance<WorkoutWidgetType>,
  ): React.ReactNode => {
    switch (instance.type) {
      case "day_number":
        return (
          <View style={styles.dayNumberWidgetInner}>
            <Text style={styles.dayNumberValue}>
              {dayWorkout?.dayNumber === CUSTOM_DAY ? "Free" : dayWorkout?.dayNumber}
            </Text>
            {isCurrentDayLocked && (
              <View style={styles.dayNumberLockedTag}>
                <Text style={styles.dayNumberLockedText}>Locked</Text>
              </View>
            )}
          </View>
        );

      case "total_sets":
        return (
          <View style={styles.totalSetsWidgetInner}>
            <Text style={styles.setsValue}>{dayWorkout?.totalSets}</Text>
          </View>
        );

      case "progress":
        return (
          <View style={styles.headerCardInner}>
            <View
              style={styles.progressContainer}
              accessible={true}
              accessibilityLiveRegion='polite'
              accessibilityLabel={`${completedSetsCount} of ${totalSetsCount} sets completed`}
            >
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercentage}%` },
                  ]}
                />
              </View>
              <View style={styles.progressTextRow}>
                <Text style={styles.progressText}>
                  {completedSetsCount} / {totalSetsCount} sets completed
                </Text>
                {workoutStartTime &&
                  estimatedRemaining != null &&
                  estimatedRemaining > 0 &&
                  !isCurrentDayLocked && (
                    <Text style={styles.progressText}>
                      ~{formatDuration(estimatedRemaining)} left
                    </Text>
                  )}
              </View>
              {workoutStartTime &&
                estimatedEnd &&
                estimatedRemaining != null &&
                estimatedRemaining > 0 &&
                !isCurrentDayLocked && (
                  <Text style={styles.endTimeText}>
                    Estimated finish: {toTimeString(estimatedEnd)}
                  </Text>
                )}
            </View>
            {(allSetsComplete || isCurrentDayLocked) && (
              <View style={styles.completeMessage}>
                <Text style={styles.completeMessageText}>
                  {isCurrentDayLocked
                    ? `Locked · ${completedSetsCount} of ${totalSetsCount} sets`
                    : "🎉 All sets complete! Great job!"}
                </Text>
              </View>
            )}
          </View>
        );

      case "session_stats":
        if (untimedSession) {
          return (
            <Text style={styles.widgetLineMuted}>
              Logging a past workout. Timings aren't recorded.
            </Text>
          );
        }
        return (
          <SessionStatsWidget
            workoutStartTime={workoutStartTime}
            isCurrentDayLocked={isCurrentDayLocked}
            currentDay={currentDay}
            restReminderEnabled={restReminderEnabled}
            restReminderSeconds={restReminderSeconds}
            onOpenReminderModal={handleOpenRestReminderModal}
            paused={!visible}
            styles={styles}
          />
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView
      style={{ flex: 1 }}
      edges={["top"]}
      {...widgetBoard.panHandlers}
    >
      {header}
      <View style={styles.container}>
        {widgetBoard.isPulling && (
          <WidgetPullHint armed={widgetBoard.pullArmed} />
        )}

        {activeTrainer && activeTrainer !== revokedTrainer && (
          <TrainerBanner trainerUsername={activeTrainer} onStop={stopTrainer} />
        )}
        {joint && joint.watchers.length > 0 && (
          <WatchersBanner watchers={joint.watchers} onBlock={joint.blockWatcher} />
        )}

        {isInJointSession && (
          <PartnerBanner
            partnerProgress={partnerProgress}
            isPartnerReady={isPartnerReady}
            syncPulse={syncPulse}
            partnerUsername={partnerUsername}
            partnerUserId={partner?.userId}
            onLeave={handleLeaveJointSession}
          />
        )}

        {dayLockedByPlan && (
          <View style={styles.lockedBanner}>
            <View style={styles.lockedBannerTextContainer}>
              <Text style={styles.lockedBannerTitle}>
                {actAs ? "Day already completed" : "Day Completed & Locked"}
              </Text>
              <Text style={styles.lockedBannerText}>
                {actAs
                  ? `${actAs.username} already finished this day this week. Start it again to run it as a new session.`
                  : "This workout is view-only. Start it again to log it as a new session."}
              </Text>
            </View>
            {!workoutStartTime && (
              <TouchableOpacity
                style={styles.restartDayButton}
                onPress={confirmRestartDay}
                accessibilityRole="button"
                accessibilityLabel={
                  actAs ? `Start this day again for ${actAs.username}` : "Start this day again"
                }
              >
                <Text style={styles.restartDayText}>Start again</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <ScrollView
          style={styles.exerciseList}
          contentContainerStyle={styles.exerciseListContent}
          scrollEnabled={!widgetBoard.isPulling}
        >
          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditHeader
              editMode={widgetBoard.editMode}
              onDone={() => widgetBoard.setEditMode(false)}
            />
          )}
          <WidgetsPanel
            widgets={widgets}
            editMode={widgetBoard.editMode}
            onCycleSize={cycleWidgetSize}
            onRemove={removeWidget}
            onReorder={reorderWidgets}
            onCustomize={customizeWidget}
            renderContent={renderWidgetContent}
            registry={WORKOUT_WIDGET_REGISTRY}
            getCardBackgroundColor={() => dayOverviewTint}
            getHeaderTextColor={() => widgetHeaderTextColor}
            getCardStyleOverride={getWidgetCardStyleOverride}
            containerBackgroundColor={
              widgetBoard.editMode ? undefined : dayOverviewTint
            }
            containerBorderRadius={
              widgetBoard.editMode ? undefined : WIDGET_GROUP_RADIUS
            }
            footer={
              workoutStartTime &&
              !isCurrentDayLocked &&
              !widgetBoard.editMode ? (
                <View style={styles.completeWorkoutFooter}>
                  <TouchableOpacity
                    style={styles.completeWorkoutButton}
                    accessibilityRole='button'
                    accessibilityLabel='Finish workout'
                    ref={tutorialAnchor("workout.complete")}
                    onPress={handleCompleteWorkout}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={styles.completeWorkoutIcon}
                      importantForAccessibility='no'
                    >
                      💪
                    </Text>
                    <Text
                      style={[
                        styles.completeWorkoutButtonText,
                        { color: dayOverviewTint },
                      ]}
                    >
                      Finish workout
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />

          {showUndertrainedBanner &&
            topUndertrainedGroup &&
            undertrainedSuggestionCandidates.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <View style={styles.suggestionsHeader}>
                  <Text style={styles.suggestionsHeaderTitle}>
                    {`${topUndertrainedGroup.primaryMuscle} is behind this week. Try:`}
                  </Text>
                  <TouchableOpacity
                    style={styles.dismissButton}
                    onPress={() => setDismissedUndertrainedBanner(true)}
                    accessibilityRole='button'
                    accessibilityLabel='Dismiss suggestion'
                  >
                    <Text style={styles.dismissButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
                {undertrainedSuggestionCandidates.map((name) => (
                  <TouchableOpacity
                    key={name}
                    style={styles.suggestionButton}
                    accessibilityRole='button'
                    accessibilityLabel={`Add ${name}`}
                    onPress={() => handlePickUndertrainedSuggestion(name)}
                  >
                    <Text style={styles.suggestionText}>{name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

          {orderedExercises.map(({ exercise, originalIndex, isPriority }) => (
            <ExerciseCard
              key={`${originalIndex}-${exercise.name}`}
              exercise={exercise}
              exerciseIndex={originalIndex}
              priorityMuscle={
                isPriority ? topUndertrainedGroup?.primaryMuscle : undefined
              }
              currentDay={currentDay}
              isCurrentDayLocked={isCurrentDayLocked}
              colors={colors}
              styles={styles}
              weightUnit={unitFor(originalIndex)}
              isInJointSession={isInJointSession}
              partnerNameSet={partnerNameSet}
              partnerProgress={partnerProgress}
              partnerParticipant={partnerParticipant}
              partnerCompletedSets={partnerCompletedSets}
              partnerUsername={partnerUsername}
              getExerciseCompletedSets={getExerciseCompletedSets}
              isSetComplete={isSetComplete}
              getSetDetails={getSetDetails}
              isAssistedExercise={isAssistedExercise}
              onEditExerciseName={handleEditExerciseName}
              onOpenMachines={handleOpenMachines}
              onOpenExerciseSettings={handleOpenExerciseSettings}
              onSetPress={handleSetPress}
              onQuickAddSet={handleQuickAddSet}
              onAddMultipleSets={handleAddMultipleSets}
            />
          ))}

          {!isCurrentDayLocked && (
            <TouchableOpacity
              style={styles.addExerciseButton}
              ref={tutorialAnchor("workout.addExercise")}
              accessibilityRole='button'
              accessibilityLabel='Add exercise'
              onPress={handleAddNewExercise}
            >
              <Text style={styles.addExerciseButtonText}>+ Add exercise</Text>
            </TouchableOpacity>
          )}
          {!workoutStartTime && !actAs && (
            <TouchableOpacity
              style={styles.destructiveTextButton}
              accessibilityRole='button'
              accessibilityLabel='Start empty workout'
              onPress={startEmptyWorkout}
            >
              <Text style={styles.addExerciseButtonText}>Start empty workout</Text>
            </TouchableOpacity>
          )}

          {widgetsLoaded && widgets.length > 0 && (
            <WidgetEditButton onPress={widgetBoard.openGallery} />
          )}
        </ScrollView>

        {prCelebration && (
          <PrCelebration
            exerciseName={prCelebration.exerciseName}
            detail={prCelebration.detail}
            onDone={() => setPrCelebration(null)}
          />
        )}

        <ModalSheet
          visible={showSetModal}
          onClose={() => {
            setShowSetModal(false);
            setSelectedSet(null);
            setProgression(null);
            setPerformanceHistory(null);
          }}
          title={
            selectedSet
              ? `Set ${selectedSet.setIndex + 1} of ${dayWorkout?.exercises?.[selectedSet.exerciseIndex]?.sets ?? selectedSet.setIndex + 1}`
              : "Set Details"
          }
          subtitle={selectedExerciseName}
          showCancelButton={false}
          showConfirmButton={false}
          dirty={setFormDirty}
        >
          <SetDetailsForm
            key={setFormKey}
            styles={styles}
            colors={colors}
            initial={setDraft}
            weightUnit={selectedUnit}
            loadingHistory={loadingHistory}
            historyFailed={historyFailed}
            onRetryHistory={loadPerformanceHistory}
            performanceHistory={performanceHistory}
            progression={progression}
            onDismissProgression={dismissProgression}
            isAssisted={checkIsSelectedSetAssisted(selectedSet, dayWorkout)}
            isSaving={isSavingSet}
            onSave={handleSaveSetDetails}
            onSwitchUnit={switchSelectedUnit}
            onDelete={
              !actAs &&
              selectedSet &&
              getSetDetails(
                currentDay,
                selectedSet.exerciseIndex,
                selectedSet.setIndex,
              )
                ? handleDeleteSelectedSet
                : undefined
            }
            draftStartedRef={setDraftStartedRef}
            onDirtyChange={setSetFormDirty}
          />
        </ModalSheet>

        <ModalSheet
          visible={showEditNameModal}
          onClose={closeEditModal}
          title='Edit Exercise'
          scrollable={true}
          showCancelButton={false}
          showConfirmButton={false}
          dirty={
            !!editingExercise &&
            (newExerciseName !== editingExercise.exercise.name ||
              newPrimaryMuscles !==
                (editingExercise.exercise.primaryMuscles ?? []).join(", ") ||
              newSecondaryMuscles !==
                (editingExercise.exercise.secondaryMuscles ?? []).join(", "))
          }
        >
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Exercise Name</Text>
            <TextInput
              style={styles.input}
              value={newExerciseName}
              onChangeText={setNewExerciseName}
              placeholder='Enter exercise name'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Exercise name'
              autoFocus={true}
            />
          </View>
          <MuscleBrowseChips
            value={browseMuscle}
            onChange={setBrowseMuscle}
            style={styles.inputGroup}
            labelStyle={styles.inputLabel}
          />
          {browseMuscle ? (
            <SuggestionList
              key={`muscle:${browseMuscle}`}
              title={`${muscleDisplayName(browseMuscle)} exercises:`}
              items={muscleBrowseResults}
              onPick={handlePickEditSuggestion}
              styles={styles}
            />
          ) : (
            <>
              <SuggestionList
                key={`name:${newExerciseName}`}
                title='💡 Did you mean:'
                items={nameSuggestions}
                onPick={handlePickEditSuggestion}
                styles={styles}
              />
              <SuggestionList
                key={`swap:${newPrimaryMuscles}`}
                title='🔄 Swap for similar exercise:'
                items={swapSuggestions.map((name) => ({ name }))}
                onPick={handlePickEditSuggestion}
                styles={styles}
              />
            </>
          )}
          <AdvancedMuscles
            expanded={showAdvancedEdit}
            onToggle={() => setShowAdvancedEdit((v) => !v)}
            primary={newPrimaryMuscles}
            secondary={newSecondaryMuscles}
            onPrimaryChange={setNewPrimaryMuscles}
            onSecondaryChange={setNewSecondaryMuscles}
            allMuscleGroups={allMuscleGroups}
            styles={styles}
          />
          <TouchableOpacity
            style={styles.saveButton}
            accessibilityRole='button'
            accessibilityLabel='Save changes'
            onPress={once("saveExerciseName", handleSaveExerciseName)}
          >
            <Text style={styles.saveButtonText}>Save Changes</Text>
          </TouchableOpacity>
        </ModalSheet>

        <ModalSheet
          visible={machinesFor !== null}
          onClose={() => setMachinesFor(null)}
          title='Machine'
          scrollable={true}
          showCancelButton={false}
          showConfirmButton={false}
        >
          {(machineExercise?.machines ?? []).map((name: string) => {
            const isCurrent = name === activeMachine(machineExercise ?? {});
            const meta = machineExercise?.machineMeta?.[name];
            const detail = [
              meta?.pin === undefined ? null : `Pin ${meta.pin}`,
              meta?.note,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <TouchableOpacity
                key={name}
                style={styles.machineRow}
                accessibilityRole='button'
                accessibilityLabel={detail ? `${name}, ${detail}` : name}
                accessibilityHint='Double tap to use this machine'
                accessibilityState={{ selected: isCurrent }}
                accessibilityActions={[{ name: "delete", label: "Remove machine" }]}
                onAccessibilityAction={(e) => {
                  if (e.nativeEvent.actionName === "delete") handleRemoveMachine(name);
                }}
                onPress={() => handleSelectMachine(name)}
              >
                <View style={styles.machineRowBody}>
                  <Text
                    style={[
                      styles.machineRowText,
                      isCurrent && styles.machineRowActive,
                    ]}
                  >
                    {isCurrent ? "●" : "○"} {name}
                  </Text>
                  {detail ? (
                    <Text style={styles.machineRowDetail}>{detail}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.dismissButton}
                  accessibilityRole='button'
                  accessibilityLabel={`Remove ${name}`}
                  onPress={() => handleRemoveMachine(name)}
                >
                  <Text style={styles.dismissButtonText}>✕</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}

          <Text style={styles.machineHint}>
            Tap a machine to switch to it. Add or edit machines in the
            exercise settings.
          </Text>
        </ModalSheet>

        <ModalSheet
          visible={settingsFor !== null}
          onClose={() => {
            setSettingsFor(null);
            setEditMachine(null);
            setNewMachineName("");
          }}
          title='Exercise Settings'
          subtitle={settingsExercise?.name}
          scrollable={true}
          showCancelButton={false}
          showConfirmButton={false}
        >
          <Text style={styles.inputLabel}>Machines</Text>
          {(settingsExercise?.machines?.length ?? 0) === 0 && (
            <Text style={styles.machineHint}>
              No machines yet. Add the machine or setup you use for "
              {settingsExercise?.name}". The exercise keeps its name either
              way.
            </Text>
          )}
          {(settingsExercise?.machines ?? []).map((name: string) => {
            const isDefault = name === settingsExercise?.defaultMachine;
            const meta = settingsExercise?.machineMeta?.[name];
            const detail = [
              meta?.pin === undefined ? null : `Pin ${meta.pin}`,
              meta?.note,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <View key={name} style={styles.machineRow}>
                <TouchableOpacity
                  style={styles.machineRowBody}
                  accessibilityRole='button'
                  accessibilityLabel={[name, detail, isDefault && "default machine"].filter(Boolean).join(", ")}
                  accessibilityHint='Makes this the default machine'
                  accessibilityState={{ selected: isDefault }}
                  onPress={() => handleSetDefaultMachine(name)}
                >
                  <Text
                    style={[
                      styles.machineRowText,
                      isDefault && styles.machineRowActive,
                    ]}
                  >
                    {isDefault ? "●" : "○"} {name}
                  </Text>
                  {detail ? (
                    <Text style={styles.machineRowDetail}>{detail}</Text>
                  ) : null}
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole='button'
                  accessibilityLabel={`Edit ${name}`}
                  hitSlop={12}
                  onPress={() =>
                    setEditMachine({
                      key: name,
                      name,
                      note: meta?.note ?? "",
                      pin: meta?.pin === undefined ? "" : String(meta.pin),
                    })
                  }
                  style={styles.editButton}
                >
                  <Text style={styles.editButtonText}>✏️</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <Text style={styles.machineHint}>
            Tap a machine to make it the default, the one selected when you
            open this exercise.
          </Text>

          {editMachine !== null && (
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Edit "{editMachine.key}"</Text>
              <TextInput
                style={styles.input}
                value={editMachine.name}
                onChangeText={(v) =>
                  setEditMachine({ ...editMachine, name: v })
                }
                placeholder='Machine name'
                placeholderTextColor={colors.textMuted}
                accessibilityLabel='Machine name'
                returnKeyType='next'
                autoFocus={true}
              />
              <TextInput
                style={styles.input}
                value={editMachine.pin}
                onChangeText={(v) =>
                  setEditMachine({
                    ...editMachine,
                    pin: v.replace(/\D/g, ""),
                  })
                }
                placeholder='Pin number (optional)'
                placeholderTextColor={colors.textMuted}
                accessibilityLabel='Pin number, optional'
                keyboardType='number-pad'
                returnKeyType='next'
              />
              <TextInput
                style={styles.input}
                value={editMachine.note}
                onChangeText={(v) =>
                  setEditMachine({ ...editMachine, note: v })
                }
                placeholder='Note, e.g., seat 3, wide handles (optional)'
                placeholderTextColor={colors.textMuted}
                accessibilityLabel='Machine note, optional'
                onSubmitEditing={handleSaveMachineEdit}
                returnKeyType='done'
              />
              <TouchableOpacity
                style={styles.saveButton}
                accessibilityRole='button'
                accessibilityLabel='Save machine'
                onPress={once("saveMachineEdit", handleSaveMachineEdit)}
              >
                <Text style={styles.saveButtonText}>Save Machine</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Add a machine</Text>
            <TextInput
              style={styles.input}
              value={newMachineName}
              onChangeText={setNewMachineName}
              placeholder='e.g., Hammer Strength'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='New machine name'
              onSubmitEditing={handleAddMachine}
              returnKeyType='done'
            />
            <TouchableOpacity
              style={styles.saveButton}
              accessibilityRole='button'
              accessibilityLabel='Add machine'
              onPress={once("addMachine", handleAddMachine)}
            >
              <Text style={styles.saveButtonText}>Add Machine</Text>
            </TouchableOpacity>
          </View>

          {(settingsExercise?.machines?.length ?? 0) > 0 && (
            <>
              <Text style={styles.inputLabel}>Best stats calculation</Text>
              <TouchableOpacity
                style={styles.settingRow}
                accessibilityRole='checkbox'
                accessibilityState={{
                  checked: !!settingsExercise?.bestAcrossMachines,
                }}
                onPress={handleToggleBestAcrossMachines}
              >
                <View
                  style={[
                    styles.settingCheckbox,
                    settingsExercise?.bestAcrossMachines &&
                      styles.settingCheckboxOn,
                  ]}
                >
                  {settingsExercise?.bestAcrossMachines && (
                    <Text style={styles.settingCheckboxMark}>✓</Text>
                  )}
                </View>
                <Text style={styles.settingLabel}>
                  Best set across all machines
                </Text>
              </TouchableOpacity>
              <Text style={styles.machineHint}>
                {settingsExercise?.bestAcrossMachines
                  ? "Every machine is pooled into one best."
                  : "Each machine has its own best."}
              </Text>
            </>
          )}
        </ModalSheet>

        <ModalSheet
          visible={showAddSetsModal}
          onClose={() => {
            setShowAddSetsModal(false);
            setAddingSetsExercise(null);
            setAdditionalSets("");
          }}
          title='Adjust Sets'
          subtitle={getAddingSetsSubtitle(addingSetsExercise)}
          showCancelButton={false}
          showConfirmButton={false}
        >
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Number of Sets to Add</Text>
            <TextInput
              style={styles.input}
              value={additionalSets}
              onChangeText={setAdditionalSets}
              keyboardType='number-pad'
              placeholder='0'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Number of sets to add'
              autoFocus={true}
            />
          </View>
          <TouchableOpacity
            style={styles.saveButton}
            accessibilityRole='button'
            accessibilityLabel='Add sets'
            onPress={once("saveAdditionalSets", handleSaveAdditionalSets)}
          >
            <Text style={styles.saveButtonText}>Add Sets</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.destructiveTextButton}
            accessibilityRole='button'
            accessibilityLabel='Remove one set'
            accessibilityState={{ disabled: !!actAs || onlyOneSet }}
            disabled={!!actAs || onlyOneSet}
            onPress={once("removeOneSet", handleRemoveOneSet)}
          >
            <Text
              style={[
                styles.destructiveTextButtonText,
                (actAs || onlyOneSet) && styles.destructiveTextButtonTextDisabled,
              ]}
            >
              {actAs
                ? `Only ${actAs.username} can remove sets`
                : onlyOneSet
                  ? "An exercise needs at least one set"
                  : "Remove one set"}
            </Text>
          </TouchableOpacity>
        </ModalSheet>

        <ModalSheet
          visible={showAddExerciseModal}
          onClose={closeAddExerciseModal}
          title='Add New Exercise'
          scrollable={true}
          showCancelButton={false}
          showConfirmButton={false}
          dirty={newExercise.name.trim() !== ""}
        >
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Exercise Name *</Text>
            <TextInput
              style={styles.input}
              value={newExercise.name}
              onChangeText={(t) =>
                setNewExercise({
                  ...newExercise,
                  name: t,
                  exerciseId: undefined,
                })
              }
              placeholder='e.g., Bench Press'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Exercise name, required'
              autoFocus={true}
            />
          </View>
          <MuscleBrowseChips
            value={browseMuscle}
            onChange={setBrowseMuscle}
            style={styles.inputGroup}
            labelStyle={styles.inputLabel}
          />
          {browseMuscle ? (
            <SuggestionList
              key={`muscle:${browseMuscle}`}
              title={`${muscleDisplayName(browseMuscle)} exercises:`}
              items={muscleBrowseResults}
              onPick={handlePickNewExerciseName}
              styles={styles}
            />
          ) : (
            newExerciseSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsTitle}>💡 Did you mean:</Text>
                {newExerciseSuggestions.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.suggestionButton}
                    accessibilityRole='button'
                    accessibilityLabel={`Use ${s.label}`}
                    onPress={() => handleDbSuggestionPress(s)}
                  >
                    <Text style={styles.suggestionText}>{s.label}</Text>
                    <Text style={styles.suggestionMatch}>{s.meta}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )
          )}
          <AdvancedMuscles
            expanded={showAdvancedEdit}
            onToggle={() => setShowAdvancedEdit((v) => !v)}
            primary={newExercise.primaryMuscles}
            secondary={newExercise.secondaryMuscles}
            onPrimaryChange={(t) =>
              setNewExercise((prev) => ({ ...prev, primaryMuscles: t }))
            }
            onSecondaryChange={(t) =>
              setNewExercise((prev) => ({ ...prev, secondaryMuscles: t }))
            }
            allMuscleGroups={allMuscleGroups}
            styles={styles}
          />
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Number of Sets *</Text>
            <TextInput
              style={styles.input}
              value={newExercise.sets}
              onChangeText={(t) => setNewExercise({ ...newExercise, sets: t })}
              keyboardType='number-pad'
              placeholder='0'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Number of sets, required'
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Reps</Text>
            <TextInput
              style={styles.input}
              value={newExercise.reps}
              onChangeText={(t) =>
                setNewExercise({
                  ...newExercise,
                  reps: t.replace(/[^\d-]/g, ""),
                })
              }
              maxLength={7}
              keyboardType='numbers-and-punctuation'
              placeholder='e.g. 8-12'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Reps, for example 8 to 12'
            />
          </View>
          <TouchableOpacity
            style={styles.saveButton}
            accessibilityRole='button'
            accessibilityLabel='Add exercise'
            onPress={once("saveNewExercise", handleSaveNewExercise)}
          >
            <Text style={styles.saveButtonText}>Add Exercise</Text>
          </TouchableOpacity>
        </ModalSheet>

        <ModalSheet
          visible={showRestReminderModal}
          onClose={() => setShowRestReminderModal(false)}
          title='Rest Reminder'
          scrollable={true}
          showCancelButton={false}
          showConfirmButton={false}
        >
          <View style={styles.restReminderHero}>
            <Text style={styles.restReminderHeroIcon}>
              {tempRestReminderAlarm ? "⏰" : "🔔"}
            </Text>
            <Text style={styles.restReminderHeroValue}>
              {parsedRestInput === null
                ? "--:--"
                : formatDuration(Math.min(parsedRestInput, MAX_REST_REMINDER_SECONDS))}
            </Text>
            <Text style={styles.restReminderHint}>
              {tempRestReminderAlarm
                ? "An alarm rings once your rest reaches this duration."
                : "You'll get a notification once your rest reaches this duration."}
            </Text>
          </View>

          <View style={styles.restReminderSection}>
            <Text style={styles.restReminderSectionTitle}>Rest Duration</Text>
            <View style={styles.restReminderPresetRow} accessibilityRole='radiogroup'>
              {[60, 90, 120, 180].map((preset) => {
                const selected = parsedRestInput === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.restReminderPresetChip,
                      selected && styles.restReminderPresetChipActive,
                    ]}
                    accessibilityRole='radio'
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`Rest reminder ${formatDuration(preset)}`}
                    onPress={() => setTempRestReminderSeconds(String(preset))}
                  >
                    <Text
                      style={[
                        styles.restReminderPresetChipText,
                        selected && styles.restReminderPresetChipTextActive,
                      ]}
                    >
                      {formatDuration(preset)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.restReminderInputLabel}>Custom (seconds or m:ss)</Text>
            <TextInput
              style={styles.input}
              value={tempRestReminderSeconds}
              onChangeText={setTempRestReminderSeconds}
              keyboardType='numbers-and-punctuation'
              placeholder='e.g., 90 or 1:30'
              placeholderTextColor={colors.textMuted}
              accessibilityLabel='Custom rest reminder, in seconds or minutes and seconds'
            />
            {tempRestReminderSeconds.trim() !== "" && parsedRestInput === null && (
              <Text style={styles.inputError}>
                Enter seconds, e.g. 90, or m:ss, e.g. 1:30.
              </Text>
            )}
          </View>

          {alarmsAvailable && (
            <View style={styles.restReminderSection}>
              <Text style={styles.restReminderSectionTitle}>Notification Type</Text>
              <View style={styles.restReminderNotifRow} accessibilityRole='radiogroup'>
                {[
                  { asAlarm: false, icon: "🔔", label: "Notification", desc: "Standard alert" },
                  { asAlarm: true, icon: "⏰", label: "Alarm", desc: "Rings until dismissed" },
                ].map((opt) => {
                  const selected = tempRestReminderAlarm === opt.asAlarm;
                  return (
                    <TouchableOpacity
                      key={opt.label}
                      style={[
                        styles.restReminderNotifOption,
                        selected && styles.restReminderNotifOptionActive,
                      ]}
                      accessibilityRole='radio'
                      accessibilityLabel={opt.asAlarm ? "Ring as an alarm" : "Send a notification"}
                      accessibilityState={{ checked: selected }}
                      onPress={() => {
                        setTempRestReminderAlarm(opt.asAlarm);
                        if (opt.asAlarm && !selected) {
                          void promptForAlarmPermissions(alert);
                        }
                      }}
                    >
                      <Text style={styles.restReminderNotifIcon}>{opt.icon}</Text>
                      <Text
                        style={[
                          styles.restReminderNotifLabel,
                          selected && styles.restReminderNotifLabelActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                      <Text style={styles.restReminderNotifDesc}>{opt.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}
          <TouchableOpacity
            style={styles.saveButton}
            accessibilityRole='button'
            accessibilityLabel='Save rest reminder'
            onPress={once(
              "saveRestReminder",
              () => void handleSaveRestReminder(),
            )}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
          {restReminderEnabled && (
            <TouchableOpacity
              style={styles.restReminderOffButton}
              accessibilityRole='button'
              accessibilityLabel='Turn rest reminder off'
              onPress={once(
                "clearRestReminder",
                () => void handleSaveRestReminder(0),
              )}
            >
              <Text style={styles.restReminderOffButtonText}>Turn Off</Text>
            </TouchableOpacity>
          )}
        </ModalSheet>

        {quickAdded && (
          <UndoBar
            key={`${quickAdded.exerciseIndex}-${quickAdded.setIndex}`}
            message={`Set added to ${quickAdded.name}`}
            onUndo={undoQuickAdd}
            onTimeout={clearQuickAdded}
          />
        )}

        {deletedSet && (
          <UndoBar
            key={`deleted-${deletedSet.exerciseIndex}-${deletedSet.setIndex}`}
            message='Set deleted'
            onUndo={undoDeleteSet}
            onTimeout={clearDeletedSet}
          />
        )}

        {AlertComponent}
      </View>

      <WidgetGallery
        visible={widgetBoard.galleryVisible}
        onClose={widgetBoard.closeGallery}
        availableWidgets={availableToAdd}
        onAddWidget={widgetBoard.add}
        hasPlacedWidgets={widgets.length > 0}
        onEditWidgets={widgetBoard.editWidgets}
      />
    </SafeAreaView>
  );
}

export const makeStyles = (colors: ThemeColors) => {
  const onTint = getDayOverviewTextColor(colors);
  const onTintHex = toRgbHex(onTint) ?? onTint;
  const overtime = isDarkColor(colors.background)
    ? colors.warning
    : colors.warningLight;
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 40,
      backgroundColor: colors.background,
    },
    widgetLineMuted: {
      fontSize: 14,
      color: onTint,
      fontStyle: "italic",
    },
    lockedBanner: {
      backgroundColor: colors.warningLight,
      borderLeftWidth: 4,
      borderLeftColor: colors.warning,
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
    },
    lockedBannerTextContainer: { flex: 1 },
    lockedBannerTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    lockedBannerText: { fontSize: 14, color: colors.textPrimary },
    restartDayButton: {
      minHeight: 44,
      marginLeft: 12,
      paddingHorizontal: 14,
      justifyContent: "center",
      borderRadius: 10,
      backgroundColor: colors.warning,
    },
    restartDayText: { color: colors.textOnAccent, fontWeight: "700" },
    headerCardInner: {
      backgroundColor: "transparent",
    },
    dayNumberWidgetInner: {
      backgroundColor: "transparent",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    dayNumberValue: {
      fontSize: 32,
      fontWeight: "800",
      color: onTint,
      letterSpacing: -0.5,
    },
    dayNumberLockedTag: {
      marginTop: 4,
    },
    dayNumberLockedText: {
      fontSize: 12,
      fontWeight: "700",
      color: onTint,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    totalSetsWidgetInner: {
      backgroundColor: "transparent",
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    setsValue: {
      fontSize: 32,
      fontWeight: "800",
      color: onTint,
      letterSpacing: -0.5,
    },
    progressContainer: { marginTop: 0 },
    progressBar: {
      height: 8,
      backgroundColor: `${onTintHex}4D`,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: {
      height: "100%",
      backgroundColor: onTint,
      borderRadius: 4,
    },
    progressTextRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    progressText: { fontSize: 14, color: onTint },
    endTimeText: {
      fontSize: 12,
      color: onTint,
      marginTop: 4,
    },
    sessionStatsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
    },
    sessionStat: { alignItems: "center", flexShrink: 1 },
    sessionStatLabel: {
      fontSize: 12,
      color: onTint,
      marginBottom: 4,
    },
    sessionStatValue: {
      fontSize: 20,
      fontWeight: "bold",
      color: onTint,
    },
    reminderPill: {
      paddingHorizontal: 10,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: `${onTintHex}26`,
    },
    restReminderNote: { textAlign: "center", marginTop: 4 },
    currentRestContainer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: `${onTintHex}40`,
    },
    currentRestLabel: {
      flexShrink: 1,
      fontSize: 14,
      color: onTint,
      marginRight: 8,
    },
    currentRestValue: {
      fontSize: 16,
      fontWeight: "bold",
      color: onTint,
    },
    currentRestOvertime: { color: overtime },
    overtimeText: { fontSize: 14, color: overtime },
    completeMessage: {
      marginTop: 15,
      padding: 12,
      backgroundColor: `${onTintHex}33`,
      borderRadius: 8,
    },
    completeMessageText: {
      color: onTint,
      fontSize: 16,
      fontWeight: "600",
      textAlign: "center",
    },
    exerciseList: { flex: 1 },
    exerciseListContent: SCREEN_PADDING,
    exerciseCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
      borderWidth: 2,
      borderColor: "transparent",
    },
    exerciseCardComplete: {
      backgroundColor: colors.successLight,
      borderColor: colors.success,
    },
    exerciseCardLocked: {
      backgroundColor: colors.inputBackground,
      borderColor: colors.surfaceBorder,
    },
    exerciseCardShared: {
      borderColor: colors.warning,
      backgroundColor: colors.warningLight,
    },
    exerciseCardPartner: {
      borderColor: colors.accentDark,
      backgroundColor: colors.infoLight,
    },
    exerciseHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    exerciseInfo: { flex: 1 },
    exerciseMuscles: { marginTop: -12, marginBottom: 12 },
    exerciseNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    exerciseName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
      flex: 1,
    },
    exerciseNameComplete: { color: colors.success },
    editButton: { padding: 4 },
    editButtonText: { fontSize: 16 },
    machineChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.separator,
    },
    machineChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.accent,
      maxWidth: 110,
    },
    machineRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      gap: 8,
    },
    machineRowBody: { flex: 1 },
    machineRowText: { fontSize: 16, color: colors.textPrimary },
    machineRowDetail: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
      marginLeft: 18,
    },
    machineRowActive: { color: colors.accent, fontWeight: "700" },
    machineHint: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 12,
      textAlign: "center",
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 12,
    },
    settingCheckbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    settingCheckboxOn: { backgroundColor: colors.accent },
    settingCheckboxMark: { color: colors.textOnAccent, fontWeight: "700" },
    settingLabel: { fontSize: 16, color: colors.textPrimary, flex: 1 },
    muscleGroup: { fontSize: 14, color: colors.textSecondary },
    exerciseProgress: {
      backgroundColor: colors.separator,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    exerciseProgressText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.accent,
    },
    setsContainer: { flexDirection: "row", flexWrap: "wrap", gap: SET_GAP },
    setButton: {
      width: 50,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.separator,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      padding: 2,
    },
    setButtonComplete: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    setButtonLocked: {
      backgroundColor: colors.surfaceBorder,
      borderColor: colors.textSecondary,
    },
    setButtonWarmup: {
      backgroundColor: colors.warningLight,
      borderColor: colors.warning,
    },
    setButtonOnLightFill: { color: colors.textPrimary },
    setButtonPartner: {
      borderColor: colors.accentDark,
      borderWidth: 3,
      backgroundColor: colors.infoLight,
    },
    setButtonPartnerDone: { borderColor: colors.info, borderWidth: 2 },
    partnerSetDot: {
      position: "absolute",
      top: -4,
      left: -4,
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.accentDark,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    setButtonNumber: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.textSecondary,
    },
    setButtonNumberComplete: { color: colors.textOnAccent },
    warmupText: { fontSize: 14 },
    setDetailsPreview: { alignItems: "center", alignSelf: "stretch" },
    setDetailsText: {
      fontSize: 12,
      color: colors.textOnAccent,
      fontWeight: "600",
    },
    setNoteIndicator: { position: "absolute", bottom: 1, left: 2, fontSize: 12 },
    partnerDoneGlyph: {
      position: "absolute",
      bottom: 1,
      right: 2,
      fontSize: 10,
    },
    setCheckmark: {
      position: "absolute",
      top: -4,
      right: -4,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.success,
      alignItems: "center",
      justifyContent: "center",
    },
    setCheckmarkText: {
      color: colors.textOnAccent,
      fontSize: 12,
      fontWeight: "bold",
    },
    addSetButton: {
      width: 50,
      height: 50,
      borderRadius: 12,
      backgroundColor: colors.accentLight,
      borderWidth: 2,
      borderColor: colors.accent,
      borderStyle: "dashed",
      alignItems: "center",
      justifyContent: "center",
    },
    addSetButtonIcon: {
      fontSize: 32,
      fontWeight: "bold",
      color: colors.accent,
    },
    addExerciseButton: {
      backgroundColor: colors.accentLight,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    addExerciseButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.accent,
    },
    completeWorkoutFooter: {
      width: "100%",
      paddingHorizontal: 12,
      paddingBottom: 12,
    },
    completeWorkoutButton: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    completeWorkoutIcon: { fontSize: 20 },
    completeWorkoutButtonText: {
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0.4,
    },
    warmupToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 4,
      marginBottom: 16,
    },
    warmupToggleText: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.textPrimary,
    },

    unitSelectorContainer: { marginBottom: 16 },
    unitSelectorLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 8,
    },
    unitSelectorRow: { flexDirection: "row", gap: 10 },
    unitButton: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      alignItems: "center",
    },
    unitButtonActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    unitButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    unitButtonTextActive: { color: colors.accent },

    performanceSection: { marginBottom: 20 },
    performanceSectionTitle: {
      fontSize: 16,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    performanceCard: {
      backgroundColor: colors.accentLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    bestPerformanceCard: {
      backgroundColor: colors.warningLight,
      borderColor: colors.warning,
    },
    performanceCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    performanceCardTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    performanceCardDate: { fontSize: 12, color: colors.textSecondary },
    performanceStats: { flexDirection: "row", justifyContent: "space-around" },
    performanceStat: { alignItems: "center" },
    performanceStatValue: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.accent,
      marginBottom: 4,
    },
    bestStatValue: { color: colors.warning },
    performanceStatLabel: { fontSize: 12, color: colors.textSecondary },
    performanceTotalAttempts: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 4,
    },
    historyLoading: { padding: 20, alignItems: "center" },
    historyLoadingText: { fontSize: 14, color: colors.textMuted },
    noHistoryContainer: {
      padding: 20,
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      marginBottom: 20,
    },
    noHistoryText: {
      fontSize: 14,
      color: colors.textMuted,
      fontStyle: "italic",
    },
    retryButton: {
      minHeight: 48,
      paddingHorizontal: 16,
      marginTop: 4,
      justifyContent: "center",
    },
    retryText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.accent,
    },
    inputGroup: { marginBottom: 20 },
    inputLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 8,
    },
    inputHint: { fontSize: 14, color: colors.textMuted, marginTop: 6 },
    inputError: { fontSize: 14, color: colors.error, marginTop: 6 },
    oneRepMaxHint: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.accent,
      marginTop: 8,
    },
    progressionPrompt: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      padding: 12,
      marginBottom: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.success,
      backgroundColor: colors.successLight,
    },
    progressionPromptText: { flex: 1, fontSize: 14, color: colors.success },
    progressionPromptActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    progressionApplyButton: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: colors.success,
    },
    progressionApplyText: {
      color: colors.textOnAccent,
      fontSize: 14,
      fontWeight: "700",
    },
    progressionDismissButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    progressionDismissText: { fontSize: 16, color: colors.success },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 20,
      color: colors.textPrimary,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
    },
    notesInput: { minHeight: 80, textAlignVertical: "top" },
    assistedInfoBox: {
      backgroundColor: colors.infoLight,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.info,
    },
    assistedInfoText: { fontSize: 14, color: colors.info, textAlign: "center" },
    saveButton: {
      backgroundColor: colors.accent,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 10,
    },
    saveButtonDisabled: { opacity: 0.45 },
    setFormBody: { flexShrink: 1 },
    saveButtonText: {
      color: colors.textOnAccent,
      fontSize: 16,
      fontWeight: "bold",
    },
    suggestionsContainer: {
      backgroundColor: colors.warningLight,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.warning,
    },
    suggestionsTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    suggestionsHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    suggestionsHeaderTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    dismissButton: {
      minWidth: 48,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
    },
    dismissButtonText: { fontSize: 16, color: colors.textSecondary },
    suggestionButton: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      marginBottom: 8,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.warning,
    },
    suggestionText: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.textPrimary,
      flex: 1,
    },
    suggestionMatch: { fontSize: 12, color: colors.warning, fontWeight: "600" },
    suggestionMeta: {
      fontSize: 12,
      color: colors.warning,
      fontWeight: "600",
      maxWidth: "45%",
      marginLeft: 8,
    },
    loadMoreButton: { paddingVertical: 8, alignItems: "center" },
    loadMoreText: { fontSize: 14, fontWeight: "600", color: colors.warning },
    advancedToggle: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 20,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    advancedToggleBody: { flex: 1 },
    advancedToggleTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    advancedToggleSummary: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 2,
    },
    advancedToggleChevron: {
      fontSize: 12,
      color: colors.textSecondary,
      marginLeft: 8,
    },
    restReminderHero: {
      alignItems: "center",
      backgroundColor: colors.infoLight,
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 16,
      marginBottom: 14,
    },
    restReminderHeroIcon: { fontSize: 32, marginBottom: 4 },
    restReminderHeroValue: {
      fontSize: 44,
      fontWeight: "800",
      color: colors.accent,
      fontVariant: ["tabular-nums"],
      marginBottom: 6,
    },
    restReminderHint: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: "center",
    },
    restReminderSection: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
    },
    restReminderSectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    restReminderInputLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      marginBottom: 6,
    },
    restReminderPresetRow: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 16,
    },
    restReminderPresetChip: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      backgroundColor: colors.inputBackground,
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    restReminderPresetChipActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    restReminderPresetChipText: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textSecondary,
    },
    restReminderPresetChipTextActive: { color: colors.accent },
    restReminderNotifRow: { flexDirection: "row", gap: 12 },
    restReminderNotifOption: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    restReminderNotifOptionActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    restReminderNotifIcon: { fontSize: 28, marginBottom: 6 },
    restReminderNotifLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 3,
    },
    restReminderNotifLabelActive: { color: colors.accent },
    restReminderNotifDesc: {
      fontSize: 11,
      color: colors.textMuted,
      textAlign: "center",
    },
    restReminderOffButton: {
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 4,
    },
    restReminderOffButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.error,
    },
    destructiveTextButton: {
      minHeight: 48,
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 4,
    },
    destructiveTextButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.error,
    },
    destructiveTextButtonTextDisabled: { color: colors.textMuted },
  });
};

export default function WorkoutScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [trainee, setTrainee] = useState<TraineeOption | null>(() =>
    getActiveTrainee(),
  );

  useEffect(() => {
    void getAppMode().then((mode) => setIsOnline(mode === "online"));
    return onAppModeChange.subscribe((mode) => setIsOnline(mode === "online"));
  }, []);

  useEffect(
    () =>
      onActiveTraineeChange.subscribe(setTrainee),
    [],
  );

  const [role, setRole] = useState(getAppRole);
  useEffect(() => onAppRoleChange.subscribe(setRole), []);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  if (isOnline === true && role === "trainer") {
    if (!trainee) {
      return (
        <SafeAreaView
          style={{ flex: 1, justifyContent: "center", backgroundColor: colors.background }}
        >
          <EmptyState
            title='No client selected'
            text='Pick a client to start a session'
          >
            <Button label='Go to Clients' onPress={() => navigation.navigate("Clients")} />
          </EmptyState>
        </SafeAreaView>
      );
    }
    return (
      <WorkoutProvider key={trainee.userId} actAs={trainee}>
        <WorkoutScreenBody
          visible
          hidePartnerControls
          header={
            <TrainerSessionBar
              username={trainee.username}
              onStop={() => setActiveTrainee(null)}
            />
          }
        />
      </WorkoutProvider>
    );
  }

  return <WorkoutScreenBody />;
}
