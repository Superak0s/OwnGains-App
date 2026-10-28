import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Share,
  Linking,
  BackHandler,
} from "react-native";
import { Image } from "expo-image";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import {
  loadProfileAvatar,
  restoreProfileAvatar,
  saveProfileAvatar,
} from "./utils/profileAvatar";
import { profilePhotoApi , authService } from "@features/auth/services";
import {
  saveToStorage,
  loadFromStorage,
  getUserKey,
  STORAGE_KEYS,
} from "@shared/services/storage";
import {
  useWorkoutPick,
  useWorkoutSyncStatus,
} from "@shared/context/WorkoutContext";
import { useAuth } from "@shared/context/AuthContext";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type {
  WorkoutDay,
  CompletedExercises,
  RootStackParamList,
} from "@shared/types";
import {
  useAlert,
  type AlertButton,
  type AlertType,
} from "@shared/components/CustomAlert";
import ThemeEditorModal from "@shared/components/ThemeEditorModal";
import {
  ChangePasswordModal,
  PasswordConfirmModal,
  DeleteAccountModal,
  ExportPassphraseModal,
  MIN_EXPORT_PASSPHRASE,
  RestorePassphraseModal,
  TimeBetweenSetsModal,
  isDeleteConfirmed,
  type DeleteAccountInput,
  type PasswordChangeInput,
} from "./components/SettingsFormModals";
import EditWorkoutHistoryModal from "./components/EditWorkoutHistoryModal";
import ChangelogSheet from "./components/ChangelogSheet";
import TipJarSheet from "./components/TipJarSheet";
import { SettingsGroup, SettingsRow } from "./components/SettingsRow";
import { showToast } from "@shared/components/toast";
import ModalSheet from "@shared/components/ModalSheet";
import { Avatar } from "@shared/components/Avatar";
import {
  importStrengthLevelCSV,
  type ImportResult,
} from "@utils/strengthLevelImport";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  getAppModeSync,
  isServerless,
  onAppModeChange,
  restartOnboarding,
} from "@shared/services/appMode";
import {
  type AppRole,
  effectiveRole,
  getAppRole,
  onAppRoleChange,
  setAppRole,
} from "@shared/services/appRole";
import { workoutApi } from "@features/workout/services/index";
import { programApi } from "@features/plan/services/index";
import {
  DEMO_SPLIT,
  buildDemoProgram,
  demoDataChanged,
} from "./utils/demoData";
import { clearDemoTracking, fillDemoTracking } from "./utils/demoTracking";
import { doMigrateOffline as runOfflineMigration } from "./utils/offlineMigration";
import { passwordPolicyError } from "@features/auth/utils/passwordPolicy";
import { getGoogleIdToken, GoogleSignInCancelledError } from "@features/auth/googleSignIn";
import { KOFI_URL } from "@shared/distribution";

// The same rule the signup screen states for the same field.
const PROFILE_EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

const DISPLAY_MODE_OPTIONS = [
  { key: "per_exercise", label: "Per-exercise" },
  { key: "banner", label: "Banner" },
  { key: "both", label: "Both" },
  { key: "off", label: "Off" },
] as const;

const CALCULATION_MODE_OPTIONS: ReadonlyArray<{
  key: UndertrainedCalculationMode;
  label: string;
  description: string;
}> = [
  {
    key: "days_done",
    label: "Days done",
    description: "Only days you've logged this week",
  },
  {
    key: "full_split",
    label: "Full split",
    description: "Your full split cycle, regardless of what's logged",
  },
  {
    key: "last_30_days",
    label: "Last 30 days",
    description: "Your sets over the last 30 days against 30 days of your split",
  },
];

const ALERT_PREVIEWS: ReadonlyArray<{
  type: AlertType;
  title: string;
  message: string;
  buttons: AlertButton[];
}> = [
  {
    type: "success",
    title: "Session saved",
    message: "Push Day A: 18 sets in 42 minutes.",
    buttons: [{ text: "Done" }],
  },
  {
    type: "error",
    title: "Sync failed",
    message:
      "The server didn't respond. Your sets are stored on this device and upload on reconnect.",
    buttons: [{ text: "Not now", style: "cancel" }, { text: "Retry" }],
  },
  {
    type: "warning",
    title: "Delete this set?",
    message: "Today's set count is recalculated without it.",
    buttons: [
      { text: "Keep", style: "cancel" },
      { text: "Delete", style: "destructive" },
    ],
  },
  {
    type: "lock",
    title: "Day locked",
    message: "Finish Pull Day B before starting the next session.",
    buttons: [{ text: "OK" }],
  },
  {
    type: "default",
    title: "Rest timer",
    message: "Pick how long to rest between sets.",
    buttons: [
      { text: "90 seconds", style: "cancel" },
      { text: "2 minutes", style: "cancel" },
      { text: "3 minutes" },
    ],
  },
];

import TutorialMenuSheet from "@features/tutorial/TutorialMenuSheet";
import { tutorialAnchor } from "@features/tutorial/anchors";
import { useTutorial } from "@features/tutorial/TutorialContext";
import { friendsApi } from "@features/friends/services";
import HealthConnectSection from "@features/healthConnect/HealthConnectSection";
import type { BlockedUser } from "@features/friends/services";
import {
  isCrashReportingEnabled,
  setCrashReportingEnabled,
  isTelemetryEnabled,
  setTelemetryEnabled,
  trackFeature,
  trackSpan,
  sendTestEvent,
  captureException,
} from "@shared/services/crashReporting";
import {
  canDrawOverlays,
  canScheduleExactAlarms,
} from "@shared/services/notifications";
import {
  scheduleTestAlarm,
  TEST_ALARM_DELAY_SECONDS,
} from "@shared/services/supplementReminders";
import { writeJsonExport, DESTINATION_TEXT } from "@utils/writeJsonExport";
import {
  decryptExport,
  encryptExport,
  isEncryptedExport,
  type EncryptedExport,
} from "@utils/exportEncryption";
import {
  isDeviceBackup,
  restoreDeviceBackup,
  type DeviceBackup,
} from "@utils/deviceBackup";
import type { ImportMode } from "@shared/services/sqliteStorage";
import type { UndertrainedCalculationMode } from "@features/analytics/utils/trainingSummary";
import { getServerUrl, onServerUrlChange } from "@shared/services/config";
import { canAuthenticate, forgetMe } from "@features/skins/services/marketplace";
import {
  describeLocalOnlyFeatures,
  getLocalOnlyFeatures,
} from "@shared/services/localOnlyFeatures";
import {
  checkServerVersion,
  MIN_SERVER_VERSION,
  type ServerVersionCheck,
} from "@shared/services/serverVersion";
import {
  loadTabOrder,
  type MainTabName,
  moveTab,
  saveTabOrder,
  tabMeta,
} from "@shared/services/tabOrder";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { userFacingError } from "@shared/services/apiError";
import { SCREEN_PADDING } from "@shared/layout";

export type SettingsStyles = ReturnType<typeof makeStyles>;

const NO_LOCAL_PROGRESS_HINT = "No local progress on this device";

const DROPPED_SYNC_REASONS: Record<string, string> = {
  invalid_set: "the set was incomplete",
  session_gone: "its session no longer exists",
  local_id: "its session was never uploaded",
  retries_exhausted: "the server kept rejecting it",
  unknown_type: "it was not a recognised operation",
};

const describeDroppedSync = (drop: {
  type: string;
  reason: string;
  at: string;
}): string =>
  `${drop.type} at ${new Date(drop.at).toLocaleString()}: ` +
  (DROPPED_SYNC_REASONS[drop.reason] ?? drop.reason);

type UndertrainedDisplayMode = "banner" | "per_exercise" | "both" | "off";

function UndertrainedExample({
  mode,
  styles,
}: Readonly<{
  mode: UndertrainedDisplayMode;
  styles: SettingsStyles;
}>) {
  return (
    <View style={styles.exampleBox}>
      <Text style={styles.exampleLabel}>Example</Text>
      {mode === "off" && (
        <Text style={styles.exampleEmpty}>
          Nothing is shown on the workout screen.
        </Text>
      )}
      {(mode === "banner" || mode === "both") && (
        <View style={styles.exampleCard}>
          <Text style={styles.exampleCardTitle}>
            💪 Chest is behind this week. Try:
          </Text>
          <View style={styles.exampleChip}>
            <Text style={styles.exampleChipText}>Incline Dumbbell Press</Text>
          </View>
        </View>
      )}
      {(mode === "per_exercise" || mode === "both") && (
        <View style={styles.exampleCard}>
          <View style={styles.exampleBadge}>
            <Text style={styles.exampleBadgeText}>
              💪 Priority: Chest is behind this week
            </Text>
          </View>
          <Text style={styles.exampleCardTitle}>Bench Press</Text>
          <Text style={styles.exampleCardSubtitle}>
            Moved to the top of today’s list
          </Text>
        </View>
      )}
    </View>
  );
}

const SUPPORT_COPY = KOFI_URL
  ? { role: "link", label: "Support development on Ko-fi", cta: "Ko-fi ↗" } as const
  : { role: "button", label: "Support development with a tip", cta: "Tip" } as const;

const PROFILE_COPY = {
  section: "Profile",
  editLabel: "Edit this device profile",
  row: "This Device Profile",
};
const plural = (n: number, word: string): string =>
  `${n} ${word}${n === 1 ? "" : "s"}`;
const countChanges = (n: number): string => plural(n, "change");

export function syncResultMessage(before: number, left: number): string {
  if (left === 0) return "All changes synced";
  const synced = Math.max(0, before - left);
  return `Synced ${synced} of ${before}. ${countChanges(left)} still waiting.`;
}

type SettingsPage =
  | "account"
  | "workout"
  | "appearance"
  | "storage"
  | "privacy"
  | "about"
  | "developer";

const ACCOUNT_COPY = {
  section: "Account",
  editLabel: "Edit your account details",
  row: "Account",
};

export default function SettingsScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, logout, updateProfile, refreshUser, unlinkGoogle } = useAuth();
  // Server-granted, so offline profiles are never admin.
  const isAdmin = user?.isAdmin === true;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showUnlinkGoogleModal, setShowUnlinkGoogleModal] = useState(false);
  const [unlinkingGoogle, setUnlinkingGoogle] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [showExportPassphraseModal, setShowExportPassphraseModal] =
    useState(false);
  const [pendingEncryptedBackup, setPendingEncryptedBackup] =
    useState<EncryptedExport | null>(null);
  const [decryptingBackup, setDecryptingBackup] = useState(false);
  const [restoringData, setRestoringData] = useState(false);
  const [showBlockedModal, setShowBlockedModal] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [crashReporting, setCrashReporting] = useState(
    isCrashReportingEnabled(),
  );
  const [telemetry, setTelemetry] = useState(isTelemetryEnabled());
  const [serverInfo, setServerInfo] = useState<
    ServerVersionCheck | null | undefined
  >(undefined);
  const [localOnlyFeatures, setLocalOnlyFeatures] = useState<string[]>([]);
  const { alert, AlertComponent } = useAlert();
  const alertPreviewIndexRef = useRef(0);

  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    // Set on mount too, not only cleared on unmount: a remount (an unmountOnBlur
    // tab, a lazy tab, StrictMode in dev) would otherwise leave it false and
    // silently no-op every guarded path (import results, demo spinners, errors).
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const {
    workoutData,
    selectedSplit,
    currentDay,
    completedDays,
    lockedDays,
    timeBetweenSets,
    useManualTime,
    workoutStartTime,
    saveCompletedDays,
    saveLockedDays,
    saveTimeBetweenSets,
    toggleUseManualTime,
    clearAllData,
    syncPendingData,
    clearActiveWorkout,
    saveUnlockedOverrides,
    syncFromServer,
    saveWorkoutData,
    saveSelectedSplit,
    resetDay,
  } = useWorkoutPick(
    "workoutData",
    "selectedSplit",
    "currentDay",
    "completedDays",
    "lockedDays",
    "timeBetweenSets",
    "useManualTime",
    "workoutStartTime",
    "saveCompletedDays",
    "saveLockedDays",
    "saveTimeBetweenSets",
    "toggleUseManualTime",
    "clearAllData",
    "syncPendingData",
    "clearActiveWorkout",
    "saveUnlockedOverrides",
    "syncFromServer",
    "saveWorkoutData",
    "saveSelectedSplit",
    "resetDay",
  );
  const {
    pendingSyncs,
    isSyncing,
    droppedSyncs,
    droppedSyncCount,
    acknowledgeDroppedSyncs,
  } = useWorkoutSyncStatus();

  const [showTimeBetweenSetsModal, setShowTimeBetweenSetsModal] =
    useState<boolean>(false);
  const [showResetDayModal, setShowResetDayModal] = useState<boolean>(false);

  const [showThemeEditor, setShowThemeEditor] = useState<boolean>(false);
  const [showTutorialMenu, setShowTutorialMenu] = useState<boolean>(false);
  const [showTabOrderModal, setShowTabOrderModal] = useState<boolean>(false);
  const [showChangelog, setShowChangelog] = useState<boolean>(false);
  const [showTipJar, setShowTipJar] = useState<boolean>(false);
  const [tabOrder, setTabOrder] = useState<MainTabName[]>([]);
  const [tabOrderRole, setTabOrderRole] = useState<AppRole>("personal");

  const openTabOrder = async () => {
    const role = effectiveRole(getAppRole(), getAppModeSync());
    setTabOrderRole(role);
    setTabOrder(await loadTabOrder(role));
    setShowTabOrderModal(true);
  };

  const handleMoveTab = (index: number, direction: -1 | 1) => {
    const next = moveTab(tabOrder, index, direction);
    setTabOrder(next);
    void saveTabOrder(next, tabOrderRole);
  };
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [fillingDemoData, setFillingDemoData] = useState<boolean>(false);
  const [showEditHistoryModal, setShowEditHistoryModal] =
    useState<boolean>(false);

  const [serverProgress, setServerProgress] = useState<{
    daysCount?: number;
    setsCount?: number;
    lockedCount?: number;
    [key: string]: unknown;
  } | null>(null);
  const [loadingProgress, setLoadingProgress] = useState<boolean>(false);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const googleOnly = !isOffline && user?.hasPassword === false;
  const [appRole, setAppRoleState] = useState(getAppRole);
  useEffect(() => onAppRoleChange.subscribe(setAppRoleState), []);
  const { offerTrainerTour } = useTutorial();
  const [progressError, setProgressError] = useState<boolean>(false);
  const [blockedError, setBlockedError] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [undertrainedDisplayMode, setUndertrainedDisplayMode] =
    useState<UndertrainedDisplayMode>("per_exercise");
  const [undertrainedCalculationMode, setUndertrainedCalculationMode] =
    useState<UndertrainedCalculationMode>("days_done");
  const [showDisplayModeMenu, setShowDisplayModeMenu] = useState(false);
  const [prCelebration, setPrCelebration] = useState<boolean>(true);
  const [autoProgression, setAutoProgression] = useState<boolean>(true);

  useEffect(() => {
    const userId = user?.id ?? null;
    // Sequential reads: without this, switching accounts mid-flight
    // applies the previous user's preferences to the new session.
    let cancelled = false;
    (async () => {
      const displayMode = await loadFromStorage<string>(
        STORAGE_KEYS.UNDERTRAINED_DISPLAY_MODE,
        userId,
        false,
      );
      if (cancelled) return;
      if (displayMode) {
        setUndertrainedDisplayMode(displayMode as UndertrainedDisplayMode);
      }
      const calcMode = await loadFromStorage<string>(
        STORAGE_KEYS.UNDERTRAINED_CALCULATION_MODE,
        userId,
        false,
      );
      if (cancelled) return;
      if (calcMode) {
        setUndertrainedCalculationMode(calcMode as UndertrainedCalculationMode);
      }
      const pr = await loadFromStorage<boolean>(
        STORAGE_KEYS.PR_CELEBRATION,
        userId,
      );
      const progression = await loadFromStorage<boolean>(
        STORAGE_KEYS.AUTO_PROGRESSION,
        userId,
      );
      if (cancelled) return;
      setPrCelebration(pr !== false);
      setAutoProgression(progression !== false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const saveWorkoutPref = (
    key: string,
    setter: (on: boolean) => void,
    on: boolean,
  ) => {
    setter(on);
    trackFeature("settings", "toggle", { setting: key, on });
    void saveToStorage(key, on, user?.id ?? null);
  };

  const handleSetUndertrainedDisplayMode = (mode: UndertrainedDisplayMode) => {
    setUndertrainedDisplayMode(mode);
    void saveToStorage(
      STORAGE_KEYS.UNDERTRAINED_DISPLAY_MODE,
      mode,
      user?.id ?? null,
    );
  };

  const handleSetUndertrainedCalculationMode = (
    mode: UndertrainedCalculationMode,
  ) => {
    setUndertrainedCalculationMode(mode);
    void saveToStorage(
      STORAGE_KEYS.UNDERTRAINED_CALCULATION_MODE,
      mode,
      user?.id ?? null,
    );
  };

  const loadServerProgress = useCallback(async () => {
    if (!selectedSplit) return;
    setLoadingProgress(true);
    setProgressError(false);
    try {
      const sessions = await workoutApi.getSessionHistory(
        selectedSplit,
        null,
        100,
      );
      if (!sessions || sessions.length === 0) {
        setServerProgress({ daysCount: 0, setsCount: 0, lockedCount: 0 });
        return;
      }

      const daysSeen = new Set();
      const lockedDaysSeen = new Set();
      let totalSets = 0;

      for (const session of sessions) {
        daysSeen.add(session.dayNumber);
        if (session.endTime) {
          lockedDaysSeen.add(session.dayNumber);
        }
        totalSets += session.setCount ?? 0;
      }

      setServerProgress({
        daysCount: daysSeen.size,
        setsCount: totalSets,
        lockedCount: lockedDaysSeen.size,
      });
    } catch (error) {
      console.error("Error loading server progress:", error);
      setServerProgress(null);
      setProgressError(true);
    } finally {
      setLoadingProgress(false);
    }
  }, [selectedSplit]);

  useEffect(() => {
    void loadServerProgress();
    void isServerless().then(setIsOffline);
    return onAppModeChange.subscribe(() => {
      void isServerless().then(setIsOffline);
    });
  }, [user, loadServerProgress]);

  const handleShowImportSuccess = useCallback(
    (result: ImportResult) => {
      if (!isMountedRef.current) return;
      const summary =
        `Imported ${result.setsImported} set${result.setsImported === 1 ? "" : "s"} ` +
        `across ${result.sessionsCreated} session${result.sessionsCreated === 1 ? "" : "s"}.` +
        (result.skipped > 0
          ? `\n${plural(result.skipped, "row")} ${result.skipped === 1 ? "was" : "were"} skipped.`
          : "");
      const hasErrors = result.errors.length > 0;
      alert(
        hasErrors ? "Import Completed with Issues" : "Import Successful",
        hasErrors
          ? `${summary}\n\n${result.errors.slice(0, 3).join("\n")}`
          : summary,
        [{ text: "OK" }],
        hasErrors ? "error" : "success",
      );
    },
    [alert],
  );

  const handleShowImportError = useCallback(
    (error: unknown) => {
      console.error("Error importing CSV:", error);
      if (!isMountedRef.current) return;
      alert(
        "Import Failed",
        userFacingError(error, "Failed to import the CSV file."),
        [{ text: "OK" }],
        "error",
      );
    },
    [alert],
  );

  const performCSVImport = useCallback(
    async (csvText: string): Promise<void> => {
      if (!selectedSplit) {
        alert(
          "No Split Selected",
          "Select a split before importing workout history.",
          [{ text: "OK" }],
          "error",
        );
        return;
      }

      try {
        setIsImporting(true);
        const result = await importStrengthLevelCSV(csvText, selectedSplit);

        if (result.sessionsCreated > 0 && isMountedRef.current) {
          await syncFromServer();
          await loadServerProgress();
        }

        if (isMountedRef.current) handleShowImportSuccess(result);
      } catch (error) {
        handleShowImportError(error);
      } finally {
        if (isMountedRef.current) setIsImporting(false);
      }
    },
    [
      selectedSplit,
      syncFromServer,
      alert,
      handleShowImportSuccess,
      handleShowImportError,
      loadServerProgress,
    ],
  );

  const runDemoFill = async (): Promise<void> => {
    setFillingDemoData(true);
    try {
      let program = workoutData;
      let split = selectedSplit;

      if (!program?.days?.length) {
        program = buildDemoProgram();
        split = DEMO_SPLIT;
        await saveWorkoutData(program);
        await saveSelectedSplit(split);
        try {
          await programApi.saveProgram(program);
        } catch (error) {
          console.warn(
            "Could not sync demo program to server:",
            error,
          );
        }
      } else if (!split) {
        split = Object.keys(program.days[0].split ?? {})[0] ?? DEMO_SPLIT;
      }

      // Checked before the split is persisted: the fill throws on a
      // split with no exercises, and there is nothing to roll the change back.
      const hasExercises = (program.days ?? []).some(
        (day) => (day.split?.[split]?.exercises?.length ?? 0) > 0,
      );
      if (!hasExercises) {
        throw new Error(
          `"${split}" has no exercises, so there is nothing to generate sessions from. Add exercises to a day first.`,
        );
      }
      if (split !== selectedSplit) await saveSelectedSplit(split);

      const { sessions, sets, friends, tracking } = await workoutApi.fillDemoData(
        program,
        split,
      );
      const tracked =
        tracking + (await fillDemoTracking(user?.id ?? null, user?.heightCm));
      demoDataChanged.trigger();
      if (!isMountedRef.current) return;
      await syncFromServer();
      const extras = [
        friends ? `${friends} demo friends with messages` : null,
        tracked ? `${tracked} tracking and supplement entries` : null,
      ].filter(Boolean);
      const extrasNote = extras.length ? `, plus ${extras.join(" and ")}` : "";
      alert(
        "Demo Data Added",
        `${sessions} sessions and ${sets} sets spread over the last five weeks${extrasNote}. Pull to refresh a screen to see them.`,
        [{ text: "OK" }],
        "success",
      );
    } catch (error) {
      console.error("Demo fill failed:", error);
      alert(
        "Couldn't Add Demo Data",
        userFacingError(error, "The demo data could not be added. Try again."),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      if (isMountedRef.current) setFillingDemoData(false);
    }
  };

  const handleFillDemoData = () => {
    alert(
      "Fill Demo Data?",
      workoutData?.days?.length
        ? "Adds about five weeks of generated sessions to your current program, plus demo friends and messages, scheduled workouts, tracking and supplement entries, so every screen has something to show. Earlier demo data is replaced."
        : "Creates a sample program and adds about five weeks of generated sessions to it, plus demo friends and messages, scheduled workouts, tracking and supplement entries.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Fill", onPress: runDemoFill },
      ],
      "warning",
    );
  };

  const handleSentryTest = async () => {
    setBusyAction("sentryTest");
    try {
      const result = await sendTestEvent();
      const lines = [
        `DSN configured: ${result.dsn ? "yes" : "NO"}`,
        `SDK enabled: ${result.sdkEnabled ? "yes" : "NO"}`,
        `Crash reporting: ${result.crashReporting ? "on" : "off"}`,
        `Telemetry (logs/metrics): ${result.telemetry ? "on" : "off"}`,
        `Delivered: ${result.flushed ? "yes" : "no"}`,
      ];
      if (!result.dsn) {
        lines.push("", "No EXPO_PUBLIC_SENTRY_DSN in this build, so nothing can be sent.");
      } else if (!result.sdkEnabled) {
        lines.push("", "Debug builds send nothing. Set EXPO_PUBLIC_SENTRY_FORCE_ENABLE=true in .env and rebuild, or test a release APK.");
      } else if (!result.crashReporting && !result.telemetry) {
        lines.push("", "Both consent switches are off, so nothing was sent. Turn one on under Privacy and Data.");
      } else if (result.flushed) {
        lines.push("", "Look for 'OwnGains Sentry test event' in GlitchTip.");
      } else {
        lines.push("", "The event was queued but did not reach GlitchTip. Check connectivity.");
      }
      alert(
        "Crash Reporting Test",
        lines.join("\n"),
        [{ text: "OK" }],
        result.flushed ? "success" : "warning",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleTestAlarm = async () => {
    if (busyAction === "testAlarm") return;
    setBusyAction("testAlarm");
    let scheduled: boolean;
    try {
      scheduled = await scheduleTestAlarm();
    } finally {
      setBusyAction(null);
    }
    const lines = [
      `Exact alarms: ${canScheduleExactAlarms() ? "allowed" : "NOT allowed (may ring late)"}`,
      `Display over other apps: ${canDrawOverlays() ? "allowed" : "NOT allowed (notification only)"}`,
      "",
      scheduled
        ? `The alarm rings in ${TEST_ALARM_DELAY_SECONDS} seconds. Lock the phone to check the lock screen too.`
        : "Could not schedule it: notifications are off or this build has no native alarm module.",
    ];
    alert("Test Alarm", lines.join("\n"), [{ text: "OK" }], scheduled ? "success" : "warning");
  };

  const handleShareDiagnostics = async () => {
    await Share.share({
      message: [
        `OwnGains ${Constants.expoConfig?.version ?? "?"}`,
        `Mode: ${isOffline ? "offline" : "online"}`,
        `Server: ${serverUrl}`,
        `Server version: ${serverInfo?.version ?? "unknown"}`,
        `Local-only features: ${localOnlyFeatures.join(", ") || "none"}`,
        `User id: ${user?.id ?? "-"}`,
        `Crash reporting: ${isCrashReportingEnabled() ? "on" : "off"}`,
        `Telemetry: ${isTelemetryEnabled() ? "on" : "off"}`,
        `Pending sync ops: ${pendingSyncs.length}`,
      ].join("\n"),
    });
  };

  const handleRemoveDemoData = () => {
    alert(
      "Remove Demo Data?",
      "Deletes every demo session, demo friend, tracking entry and supplement created by Fill Demo Data. Your own data is kept.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            setBusyAction("removeDemo");
            try {
              const result = (await workoutApi.clearDemoSessions()) as {
                deletedCount?: number;
                deletedFriends?: number;
                deletedTracking?: number;
              } | null;
              const tracked =
                (result?.deletedTracking ?? 0) +
                (await clearDemoTracking(user?.id ?? null));
              demoDataChanged.trigger();
              await syncFromServer();
              const sessions = result?.deletedCount ?? 0;
              const friends = result?.deletedFriends ?? 0;
              showToast(
                sessions || friends || tracked
                  ? `Deleted ${plural(sessions, "session")}, ${plural(friends, "friend")} and ${tracked} tracking ${tracked === 1 ? "entry" : "entries"}.`
                  : "There was no demo data to remove.",
              );
            } catch (error) {
              alert(
                "Couldn't Remove Demo Data",
                userFacingError(error, "The demo data could not be removed. Try again."),
                [{ text: "OK" }],
                "error",
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
      "warning",
    );
  };

  // The confirmation dialog is the only place these actions state what they delete
  // make, so it has to describe the mode the user is actually in.
  const bothStores = isOffline
    ? "All of it is on this device and none of it can be recovered."
    : "Both local data and server data will be deleted. This cannot be undone.";
  const accountCopy = isOffline ? PROFILE_COPY : ACCOUNT_COPY;
  const historyKept = isOffline
    ? "Your completed workout history stays on this device and remains visible in Analytics."
    : "Your completed workout history on the server will remain intact and visible in Analytics.";

  const clearData = async (password: string) => {
    setBusyAction("clearData");
    try {
      const serverResp = (await workoutApi.deleteAllUserData(password)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (serverResp && typeof serverResp === "object") {
        if (serverResp.success === false) {
          throw new Error(serverResp.error || "Server refused to delete data");
        }
        if (serverResp.error) {
          throw new Error(serverResp.error);
        }
      }

      await clearAllData();
      setShowClearDataModal(false);

      alert(
        "Success",
        isOffline
          ? "All data has been cleared from this device."
          : "All data has been cleared (local and server)",
        [{ text: "OK" }],
        "success",
      );
    } catch (error) {
      console.error("Error clearing data:", error);
      alert(
        "Couldn't Clear Data",
        userFacingError(error, "Your data could not be cleared. Try again."),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleClearData = () => {
    alert(
      "Clear All Data?",
      `This will delete your workout plan, selected profile, and all progress. ${bothStores}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () =>
            isOffline ? clearData("") : setShowClearDataModal(true),
        },
      ],
      "error",
    );
  };

  const handleResetProgress = () => {
    const hasActiveSession = !!workoutStartTime;

    alert(
      "Reset All Progress?",
      hasActiveSession
        ? `⚠️ You have an active workout session. This will end the session and clear all completed sets and unlock all days. ${bothStores}`
        : `This will clear all completed sets and unlock all days. ${bothStores}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            setBusyAction("resetProgress");
            try {
              if (hasActiveSession) {
                await clearActiveWorkout();
              }

              // Three outcomes, not two: with no split selected nothing is
              // sent anywhere, which is not the same as a successful clear.
              let serverOutcome: "cleared" | "failed" | "not_attempted" =
                "not_attempted";
              if (selectedSplit) {
                try {
                  await workoutApi.deleteAllSessionsForSplit(selectedSplit);
                  serverOutcome = "cleared";
                } catch (error) {
                  serverOutcome = "failed";
                  console.error("Failed to delete server data:", error);
                }
              }

              await saveCompletedDays({});
              await saveLockedDays({});

              const resetMessage = {
                cleared: isOffline
                  ? "All progress has been reset."
                  : "All progress has been reset (local and server).",
                failed:
                  "Local progress was reset, but the server could not be reached. Its history is still there.",
                not_attempted:
                  "Local progress was reset. No split is selected, so no logged sessions were deleted.",
              }[serverOutcome];

              alert(
                serverOutcome === "cleared" ? "Success" : "Partly Reset",
                resetMessage,
                [{ text: "OK" }],
                serverOutcome === "cleared" ? "success" : "warning",
              );
            } catch (error) {
              console.error("Error resetting progress:", error);
              alert(
                "Couldn't Reset Progress",
                userFacingError(error, "Your progress was not reset. Try again."),
                [{ text: "OK" }],
                "error",
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
      "warning",
    );
  };

  const [serverUrl, setServerUrlState] = useState(() => getServerUrl());
  useEffect(() => onServerUrlChange(setServerUrlState), []);

  useEffect(() => {
    if (isOffline) return;
    let active = true;
    setServerInfo(undefined);
    void checkServerVersion().then((info) => {
      if (active) setServerInfo(info);
    });
    void getLocalOnlyFeatures().then((features) => {
      if (active) setLocalOnlyFeatures(features);
    });
    return () => {
      active = false;
    };
    // The server URL is a dependency: both answers describe the server they
    // were fetched from, and the rows that show them must not go stale.
  }, [isOffline, serverUrl]);

  const handleChangePassword = async ({
    current: currentPassword,
    next: newPassword,
    confirm: confirmNewPassword,
  }: PasswordChangeInput) => {
    if (!currentPassword || !newPassword) {
      alert(
        "Missing Fields",
        "Enter your current password and a new one.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    if (newPassword !== confirmNewPassword) {
      alert(
        "Passwords Don't Match",
        "The new password and its confirmation are different.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    // The rule the modal states, enforced here rather than only by the server.
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      alert("Password Too Weak", `${policyError}.`, [{ text: "OK" }], "error");
      return;
    }
    if (newPassword === currentPassword) {
      // A no-op change still signs every other device out.
      alert(
        "Same Password",
        "The new password is the same as your current one.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      setShowChangePasswordModal(false);
      alert(
        "Password Changed",
        "Your password has been updated. Any other device signed in to this account has been signed out.",
        [{ text: "OK" }],
        "success",
      );
    } catch (error) {
      alert(
        "Couldn't Change Password",
        userFacingError(error, "Your password was not changed. Try again."),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setChangingPassword(false);
    }
  };

  const handleUnlinkGoogle = async (password: string) => {
    setUnlinkingGoogle(true);
    const result = await unlinkGoogle(password);
    setUnlinkingGoogle(false);
    if (result.success) {
      setShowUnlinkGoogleModal(false);
      alert("Google Unlinked", "Sign in with your password from now on.", [{ text: "OK" }], "success");
    } else {
      alert(
        "Couldn't Unlink Google",
        result.error ?? "Google is still linked. Try again.",
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const runExport = async (passphrase: string) => {
    setExportingData(true);
    try {
      const data = await authService.exportAccountData();
      const omitted = isDeviceBackup(data) ? (data.photosOmitted ?? 0) : 0;
      const saved = await writeJsonExport(
        "owngains-account-export",
        passphrase ? await encryptExport(data, passphrase) : data,
      );
      setShowExportPassphraseModal(false);
      trackFeature("backup", "export", { encrypted: Boolean(passphrase) });
      const omittedWord = omitted === 1 ? "photo was" : "photos were";
      const photoNote =
        omitted > 0
          ? `Includes your newest progress photos. ${omitted} older ${omittedWord} left out to keep the file a workable size.`
          : "Includes your progress photos.";
      const safetyNote = passphrase
        ? "The file is encrypted. Without the passphrase it cannot be restored, and there is no way to recover it."
        : "Keep this file safe. Restoring it puts everything back.";
      alert(
        "Data Exported",
        `${saved.fileName}\n${DESTINATION_TEXT[saved.destination]}

${photoNote} ${safetyNote}`,
        [{ text: "OK" }],
        "success",
      );
    } catch (error) {
      alert(
        "Export Failed",
        userFacingError(error, "Could not export your data"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setExportingData(false);
    }
  };

  const handleExportData = (
    exportPassphrase: string,
    confirmExportPassphrase: string,
  ) => {
    if (exportPassphrase !== confirmExportPassphrase) {
      alert(
        "Passphrases Don't Match",
        "The passphrase and its confirmation are different.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    if (exportPassphrase && exportPassphrase.length < MIN_EXPORT_PASSPHRASE) {
      alert(
        "Passphrase Too Short",
        `The file's protection is only as strong as this passphrase. Use at least ${MIN_EXPORT_PASSPHRASE} characters, or a few unrelated words.`,
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    if (!exportPassphrase) {
      alert(
        "Export Without Encryption?",
        "The file will contain your email, full workout history, body measurements and every progress photo in readable form. Anything that can read your storage can read all of it.",
        [
          { text: "Set a Passphrase", style: "cancel" },
          {
            text: "Export Unencrypted",
            style: "destructive",
            onPress: () => void runExport(""),
          },
        ],
        "warning",
      );
      return;
    }
    void runExport(exportPassphrase);
  };

  const performRestore = async (backup: DeviceBackup, mode: ImportMode) => {
    setRestoringData(true);
    try {
      const { photosOmitted } = await trackSpan(
        "backup.restore",
        () => restoreDeviceBackup(backup, mode),
        { restore_mode: mode },
      );
      trackFeature("backup", "restore", { restore_mode: mode });
      const photoNoun = photosOmitted === 1 ? "photo was" : "photos were";
      const photoNote =
        photosOmitted > 0
          ? `

${photosOmitted} progress ${photoNoun} too large to fit in this backup and could not be restored. Those entries will show as missing images.`
          : "";
      alert(
        "Backup Restored",
        (mode === "merge"
          ? "The backup has been merged into your data. OwnGains returns to setup so every screen picks it up."
          : "Your data has been restored. OwnGains returns to setup so every screen picks up the restored data.") +
          photoNote,
        [{ text: "OK", onPress: () => void restartOnboarding() }],
        "success",
      );
    } catch (error) {
      alert(
        "Restore Failed",
        userFacingError(error, "Could not restore the backup"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setRestoringData(false);
    }
  };

  const promptReplaceData = (parsed: unknown) => {
    if (!isDeviceBackup(parsed)) {
      alert(
        "Unrecognized File",
        "Pick an OwnGains backup (the JSON from Export My Data) or a Strength Level CSV export.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    alert(
      "Restore Backup",
      `From the backup taken on ${new Date(parsed.exportedAt).toLocaleString()}.\n\nMerge keeps what is on this device and adds the backup on top, so anything you deleted since then comes back. Replace wipes this device first, so anything logged since then is lost.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Merge",
          onPress: () => void performRestore(parsed, "merge"),
        },
        {
          text: "Replace",
          style: "destructive",
          onPress: () => void performRestore(parsed, "replace"),
        },
      ],
      "warning",
    );
  };

  const handleDecryptRestore = async (restorePassphrase: string) => {
    if (!pendingEncryptedBackup) return;
    setDecryptingBackup(true);
    try {
      const backup = await decryptExport(
        pendingEncryptedBackup,
        restorePassphrase,
      );
      setPendingEncryptedBackup(null);
      promptReplaceData(backup);
    } catch (error) {
      alert(
        "Restore Failed",
        userFacingError(error, "Could not decrypt that backup"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setDecryptingBackup(false);
    }
  };

  const handleRestoreData = async () => {
    try {
      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: [
          "application/json",
          "text/csv",
          "text/comma-separated-values",
          "public.comma-separated-values-text",
          "*/*",
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (pickerResult.canceled) return;

      const asset = pickerResult.assets?.[0];
      const fileUri = asset?.uri;
      if (!fileUri) return;

      // Android file providers routinely report a .csv as text/plain or
      // octet-stream, so the picker filter can't be trusted. Check the file name extension instead.
      if (!/\.(json|csv)$/i.test(asset.name ?? fileUri)) {
        alert(
          "Unsupported File",
          "Pick an OwnGains backup (.json from Export My Data) or a Strength Level export (.csv).",
          [{ text: "OK" }],
          "error",
        );
        return;
      }

      const fileText = await new ExpoFile(fileUri).text();
      const looksLikeJson = /^\s*[[{]/.test(fileText);
      let parsed: unknown;
      try {
        parsed = JSON.parse(fileText);
      } catch {
        if (looksLikeJson) {
          alert(
            "Damaged Backup",
            "That file starts like an OwnGains backup but is incomplete or corrupted, so it can't be restored. Try another copy of the export.",
            [{ text: "OK" }],
            "error",
          );
          return;
        }
        await performCSVImport(fileText);
        return;
      }

      if (isEncryptedExport(parsed)) {
        setPendingEncryptedBackup(parsed);
        return;
      }

      promptReplaceData(parsed);
    } catch (error) {
      alert(
        "Restore Failed",
        userFacingError(error, "Could not read that file"),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const openBlockedUsers = async () => {
    setShowBlockedModal(true);
    setLoadingBlocked(true);
    setBlockedError(false);
    try {
      setBlockedUsers(await friendsApi.getBlockedUsers());
    } catch (error) {
      console.error("Error loading blocked users:", error);
      setBlockedError(true);
    } finally {
      setLoadingBlocked(false);
    }
  };

  const unblock = async (blocked: BlockedUser) => {
    try {
      await friendsApi.unblockUser(blocked.id);
      setBlockedUsers((prev) => prev.filter((b) => b.id !== blocked.id));
      showToast(`${blocked.username} unblocked`);
    } catch (error) {
      alert(
        "Couldn't Unblock",
        userFacingError(error, `${blocked.username} is still blocked. Try again.`),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const handleUnblock = (blocked: BlockedUser) => {
    alert(
      `Unblock ${blocked.username}?`,
      "They will be able to find you and send requests again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Unblock", onPress: () => void unblock(blocked) },
      ],
      "warning",
    );
  };

  const saveConsent = async (
    enabled: boolean,
    setLocal: (on: boolean) => void,
    persist: (on: boolean) => Promise<void>,
  ) => {
    setLocal(enabled);
    try {
      await persist(enabled);
    } catch (error) {
      console.warn("Saving a consent setting failed:", error);
      setLocal(!enabled);
      alert(
        "Couldn't Save Setting",
        "The switch was put back. Try again.",
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const handleToggleCrashReporting = (enabled: boolean) =>
    saveConsent(enabled, setCrashReporting, setCrashReportingEnabled);

  const handleToggleTelemetry = (enabled: boolean) =>
    saveConsent(enabled, setTelemetry, setTelemetryEnabled);

  const handleDeleteAccount = async ({
    password: deleteAccountPassword,
    confirmText,
  }: DeleteAccountInput) => {
    if (isOffline && !isDeleteConfirmed(confirmText)) {
      alert(
        "Confirmation Required",
        'Type DELETE to confirm that you want to erase everything on this device.',
        [{ text: "OK" }],
        "warning",
      );
      return;
    }
    if (!isOffline && !googleOnly && !deleteAccountPassword) {
      alert(
        "Password Required",
        "Enter your password to confirm account deletion.",
        [{ text: "OK" }],
        "warning",
      );
      return;
    }
    setDeletingAccount(true);
    try {
      // The Google proof comes first, so cancelling it leaves the marketplace untouched.
      const idToken = googleOnly ? await getGoogleIdToken() : undefined;
      const proofPassword = googleOnly ? null : deleteAccountPassword;
      // Before the account goes: afterwards the token no longer proves who published the skins.
      if (await canAuthenticate()) {
        await authService.verifyIdentity(proofPassword, idToken);
        try {
          await forgetMe();
        } catch (error) {
          captureException(error, { stage: "deleteAccount.forgetMe" });
          showToast("Your marketplace skins could not be anonymized. Email the operator to finish.");
        }
      }
      await authService.deleteAccount(proofPassword, idToken);
    } catch (error) {
      if (error instanceof GoogleSignInCancelledError) {
        setDeletingAccount(false);
        return;
      }
      console.error("Error deleting account:", error);
      alert(
        "Couldn't Delete Account",
        userFacingError(error, "Your account was not deleted. Try again."),
        [{ text: "OK" }],
        "error",
      );
      setDeletingAccount(false);
      return;
    }
    try {
      await clearAllData();
    } catch (error) {
      captureException(error, { stage: "deleteAccount.clearLocal" });
      alert(
        "Account deleted",
        "Your account is gone, but some data on this device couldn't be removed. Clear the app's storage in Android settings to remove it.",
        [{ text: "OK" }],
        "warning",
      );
    }
    setShowDeleteAccountModal(false);
    setDeletingAccount(false);
    await logout();
  };

  const handleLogout = async () => {
    alert(
      "Sign out?",
      "You can sign back in any time.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ],
      "warning",
    );
  };

  const handleUnlockAllDays = () => {
    const hasActiveSession = !!workoutStartTime;

    alert(
      "Unlock All Days?",
      hasActiveSession
        ? `⚠️ You have an active workout session. Unlocking will end this session and clear its data.\n\n${historyKept}`
        : `This will unlock all days for editing. ${historyKept}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: hasActiveSession ? "End Session & Unlock" : "Unlock All",
          style: hasActiveSession ? "destructive" : "default",
          onPress: async () => {
            setBusyAction("unlockAll");
            try {
              if (hasActiveSession) {
                await clearActiveWorkout();
              }

              await saveLockedDays({});

              const allDayNumbers =
                workoutData?.days?.reduce(
                  (acc, d: WorkoutDay) => ({ ...acc, [d.dayNumber]: true }),
                  {},
                ) || {};

              await saveUnlockedOverrides(allDayNumbers);

              showToast(
                hasActiveSession
                  ? "Session ended and all days unlocked"
                  : "All days unlocked",
              );
            } catch (error) {
              console.error("Error unlocking days:", error);
              alert(
                "Couldn't Unlock Days",
                userFacingError(error, "Your days are still locked. Try again."),
                [{ text: "OK" }],
                "error",
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
      "lock",
    );
  };

  const handleResetSingleDay = (dayNumber: number) => {
    const day = workoutData?.days.find(
      (d: WorkoutDay) => d.dayNumber === dayNumber,
    );
    const dayTitle = day
      ? (day.dayTitle ?? day.primaryMuscles?.join("/") ?? `Day ${dayNumber}`)
      : `Day ${dayNumber}`;
    const hasActiveSession = !!workoutStartTime;
    const isCurrentDay = dayNumber === currentDay;
    const willAffectActiveSession = hasActiveSession && isCurrentDay;

    alert(
      "Reset Day?",
      willAffectActiveSession
        ? `⚠️ You have an active workout session on ${dayTitle}. Unlocking will end this session and clear its data.\n\n${historyKept}`
        : `This will unlock ${dayTitle} for editing and clear its completed sets locally. ${historyKept}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: willAffectActiveSession ? "End Session & Reset" : "Reset Day",
          style: willAffectActiveSession ? "destructive" : "default",
          onPress: async () => {
            setBusyAction(`resetDay:${dayNumber}`);
            try {
              if (willAffectActiveSession) {
                await clearActiveWorkout();
              }

              await resetDay(dayNumber);

              setShowResetDayModal(false);
              showToast(`${dayTitle} has been unlocked.`);
            } catch (error) {
              console.error("Error resetting day:", error);
              alert(
                "Couldn't Unlock Day",
                userFacingError(error, `${dayTitle} is still locked. Try again.`),
                [{ text: "OK" }],
                "error",
              );
            } finally {
              setBusyAction(null);
            }
          },
        },
      ],
      willAffectActiveSession ? "warning" : "info",
    );
  };

  const handleSaveTimeBetweenSets = (value: number) => {
    saveTimeBetweenSets(value);
    setShowTimeBetweenSetsModal(false);
    showToast(`Time between sets set to ${formatDuration(value)}`);
  };

  const confirmEnableManualTime = () => {
    alert(
      "Use Manual Time?",
      "This will use your manually set time instead of the average calculated from your workout sessions.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Use Manual",
          onPress: () => toggleUseManualTime(true),
        },
      ],
      "info",
    );
  };

  const [syncStartCount, setSyncStartCount] = useState<number | null>(null);
  const handleManualSync = async () => {
    const before = pendingSyncs.length;
    await syncPendingData();
    setSyncStartCount(before);
  };
  // Runs on the render after the sync, once pendingSyncs reflects what is left.
  useEffect(() => {
    if (syncStartCount === null) return;
    showToast(syncResultMessage(syncStartCount, pendingSyncs.length));
    setSyncStartCount(null);
  }, [syncStartCount, pendingSyncs.length]);

  const getCompletedDaysCount = () => Object.keys(completedDays).length;

  const noLocalProgress = getCompletedDaysCount() === 0;
  const progressActionsDisabled = noLocalProgress || busyAction !== null;
  const restoreBusy = restoringData || isImporting;

  const getTotalCompletedSets = () => {
    let total = 0;
    Object.values(completedDays).forEach((day: CompletedExercises) => {
      Object.values(day).forEach((exercise) => {
        total += Object.keys(exercise).length;
      });
    });
    return total;
  };

  const getLockedDaysCount = () =>
    Object.keys(lockedDays).filter((day) => lockedDays[Number(day)]).length;

  const getDaysWithActivity = () => {
    if (!workoutData?.days) return [];
    return workoutData.days.filter(
      (day: WorkoutDay) =>
        completedDays[day.dayNumber] || lockedDays[day.dayNumber],
    );
  };

  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);

  const [profileName, setProfileName] = useState<string>(user?.name ?? "");
  const [profileEmail, setProfileEmail] = useState<string>(user?.email ?? "");
  const [profileEmailPassword, setProfileEmailPassword] = useState<string>("");
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
  const [savedAvatarUri, setSavedAvatarUri] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState<boolean>(false);

  // Not while the modal is open: a silent token refresh or any refreshUser()
  // would otherwise overwrite what the user is halfway through typing.
  useEffect(() => {
    if (showAccountModal) return;
    setProfileName(user?.name ?? "");
    setProfileEmail(user?.email ?? "");
    setProfileEmailPassword("");
  }, [user?.name, user?.email, showAccountModal]);

  // Namespaced like every other per-user key: un-namespaced, a second account
  // on the phone reads the first one's photo, clearUserData never removes it,
  // and every export includes it.
  const profileExtraKey = useCallback(
    (key: string) => getUserKey(key, user?.id == null ? null : String(user.id)),
    [user?.id],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const key = profileExtraKey("@profile_avatar");
        const avatar =
          (await loadProfileAvatar(key)) ??
          (await restoreProfileAvatar(key, profilePhotoApi.download));
        if (cancelled) return;
        setProfileAvatarUri(avatar);
        setSavedAvatarUri(avatar);
      } catch (err) {
        console.warn("Failed loading profile extras:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profileExtraKey]);

  // ImagePicker hands back a cache-directory URI, which Android reclaims. The
  // stored reference would then dangle and the avatar render broken.
  const persistAvatar = async (uri: string): Promise<string> => {
    try {
      const dir = `${FileSystem.documentDirectory}profile/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(
        () => {},
      );
      const dest = `${dir}avatar-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      return dest;
    } catch (err) {
      console.warn("Could not copy the avatar out of the cache:", err);
      return uri;
    }
  };

  const pickAvatar = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: true,
        quality: 0.7,
      });
      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (uri) setProfileAvatarUri(await persistAvatar(uri));
    } catch (err) {
      console.error("Image pick error:", err);
      alert("Image Error", "Unable to pick image", [{ text: "OK" }], "error");
    }
  };

  /** False when nothing was saved, so the caller can leave the modal open. */
  const handleSaveProfile = async (): Promise<boolean> => {
    const name = profileName.trim();
    const email = profileEmail.trim();
    // The same rules the signup screen states for the same field.
    if (email && (email.length > 254 || !PROFILE_EMAIL_PATTERN.test(email))) {
      alert(
        "Invalid Email",
        "Enter a valid email address, like you@example.com.",
        [{ text: "OK" }],
        "error",
      );
      return false;
    }

    const emailChanged =
      !isOffline && email.toLowerCase() !== (user?.email ?? "").toLowerCase();
    if (emailChanged && !profileEmailPassword) {
      alert(
        "Password Required",
        "Enter your current password to change your email.",
        [{ text: "OK" }],
        "error",
      );
      return false;
    }

    setSavingProfile(true);
    try {
      const result = await updateProfile({
        name,
        email,
        ...(emailChanged && { currentPassword: profileEmailPassword }),
      });
      if (!result.success) {
        alert(
          "Update Failed",
          result.error ?? "Could not update profile",
          [{ text: "OK" }],
          "error",
        );
        return false;
      }
      setProfileName(name);
      setProfileEmail(email);
      setProfileEmailPassword("");
      if (profileAvatarUri !== savedAvatarUri) {
        await saveProfileAvatar(
          profileExtraKey("@profile_avatar"),
          profileAvatarUri,
        );
        setSavedAvatarUri(profileAvatarUri);
        (profileAvatarUri
          ? profilePhotoApi.upload(profileAvatarUri)
          : profilePhotoApi.remove()
        ).catch((err: unknown) => {
          console.warn("Profile photo sync failed:", err);
          showToast("Photo saved on this device only. Couldn't sync it to the server.");
        });
      }
      showToast("Profile updated");
      await refreshUser();
      return true;
    } catch (error) {
      console.error("Save profile error:", error);
      alert(
        "Couldn't Save Profile",
        userFacingError(error, "Your profile was not saved. Try again."),
        [{ text: "OK" }],
        "error",
      );
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const doMigrateOffline = (withdrawHealthConsent = false): Promise<boolean> =>
    runOfflineMigration({
      user,
      selectedSplit,
      profileAvatarUri,
      withdrawHealthConsent,
    });

  const withdrawHealthConsent = () => {
    alert(
      "Withdraw Health Consent",
      "The server will permanently delete your workout history and any body data it stores, and the app will switch to offline mode, copying your current plan and all your workout history to this device. Export My Data first if you want a full copy. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: async () => {
            setBusyAction("migrateOffline");
            const ok = await doMigrateOffline(true).finally(() =>
              setBusyAction(null),
            );
            if (!ok)
              alert(
                "Couldn't Withdraw Consent",
                "Consent could not be withdrawn. Nothing was deleted. Check your connection and try again. If it keeps failing, this server may be too old to record a withdrawal: use Clear All Data instead.",
                [{ text: "OK" }],
                "error",
              );
          },
        },
      ],
      "warning",
    );
  };

  const migrateToOffline = async () => {
    const runMigrate = async () => {
      setBusyAction("migrateOffline");
      const ok = await doMigrateOffline().finally(() => setBusyAction(null));
      if (ok) {
        alert(
          "Moved to This Device",
          "Your data has been copied to an offline profile and you can continue where you left off.",
          [{ text: "OK" }],
          "success",
        );
      } else {
        alert(
          "Couldn't Move to This Device",
          "Nothing was changed and you are still signed in. Check your connection and try again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Retry", onPress: () => void runMigrate() },
          ],
          "error",
        );
      }
    };
    alert(
      "Migrate to Offline",
      "This will create a local offline account using your current profile data and switch the app to offline mode. All local app state (workout plan, progress, and session history) will be copied to the offline profile so you can continue where you left off. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Migrate",
          onPress: runMigrate,
        },
      ],
      "warning",
    );
  };

  const migrateToOnline = () => {
    alert(
      "Change Storage Mode",
      "This takes you back to the setup screen to choose how OwnGains stores your data. Picking a server will log you out and require you to sign in. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          onPress: () => {
            restartOnboarding().catch((error: unknown) => {
              console.error("Restarting onboarding failed:", error);
              alert(
                "Couldn't Open Setup",
                userFacingError(error, "The setup screen could not be opened. Try again."),
                [{ text: "OK" }],
                "error",
              );
            });
          },
        },
      ],
      "info",
    );
  };

  const [page, setPage] = useState<SettingsPage | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!page) return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        setPage(null);
        return true;
      });
      return () => sub.remove();
    }, [page]),
  );

  const renderAccountPage = (): React.JSX.Element => (
    <>
      <SettingsGroup>
        <SettingsRow
          label={accountCopy.row}
          description={user?.name ?? user?.username ?? "View or edit your account"}
          onPress={() => setShowAccountModal(true)}
          accessibilityLabel={accountCopy.editLabel}
        />
        {!isOffline && !googleOnly && (
          <SettingsRow
            label="Change Password"
            description="Signs out every other device"
            onPress={() => setShowChangePasswordModal(true)}
            accessibilityLabel="Change your password"
          />
        )}
        {!isOffline && !googleOnly && user?.googleLinked && (
          <SettingsRow
            label="Google Account"
            description="Linked. You can also sign in with Google"
            value="Unlink"
            onPress={() => setShowUnlinkGoogleModal(true)}
            accessibilityLabel="Unlink your Google account"
          />
        )}
        {!isOffline && (
          <SettingsRow
            label="Sign Out"
            description="Your data stays on the server"
            destructive
            onPress={handleLogout}
            accessibilityLabel="Sign out of this device"
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Danger zone"
        danger
        footer="Deleting your account cannot be undone. Export your data under Privacy and Data first if you might want it back."
      >
        <SettingsRow
          label="Delete Account"
          description="Permanently remove your account and all of its data"
          destructive
          disabled={busyAction !== null}
          onPress={() => setShowDeleteAccountModal(true)}
          accessibilityLabel="Delete my account permanently"
        />
      </SettingsGroup>
    </>
  );

  const renderWorkoutPage = (): React.JSX.Element => (
    <>
      <SettingsGroup title="During a workout">
        <SettingsRow
          icon="⏱️"
          label="Time Between Sets"
          description={
            useManualTime
              ? "Used for rest reminders and workout estimates"
              : "Fallback when the server has no timing data yet"
          }
          value={formatDuration(timeBetweenSets)}
          onPress={() => setShowTimeBetweenSetsModal(true)}
          accessibilityLabel="Change the time between sets"
        />
        <SettingsRow
          icon="🕐"
          label="Use Manual Time"
          description="Always use your own time instead of server timing"
          toggle={{
            value: useManualTime,
            label: "Use manual time between sets",
            onChange: (on) => {
              trackFeature("settings", "toggle", { setting: "manual_time", on });
              if (on) confirmEnableManualTime();
              else void toggleUseManualTime(false);
            },
          }}
        />
        <SettingsRow
          icon="🏆"
          label="PR Celebration"
          description="Celebrate a set that beats your best estimated 1RM"
          toggle={{
            value: prCelebration,
            label: "Celebrate personal records",
            onChange: (on) =>
              saveWorkoutPref(STORAGE_KEYS.PR_CELEBRATION, setPrCelebration, on),
          }}
        />
        <SettingsRow
          icon="📈"
          label="Auto-Progression Prompt"
          description="Suggest the next weight from your reps and reps in reserve"
          toggle={{
            value: autoProgression,
            label: "Suggest auto-progression between sets",
            onChange: (on) =>
              saveWorkoutPref(STORAGE_KEYS.AUTO_PROGRESSION, setAutoProgression, on),
          }}
        />
      </SettingsGroup>

      <SettingsGroup title="Undertrained muscles">
        <SettingsRow
          icon="🎯"
          label="Suggestions"
          description="Exercises for muscles that are behind this week"
          value={
            DISPLAY_MODE_OPTIONS.find((o) => o.key === undertrainedDisplayMode)
              ?.label ?? undertrainedDisplayMode
          }
          onPress={() => setShowDisplayModeMenu(true)}
          accessibilityLabel="Change how undertrained muscles are surfaced"
        />
      </SettingsGroup>

      <SettingsGroup title="Compare against">
        {CALCULATION_MODE_OPTIONS.map((option) => {
          const isSelected = undertrainedCalculationMode === option.key;
          return (
            <SettingsRow
              key={option.key}
              label={option.label}
              description={option.description}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              onPress={() => handleSetUndertrainedCalculationMode(option.key)}
              right={
                <Text
                  style={[styles.radioMark, isSelected && styles.radioMarkActive]}
                  importantForAccessibility="no"
                >
                  {isSelected ? "✓" : ""}
                </Text>
              }
            />
          );
        })}
      </SettingsGroup>

      <SettingsGroup title="History">
        <SettingsRow
          icon="✏️"
          label="Edit Workout History"
          description="Fix the name, muscles or time of logged and imported sets"
          onPress={() => {
            if (!selectedSplit) {
              alert(
                "No Split Selected",
                "Select a split before editing workout history.",
                [{ text: "OK" }],
                "error",
              );
              return;
            }
            setShowEditHistoryModal(true);
          }}
          accessibilityLabel="Edit workout history"
        />
        <SettingsRow
          icon="📅"
          label="Unlock Single Day"
          description={
            noLocalProgress ? NO_LOCAL_PROGRESS_HINT : "Clear this device's sets for one day"
          }
          disabled={progressActionsDisabled}
          onPress={() => setShowResetDayModal(true)}
          accessibilityLabel="Unlock one day"
        />
        <SettingsRow
          icon="🔓"
          label="Unlock All Days"
          description={
            noLocalProgress ? NO_LOCAL_PROGRESS_HINT : "Clear this device's sets for every day"
          }
          destructive
          busy={busyAction === "unlockAll"}
          disabled={progressActionsDisabled}
          onPress={handleUnlockAllDays}
          accessibilityLabel="Unlock all days"
        />
      </SettingsGroup>

      {selectedSplit && workoutData && (
        <View style={styles.progressGroup}>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            Progress
          </Text>
          {renderProgressCard()}
        </View>
      )}
    </>
  );

  const renderAppearancePage = (): React.JSX.Element => (
    <SettingsGroup>
      <SettingsRow
        label="Theme"
        description="Customize app colors and appearance"
        onPress={() => setShowThemeEditor(true)}
        accessibilityLabel="Edit the app theme"
      />
      <SettingsRow
        label="Tab Order"
        description="Rearrange the screens in the bottom bar"
        onPress={() => void openTabOrder()}
        accessibilityLabel="Reorder the bottom tabs"
      />
      <SettingsRow
        label="Skins"
        description="Browse, import, export and share themes and widget layouts"
        onPress={() => navigation.navigate("Skins")}
        accessibilityLabel="Open skins"
      />
    </SettingsGroup>
  );

  const renderSyncGroup = (): React.JSX.Element | null => {
    if (pendingSyncs.length === 0 && droppedSyncCount === 0) return null;
    return (
      <SettingsGroup
        title="Sync"
        footer={
          pendingSyncs.length > 0
            ? "Your workout data is stored on this device until it syncs with the server."
            : undefined
        }
      >
        {pendingSyncs.length > 0 && (
          <SettingsRow
            label="Pending Syncs"
            description={`${countChanges(pendingSyncs.length)} waiting to sync`}
            right={<Text style={styles.warningValue}>{pendingSyncs.length}</Text>}
          />
        )}
        {droppedSyncCount > 0 && (
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Discarded Syncs</Text>
              <Text style={styles.settingDescription}>
                {countChanges(droppedSyncCount)} could not be synced and were
                discarded. They are listed below so you can log them again from
                the Workout screen. Edit Workout History can only correct sets
                that were saved.
              </Text>
              {droppedSyncs.slice(-5).map((drop, index) => (
                <Text
                  key={`${drop.at}-${drop.type}-${drop.reason}-${index}`}
                  style={styles.droppedItem}
                >
                  {describeDroppedSync(drop)}
                </Text>
              ))}
              <TouchableOpacity
                style={styles.retryButton}
                onPress={acknowledgeDroppedSyncs}
                accessibilityRole="button"
                accessibilityLabel="Dismiss the discarded sync list"
              >
                <Text style={styles.retryButtonText}>Dismiss</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.warningValue}>{droppedSyncCount}</Text>
          </View>
        )}
        {pendingSyncs.length > 0 && (
          <SettingsRow
            label="Sync Now"
            busy={isSyncing}
            disabled={isSyncing}
            onPress={handleManualSync}
            accessibilityLabel="Sync pending workout data now"
            anchorRef={tutorialAnchor("settings.sync")}
          />
        )}
      </SettingsGroup>
    );
  };

  const renderServerGroup = (): React.JSX.Element | null => {
    if (isOffline) return null;
    let versionAccessory: React.ReactNode = (
      <ActivityIndicator
        color={colors.textMuted}
        accessibilityLabel="Checking the server version"
      />
    );
    if (serverInfo !== undefined)
      versionAccessory = (
        <Text style={[styles.infoValue, serverInfo?.outdated && styles.dangerText]}>
          {serverInfo ? serverInfo.version : "Unknown"}
        </Text>
      );
    return (
      <SettingsGroup
        title="Server"
        footer="Changing the server signs you out and takes you back to the setup screen, where the server address is set."
      >
        <SettingsRow
          label="Connected To"
          description={serverUrl}
          value="Change"
          onPress={migrateToOnline}
          accessibilityLabel="Sign out and choose a different server or on-device storage"
        />
        {localOnlyFeatures.length > 0 && (
          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.settingLabel}>Kept On This Device</Text>
              <View style={styles.warningBox}>
                <Text style={styles.warningBoxTitle}>
                  {describeLocalOnlyFeatures(localOnlyFeatures)} are not stored
                  on this server.
                </Text>
                <Text style={styles.settingDescription}>
                  They are kept on this phone only. They will not sync to your
                  other devices, and they are gone if you uninstall OwnGains or
                  lose the phone. Use Export My Data under Privacy and Data to
                  keep a copy.
                </Text>
              </View>
            </View>
          </View>
        )}
        <SettingsRow
          label="Server Version"
          description={
            serverInfo?.outdated
              ? `This server runs ${serverInfo.version}. Version ${MIN_SERVER_VERSION} or newer is needed for blocking, reporting, data export and changing day mid-workout. Ask its operator to update.`
              : "The version of OwnGains-Server you are signed in to"
          }
          right={versionAccessory}
        />
      </SettingsGroup>
    );
  };

  const renderStoragePage = (): React.JSX.Element => (
    <>
      {renderSyncGroup()}
      {renderServerGroup()}
      <HealthConnectSection styles={styles} userId={user?.id ?? null} alert={alert} />
      <SettingsGroup title="Storage mode">
        {isOffline ? (
          <SettingsRow
            label="Change Storage Mode"
            description="Go back to setup to switch between this device and a server"
            onPress={migrateToOnline}
            accessibilityLabel="Change storage mode"
          />
        ) : (
          <SettingsRow
            label="Migrate to Offline Account"
            description="Create a local profile and switch the app to offline mode"
            busy={busyAction === "migrateOffline"}
            disabled={busyAction !== null}
            onPress={migrateToOffline}
            accessibilityLabel="Migrate to an offline account"
          />
        )}
      </SettingsGroup>
    </>
  );

  const renderPrivacyPage = (): React.JSX.Element => (
    <>
      <SettingsGroup title="Your data">
        <SettingsRow
          label="Export My Data"
          description="Save everything this app holds about you as a JSON file, encrypted with a passphrase if you set one"
          busy={exportingData}
          disabled={exportingData}
          onPress={() => setShowExportPassphraseModal(true)}
          accessibilityLabel="Export all of my data to a file"
          anchorRef={tutorialAnchor("settings.exportData")}
        />
        <SettingsRow
          label="Restore Data"
          description="Pick an OwnGains backup to replace everything on this device, or a Strength Level CSV to import its history"
          busy={restoreBusy}
          disabled={restoreBusy}
          onPress={handleRestoreData}
          accessibilityLabel="Restore a backup or import a Strength Level CSV"
        />
        {!isOffline && (
          <SettingsRow
            label="Withdraw Health Consent"
            description="Delete your workouts and body data from the server and switch to offline mode"
            busy={busyAction === "migrateOffline"}
            disabled={busyAction !== null}
            onPress={withdrawHealthConsent}
            accessibilityLabel="Withdraw health data consent"
          />
        )}
      </SettingsGroup>

      <SettingsGroup title="Diagnostics">
        <SettingsRow
          label="Send Crash Reports"
          description="Share anonymous crash diagnostics to help fix bugs"
          toggle={{
            value: crashReporting,
            onChange: handleToggleCrashReporting,
            label: "Send crash reports",
          }}
        />
        <SettingsRow
          label="Usage Metrics"
          description="Share which screens and features you use, workout length and set counts, plus performance traces and diagnostic logs. Never exercise names, weights or notes"
          toggle={{
            value: telemetry,
            onChange: handleToggleTelemetry,
            label: "Send usage metrics and diagnostics",
          }}
        />
      </SettingsGroup>

      {!isOffline && (
        <SettingsGroup title="Friends">
          <SettingsRow
            label="Blocked Users"
            description="Review and unblock people you have blocked"
            onPress={openBlockedUsers}
            accessibilityLabel="Manage blocked users"
          />
        </SettingsGroup>
      )}

      <SettingsGroup title="Legal">
        <SettingsRow
          label="Privacy Policy"
          description="What this app stores, and where"
          onPress={() => navigation.navigate("PrivacyPolicy")}
          accessibilityLabel="Open the privacy policy"
        />
        <SettingsRow
          label="Terms of Service"
          description="The rules for using the app and the official server"
          onPress={() => navigation.navigate("TermsOfService")}
          accessibilityLabel="Open the terms of service"
        />
      </SettingsGroup>

      <SettingsGroup
        title="Danger zone"
        danger
        footer="None of these can be undone, and there is no automatic backup. Export your data first if you might want it back."
      >
        <SettingsRow
          label="Reset Progress"
          description={
            noLocalProgress
              ? NO_LOCAL_PROGRESS_HINT
              : "Delete all set history. To unlock days without deleting anything, use Workout, then History"
          }
          destructive
          busy={busyAction === "resetProgress"}
          disabled={progressActionsDisabled}
          onPress={handleResetProgress}
          accessibilityLabel="Reset all progress"
        />
        <SettingsRow
          label="Clear All Data"
          description="Delete everything"
          destructive
          busy={busyAction === "clearData"}
          disabled={busyAction !== null}
          onPress={handleClearData}
          accessibilityLabel="Clear all data"
        />
      </SettingsGroup>
    </>
  );

  const renderAboutPage = (): React.JSX.Element => (
    <>
      <SettingsGroup>
        <SettingsRow
          label="What's New"
          description="Changes in this version, and every version before it"
          onPress={() => {
            trackFeature("settings", "changelog_open");
            setShowChangelog(true);
          }}
          accessibilityLabel="What's new in this version"
        />
        <SettingsRow label="Version" value={Constants.expoConfig?.version ?? "-"} />
        <SettingsRow
          label="Tutorial"
          description="Replay the tour, or just the chapters you need"
          onPress={() => setShowTutorialMenu(true)}
          accessibilityLabel="Tutorial: replay the whole tour or single chapters"
          anchorRef={tutorialAnchor("settings.tutorial")}
        />
      </SettingsGroup>

      <SettingsGroup title="Open source">
        {[
          {
            label: "App on GitHub",
            description: "Source code, releases and issues",
            url: "https://github.com/Superak0s/OwnGains-App",
          },
          {
            label: "Server on GitHub",
            description: "Self-host your own OwnGains Server",
            url: "https://github.com/Superak0s/OwnGains-Server",
          },
          {
            label: "Open-Source Licences",
            description: "The libraries and data OwnGains is built on",
            url: "https://raw.githubusercontent.com/Superak0s/OwnGains-App/main/docs/third-party-notices.md",
          },
        ].map(({ label, description, url }) => (
          <SettingsRow
            key={url}
            label={label}
            description={description}
            value="↗"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(url)}
          />
        ))}
      </SettingsGroup>
    </>
  );

  const renderDeveloperPage = (): React.JSX.Element => (
    <SettingsGroup
      footer={
        __DEV__
          ? "Debug build: this page is also shown to admin accounts in release APKs"
          : "Shown because this account is an admin"
      }
    >
      {isAdmin && !isOffline && (
        <SettingsRow
          icon="📈"
          label="Server Metrics"
          description="Requests, errors and database health on the server's admin dashboard. Sign in there with this account."
          value="↗"
          accessibilityRole="link"
          onPress={() => void Linking.openURL(`${serverUrl}/admin/metrics`)}
          accessibilityLabel="Open the server metrics dashboard in the browser"
        />
      )}
      <SettingsRow
        icon="✨"
        label="Fill Demo Data"
        description="Generate ~5 weeks of workout sessions (and a sample program if you have none) to check every screen"
        busy={fillingDemoData}
        disabled={fillingDemoData}
        onPress={handleFillDemoData}
        accessibilityLabel="Fill the app with demo workout data"
      />
      <SettingsRow
        icon="🧹"
        label="Remove Demo Data"
        description="Delete the generated sessions, keeping real ones"
        destructive
        busy={busyAction === "removeDemo"}
        disabled={fillingDemoData || busyAction !== null}
        onPress={handleRemoveDemoData}
        accessibilityLabel="Remove demo workout data"
      />
      <SettingsRow
        icon="🔔"
        label="Preview Alert Style"
        description="Tap repeatedly to cycle through every alert variant"
        onPress={() => {
          const preview =
            ALERT_PREVIEWS[alertPreviewIndexRef.current % ALERT_PREVIEWS.length];
          alertPreviewIndexRef.current += 1;
          alert(preview.title, preview.message, preview.buttons, preview.type);
        }}
        accessibilityLabel="Preview the next alert style"
      />
      <SettingsRow
        icon="📡"
        label="Test Crash Reporting"
        description="Send an error, a log and a metric, then report whether they reached GlitchTip and which consent gate stopped them"
        busy={busyAction === "sentryTest"}
        disabled={busyAction === "sentryTest"}
        onPress={handleSentryTest}
        accessibilityLabel="Send a test event to GlitchTip"
      />
      <SettingsRow
        icon="⏰"
        label="Test Alarm"
        description={`Ring a supplement alarm in ${TEST_ALARM_DELAY_SECONDS} seconds and show which alarm permissions are missing`}
        busy={busyAction === "testAlarm"}
        disabled={busyAction === "testAlarm"}
        onPress={() => void handleTestAlarm()}
        accessibilityLabel="Schedule a test supplement alarm"
      />
      <SettingsRow
        icon="📋"
        label="Share Diagnostics"
        description="App version, mode, server, consent flags and pending sync count, the details to attach to a bug report"
        onPress={handleShareDiagnostics}
        accessibilityLabel="Share diagnostics"
      />
    </SettingsGroup>
  );
  const renderProgressCard = (): React.JSX.Element => {
    if (loadingProgress)
      return (
        <View style={styles.card}>
          <ActivityIndicator
            color={colors.accent}
            style={{ paddingVertical: 20 }}
          />
        </View>
      );
    if (progressError)
      return (
        <View style={[styles.card, styles.progressErrorCard]}>
          <Text style={styles.errorText}>
            Progress could not be loaded from the server. Your progress on
            this device is unaffected.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void loadServerProgress()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading progress"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    const stats: ReadonlyArray<[string, string | number]> = [
      ["Days with activity", serverProgress?.daysCount ?? getCompletedDaysCount()],
      ["Sets completed", serverProgress?.setsCount ?? getTotalCompletedSets()],
      ["Locked days", serverProgress?.lockedCount ?? getLockedDaysCount()],
      ["Current day", `Day ${currentDay}`],
    ];
    return (
      <View style={styles.statGrid}>
        {stats.map(([label, value]) => (
          <View
            key={label}
            style={styles.statTile}
            accessible
            accessibilityLabel={`${label}: ${value}`}
          >
            <Text style={styles.statValue}>{value}</Text>
            <Text style={styles.statLabel}>{label}</Text>
          </View>
        ))}
      </View>
    );
  };

  const renderModals = (): React.JSX.Element => (
    <>
      <ModalSheet
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        dirty={
          profileName !== (user?.name ?? "") ||
          profileEmail !== (user?.email ?? "") ||
          profileAvatarUri !== savedAvatarUri
        }
        title={isOffline ? "This Device Profile" : "Account"}
        showCancelButton={false}
        onConfirm={async () => {
          if (await handleSaveProfile()) setShowAccountModal(false);
        }}
        confirmText={savingProfile ? "Saving..." : "Save Profile"}
        confirmDisabled={savingProfile}
        scrollable={true}
      >
        <View style={styles.fullModalContent}>
          <View style={styles.avatarRow}>
            <TouchableOpacity
              onPress={pickAvatar}
              style={styles.avatarButton}
              accessibilityRole="button"
              accessibilityLabel={
                profileAvatarUri
                  ? "Change profile picture"
                  : "Add a profile picture"
              }
            >
              {profileAvatarUri ? (
                <Image
                  source={{ uri: profileAvatarUri }}
                  style={styles.avatarImage}
                  contentFit="cover"
                />
              ) : (
                <Text style={styles.avatarPlaceholder}>Add photo</Text>
              )}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput
                value={profileName}
                onChangeText={setProfileName}
                placeholder="Jane Doe"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
                accessibilityLabel="Full name"
              />
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                value={profileEmail}
                onChangeText={setProfileEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                accessibilityLabel="Email address"
              />
              {!isOffline &&
                profileEmail.trim().toLowerCase() !==
                  (user?.email ?? "").toLowerCase() && (
                  <>
                    <Text style={styles.fieldLabel}>Current password</Text>
                    <TextInput
                      value={profileEmailPassword}
                      onChangeText={setProfileEmailPassword}
                      placeholder="Required to change your email"
                      placeholderTextColor={colors.textMuted}
                      secureTextEntry
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.input}
                      accessibilityLabel="Current password"
                    />
                  </>
                )}
            </View>
          </View>
          {profileAvatarUri && (
            <TouchableOpacity
              onPress={() => setProfileAvatarUri(null)}
              style={styles.removePhotoButton}
              accessibilityRole="button"
              accessibilityLabel="Remove profile picture"
            >
              <Text style={styles.removePhotoText}>Remove photo</Text>
            </TouchableOpacity>
          )}
        </View>
      </ModalSheet>

      <ModalSheet
        visible={showTabOrderModal}
        onClose={() => setShowTabOrderModal(false)}
        title="Tab Order"
        showCancelButton={false}
        confirmText="Done"
        onConfirm={() => setShowTabOrderModal(false)}
        scrollable={true}
      >
        {tabOrder.map((name, index) => {
          const { icon, label } = tabMeta(name, tabOrderRole === "trainer");
          const isFirst = index === 0;
          const isLast = index === tabOrder.length - 1;
          return (
            <View key={name} style={styles.tabOrderRow}>
              <Text style={styles.tabOrderIcon} importantForAccessibility="no">
                {icon}
              </Text>
              <Text style={styles.tabOrderLabel}>
                {label}
                {name === "Friends" && isOffline ? " (online only)" : ""}
              </Text>
              <TouchableOpacity
                style={[styles.tabOrderButton, isFirst && styles.disabledButton]}
                onPress={() => handleMoveTab(index, -1)}
                disabled={isFirst}
                accessibilityRole="button"
                accessibilityLabel={`Move ${label} earlier`}
                accessibilityState={{ disabled: isFirst }}
              >
                <Text style={styles.tabOrderArrow}>▲</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabOrderButton, isLast && styles.disabledButton]}
                onPress={() => handleMoveTab(index, 1)}
                disabled={isLast}
                accessibilityRole="button"
                accessibilityLabel={`Move ${label} later`}
                accessibilityState={{ disabled: isLast }}
              >
                <Text style={styles.tabOrderArrow}>▼</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ModalSheet>

      <ModalSheet
        visible={showDisplayModeMenu}
        onClose={() => setShowDisplayModeMenu(false)}
        title="Show Undertrained Suggestions"
        showCancelButton={false}
        showConfirmButton
        confirmText="Done"
        onConfirm={() => setShowDisplayModeMenu(false)}
      >
        <UndertrainedExample mode={undertrainedDisplayMode} styles={styles} />
        {DISPLAY_MODE_OPTIONS.map((option) => {
          const isSelected = undertrainedDisplayMode === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              activeOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={option.label}
              style={[
                styles.dropdownItem,
                isSelected && styles.dropdownItemSelected,
              ]}
              onPress={() => handleSetUndertrainedDisplayMode(option.key)}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  isSelected && styles.dropdownItemTextSelected,
                ]}
              >
                {option.label}
              </Text>
              {isSelected && (
                <Text
                  style={styles.dropdownItemCheck}
                  importantForAccessibility="no"
                >
                  ✓
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ModalSheet>

      <PasswordConfirmModal
        visible={showClearDataModal}
        onClose={() => setShowClearDataModal(false)}
        onSubmit={clearData}
        busy={busyAction === "clearData"}
        styles={styles}
        title="Clear All Data"
        description="Enter your password to delete your data on this device and on the server. Your account stays."
        confirmText="Clear Everything"
        busyText="Clearing…"
        inputLabel="Current password to confirm clearing all data"
      />

      <DeleteAccountModal
        visible={showDeleteAccountModal}
        onClose={() => setShowDeleteAccountModal(false)}
        onSubmit={handleDeleteAccount}
        busy={deletingAccount}
        isOffline={isOffline}
        googleOnly={googleOnly}
        styles={styles}
      />

      <PasswordConfirmModal
        visible={showUnlinkGoogleModal}
        onClose={() => setShowUnlinkGoogleModal(false)}
        onSubmit={(password) => void handleUnlinkGoogle(password)}
        busy={unlinkingGoogle}
        styles={styles}
        title="Unlink Google"
        description="You will sign in with your password only. Signing in with Google again later asks for this password to link it back."
        confirmText="Unlink"
        busyText="Unlinking…"
        inputLabel="Current password to confirm unlinking Google"
      />

      <ChangePasswordModal
        visible={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        onSubmit={handleChangePassword}
        busy={changingPassword}
        styles={styles}
      />

      <ModalSheet
        visible={showBlockedModal}
        onClose={() => setShowBlockedModal(false)}
        title="Blocked Users"
        showCancelButton={false}
        showConfirmButton={false}
        scrollable={true}
      >
        {loadingBlocked && (
          <ActivityIndicator color={colors.accent} style={{ margin: 24 }} />
        )}
        {!loadingBlocked && blockedError && (
          <>
            <Text style={styles.errorText}>
              The blocked list could not be loaded.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={openBlockedUsers}
              accessibilityRole="button"
              accessibilityLabel="Retry loading blocked users"
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </>
        )}
        {!loadingBlocked && !blockedError && blockedUsers.length === 0 && (
          <Text style={styles.modalDescription}>
            You have not blocked anyone.
          </Text>
        )}
        {!loadingBlocked &&
          !blockedError &&
          blockedUsers.map((blocked) => (
            <View key={String(blocked.id)} style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>{blocked.username}</Text>
                <Text style={styles.settingDescription}>
                  Unblocking does not restore the friendship. You would need to
                  add each other again.
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleUnblock(blocked)}
                style={styles.unblockButton}
                accessibilityRole="button"
                accessibilityLabel={`Unblock ${blocked.username}`}
              >
                <Text style={styles.settingValue}>Unblock</Text>
              </TouchableOpacity>
            </View>
          ))}
      </ModalSheet>

      <TimeBetweenSetsModal
        visible={showTimeBetweenSetsModal}
        onClose={() => setShowTimeBetweenSetsModal(false)}
        onSave={handleSaveTimeBetweenSets}
        current={timeBetweenSets}
        styles={styles}
      />

      <ModalSheet
        visible={showResetDayModal}
        onClose={() => setShowResetDayModal(false)}
        title="Unlock Single Day"
        showCancelButton={false}
        showConfirmButton={false}
        scrollable={true}
      >
        {getDaysWithActivity().length === 0 ? (
          <View style={styles.emptyDayList}>
            <Text style={styles.emptyDayListText}>
              No days with activity yet
            </Text>
          </View>
        ) : (
          getDaysWithActivity().map((day) => (
            <TouchableOpacity
              key={day.dayNumber}
              style={[
                styles.dayListItem,
                busyAction !== null && styles.disabledButton,
              ]}
              onPress={() => handleResetSingleDay(day.dayNumber)}
              disabled={busyAction !== null}
              accessibilityRole="button"
              accessibilityState={{
                disabled: busyAction !== null,
                busy: busyAction === `resetDay:${day.dayNumber}`,
              }}
              accessibilityLabel={`Unlock day ${day.dayNumber}`}
            >
              <View style={styles.dayListItemContent}>
                <Text style={styles.dayListItemTitle}>Day {day.dayNumber}</Text>
                <Text style={styles.dayListItemSubtitle}>
                  {day.primaryMuscles?.join(", ") ?? day.dayTitle ?? ""}
                </Text>
              </View>
              <View style={styles.dayListItemBadges}>
                {completedDays[day.dayNumber] && (
                  <View style={styles.completedBadge}>
                    <Text style={styles.badgeText}>
                      {Object.keys(completedDays[day.dayNumber]).length}{" "}
                      exercises
                    </Text>
                  </View>
                )}
                {lockedDays[day.dayNumber] && (
                  <View style={styles.lockedBadge}>
                    <Text style={styles.badgeText}>🔒 Locked</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          ))
        )}
      </ModalSheet>

      <ExportPassphraseModal
        visible={showExportPassphraseModal}
        onClose={() => setShowExportPassphraseModal(false)}
        onSubmit={handleExportData}
        busy={exportingData}
        styles={styles}
      />

      <RestorePassphraseModal
        visible={pendingEncryptedBackup !== null}
        onClose={() => setPendingEncryptedBackup(null)}
        onSubmit={handleDecryptRestore}
        busy={decryptingBackup}
        styles={styles}
      />

      <ThemeEditorModal
        visible={showThemeEditor}
        onClose={() => setShowThemeEditor(false)}
      />

      {selectedSplit && (
        <EditWorkoutHistoryModal
          visible={showEditHistoryModal}
          onClose={() => setShowEditHistoryModal(false)}
          split={selectedSplit}
          onDataChanged={() => {
            void syncFromServer();
            void loadServerProgress();
          }}
        />
      )}
    </>
  );

  const serverHost = serverUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  let storageSummary = isOffline ? "Stored on this device" : serverHost;
  if (pendingSyncs.length > 0)
    storageSummary = `${countChanges(pendingSyncs.length)} waiting to sync`;
  const pages: Record<
    SettingsPage,
    { title: string; icon: string; summary: string; render: () => React.JSX.Element }
  > = {
    account: {
      title: accountCopy.section,
      icon: "👤",
      summary: isOffline ? "This device profile" : (user?.email ?? user?.username ?? "Sign-in and security"),
      render: renderAccountPage,
    },
    workout: {
      title: "Workout",
      icon: "🏋️",
      summary: `${useManualTime ? "Manual" : "Auto"} rest time, ${formatDuration(timeBetweenSets)}`,
      render: renderWorkoutPage,
    },
    appearance: {
      title: "Appearance",
      icon: "🎨",
      summary: "Theme, tab order and skins",
      render: renderAppearancePage,
    },
    storage: {
      title: "Storage and Sync",
      icon: "☁️",
      summary: storageSummary,
      render: renderStoragePage,
    },
    privacy: {
      title: "Privacy and Data",
      icon: "🔒",
      summary: "Export, restore and diagnostics",
      render: renderPrivacyPage,
    },
    about: {
      title: "About",
      icon: "ℹ️",
      summary: `Version ${Constants.expoConfig?.version ?? "-"}`,
      render: renderAboutPage,
    },
    developer: {
      title: "Developer",
      icon: "🧪",
      summary: "Demo data and diagnostics",
      render: renderDeveloperPage,
    },
  };
  const showDeveloper = __DEV__ || isAdmin;
  const indexGroups: SettingsPage[][] = [
    ["workout", "appearance"],
    ["storage", "privacy"],
    showDeveloper ? ["about", "developer"] : ["about"],
  ];

  const displayName =
    user?.name ?? user?.username ?? (isOffline ? "This device" : "Not signed in");
  let modeLine = isOffline ? "Offline, stored on this device" : `Online, ${serverHost}`;
  if (pendingSyncs.length > 0)
    modeLine += `. ${countChanges(pendingSyncs.length)} waiting to sync`;

  const renderIndex = (): React.JSX.Element => (
    <>
      <ScreenTitle title="Settings" />
      <View style={styles.section}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            trackFeature("tip", KOFI_URL ? "kofi_open" : "jar_open");
            if (KOFI_URL) void Linking.openURL(KOFI_URL);
            else setShowTipJar(true);
          }}
          accessibilityRole={SUPPORT_COPY.role}
          accessibilityLabel={SUPPORT_COPY.label}
        >
          <LinearGradient
            colors={isDark ? ["#9d174d", "#9f1239", "#9a3412"] : ["#db2777", "#e11d48", "#ea580c"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.supportButton}
          >
            <Text style={styles.supportEmoji} importantForAccessibility="no">❤️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportTitle}>Support Development</Text>
              <Text style={styles.supportSubtitle}>
                Help keep OwnGains and its official server running
              </Text>
            </View>
            <Text style={[styles.supportCta, isDark && { color: "#9f1239" }]}>
              {SUPPORT_COPY.cta}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          style={{ marginTop: 12 }}
          onPress={() => navigation.navigate("Skins")}
          accessibilityRole="button"
          accessibilityLabel="Open the skin marketplace"
        >
          <LinearGradient
            colors={isDark ? ["#047857", "#0f766e", "#155e75"] : ["#10b981", "#14b8a6", "#06b6d4"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.supportButton}
          >
            <Text style={styles.supportEmoji} importantForAccessibility="no">🎨</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportTitle}>Skin Marketplace</Text>
              <Text style={styles.supportSubtitle}>
                Restyle the app in one tap with themes and layouts from other lifters
              </Text>
            </View>
            <Text style={[styles.supportCta, { color: isDark ? "#0f766e" : "#0d9488" }]}>
              Browse
            </Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          style={{ marginTop: 12 }}
          onPress={() =>
            void Linking.openURL(
              `mailto:kostissuperak0s@gmail.com?subject=${encodeURIComponent(
                `OwnGains feedback (v${Constants.expoConfig?.version ?? "?"})`,
              )}`,
            ).catch(() =>
              alert("No email app", "Send your feedback to kostissuperak0s@gmail.com."),
            )
          }
          accessibilityRole="link"
          accessibilityLabel="Give feedback by email"
        >
          <LinearGradient
            colors={isDark ? ["#1e40af", "#5b21b6", "#6b21a8"] : ["#2563eb", "#7c3aed", "#9333ea"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.supportButton}
          >
            <Text style={styles.supportEmoji} importantForAccessibility="no">💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.supportTitle}>Give Feedback</Text>
              <Text style={styles.supportSubtitle}>Report a bug or suggest an idea</Text>
            </View>
            <Text style={[styles.supportCta, { color: isDark ? "#5b21b6" : "#7c3aed" }]}>
              Email ↗
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        activeOpacity={0.7}
        style={styles.profileCard}
        onPress={() => setPage("account")}
        accessibilityRole="button"
        accessibilityLabel={`${displayName}. ${modeLine}. Open account settings`}
      >
        <Avatar
          name={displayName}
          size={56}
          photo={savedAvatarUri}
          style={styles.profileAvatar}
          textStyle={styles.profileInitial}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName} numberOfLines={1}>
            {displayName}
          </Text>
          <Text
            style={[
              styles.profileMode,
              pendingSyncs.length > 0 && { color: colors.warning },
            ]}
            numberOfLines={2}
          >
            {modeLine}
          </Text>
        </View>
        <Text style={styles.profileChevron} importantForAccessibility="no">
          ›
        </Text>
      </TouchableOpacity>
      <SettingsGroup>
        <SettingsRow
          icon="👥"
          label="Trainer Mode"
          description={
            isOffline
              ? "Needs online mode."
              : "Show your clients and coaching tools instead of your own training."
          }
          disabled={isOffline}
          toggle={{
            value: !isOffline && appRole === "trainer",
            label: "Trainer Mode",
            onChange: (on) => {
              void setAppRole(on ? "trainer" : "personal");
              if (on) offerTrainerTour();
            },
          }}
        />
      </SettingsGroup>
      {indexGroups.map((group) => (
        <SettingsGroup key={group.join()}>
          {group.map((key) => (
            <SettingsRow
              key={key}
              icon={pages[key].icon}
              label={pages[key].title}
              description={pages[key].summary}
              onPress={() => setPage(key)}
            />
          ))}
        </SettingsGroup>
      ))}
    </>
  );

  const activePage = page && (page !== "developer" || showDeveloper) ? page : null;

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        key={activePage ?? "index"}
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {activePage ? (
          <>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setPage(null)}
              accessibilityRole="button"
              accessibilityLabel="Back to settings"
            >
              <Text style={styles.backText}>‹ Settings</Text>
            </TouchableOpacity>
            <ScreenTitle title={pages[activePage].title} />
            {pages[activePage].render()}
          </>
        ) : (
          renderIndex()
        )}
      </ScrollView>
      {renderModals()}
      <ChangelogSheet
        visible={showChangelog}
        onClose={() => setShowChangelog(false)}
        currentVersion={Constants.expoConfig?.version}
      />
      <TipJarSheet visible={showTipJar} onClose={() => setShowTipJar(false)} />
      {AlertComponent}
      <TutorialMenuSheet
        visible={showTutorialMenu}
        onClose={() => setShowTutorialMenu(false)}
      />
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    contentContainer: SCREEN_PADDING,
    section: { marginBottom: 24 },
    supportButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 20,
      paddingHorizontal: 18,
      borderRadius: 18,
    },
    supportEmoji: { fontSize: 32 },
    supportTitle: { fontSize: 19, fontWeight: "800", color: "#fff" },
    supportSubtitle: { fontSize: 13, color: "#fff", opacity: 0.92, marginTop: 2 },
    supportCta: {
      fontSize: 15,
      fontWeight: "700",
      color: "#e11d48",
      backgroundColor: "#fff",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      overflow: "hidden",
    },
    progressGroup: { marginBottom: 24 },
    progressErrorCard: { paddingVertical: 16 },
    statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    statTile: {
      flexGrow: 1,
      flexBasis: "45%",
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    statValue: { fontSize: 24, fontWeight: "800", color: colors.textPrimary },
    statLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    radioMark: { width: 24, fontSize: 18, fontWeight: "800", textAlign: "center" },
    radioMarkActive: { color: colors.accent },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      padding: 16,
      marginBottom: 24,
    },
    profileAvatar: { backgroundColor: colors.accentLight },
    profileInitial: { fontSize: 22, color: colors.accent },
    profileName: { fontSize: 18, fontWeight: "700", color: colors.textPrimary },
    profileMode: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    profileChevron: { fontSize: 24, color: colors.textMuted },
    backButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingRight: 12,
    },
    backText: { fontSize: 16, fontWeight: "600", color: colors.accent },
    infoRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
    },
    infoLabel: { fontSize: 16, color: colors.textSecondary },
    infoValue: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      maxWidth: "50%",
    },

    warningValue: { fontSize: 16, fontWeight: "600", color: colors.warning },
    settingRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    settingDescription: { fontSize: 13, color: colors.textSecondary },
    
    
    
    
    
    settingValue: { fontSize: 16, fontWeight: "600", color: colors.accent },
    divider: { height: 1, backgroundColor: colors.surfaceBorder },
    tabOrderRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
    },
    tabOrderIcon: { fontSize: 22, width: 36 },
    tabOrderLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    tabOrderButton: {
      width: 44,
      height: 44,
      marginLeft: 8,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    tabOrderArrow: { fontSize: 16, color: colors.accent },
    dropdownItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    dropdownItemSelected: { backgroundColor: colors.accentLight },
    dropdownItemText: {
      fontSize: 16,
      fontWeight: "500",
      color: colors.textPrimary,
    },
    dropdownItemTextSelected: { color: colors.accent, fontWeight: "600" },
    dropdownItemCheck: { fontSize: 18, color: colors.accent, marginLeft: 12 },
    exampleBox: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      gap: 8,
    },
    exampleLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    exampleEmpty: { fontSize: 13, color: colors.textSecondary },
    exampleCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      padding: 10,
      gap: 6,
    },
    exampleCardTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    exampleCardSubtitle: { fontSize: 12, color: colors.textSecondary },
    exampleChip: {
      alignSelf: "flex-start",
      backgroundColor: colors.accentLight,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    exampleChipText: { fontSize: 12, fontWeight: "600", color: colors.accent },
    exampleBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.warningLight,
      borderWidth: 1,
      borderColor: colors.warning,
      borderRadius: 10,
      paddingVertical: 4,
      paddingHorizontal: 10,
    },
    exampleBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.warning,
    },
    
    errorText: { fontSize: 14, color: colors.error, marginTop: 4 },
    retryButton: {
      paddingVertical: 12,
      minHeight: 44,
      justifyContent: "center",
    },
    retryButtonText: { fontSize: 16, fontWeight: "600", color: colors.accent },
    droppedItem: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    syncButton: {
      paddingVertical: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 44,
    },
    syncButtonText: { fontSize: 16, fontWeight: "600", color: colors.accent },
    
    disabledButton: { opacity: 0.5 },
    
    
    
    dangerText: { color: colors.error },
    modalDescription: {
      fontSize: 15,
      color: colors.textSecondary,
      marginBottom: 20,
      lineHeight: 22,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      fontSize: 18,
      color: colors.textPrimary,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      marginBottom: 16,
    },
    dayListItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      backgroundColor: colors.surface,
      borderRadius: 8,
      marginBottom: 8,
    },
    dayListItemContent: { flex: 1 },
    dayListItemTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    dayListItemSubtitle: { fontSize: 14, color: colors.textSecondary },
    dayListItemBadges: { flexDirection: "row", gap: 8 },
    completedBadge: {
      backgroundColor: colors.successLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    lockedBadge: {
      backgroundColor: colors.warningLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeText: { fontSize: 13, fontWeight: "600", color: colors.textPrimary },
    unblockButton: {
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: 12,
      justifyContent: "center",
      alignItems: "center",
    },
    emptyDayList: { padding: 40, alignItems: "center" },
    emptyDayListText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
    },
    fullModalContent: { padding: 20, paddingBottom: 20 },

    avatarButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      overflow: "hidden",
      backgroundColor: colors.inputBackground,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    avatarImage: { width: 72, height: 72 },
    avatarPlaceholder: { color: colors.textMuted, fontWeight: "600" },
    avatarRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 6,
    },
    warningBox: {
      backgroundColor: colors.warningLight,
      borderRadius: 10,
      padding: 12,
      marginTop: 6,
      gap: 4,
    },
    warningBoxTitle: { color: colors.warning, fontSize: 14, fontWeight: "700" },
    removePhotoButton: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 4,
    },
    removePhotoText: { color: colors.error, fontSize: 15, fontWeight: "600" },
  });
