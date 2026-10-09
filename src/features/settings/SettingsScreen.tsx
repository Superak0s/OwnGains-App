import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Share,
  Linking,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Constants from "expo-constants";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File as ExpoFile } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
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
  ClearDataPasswordModal,
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
import { showToast } from "@shared/components/toast";
import ModalSheet from "@shared/components/ModalSheet";
import {
  importStrengthLevelCSV,
  type ImportResult,
} from "@utils/strengthLevelImport";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import {
  isServerless,
  onAppModeChange,
  restartOnboarding,
} from "@shared/services/appMode";
import { workoutApi } from "@features/workout/services/index";
import { programApi } from "@features/plan/services/index";
import {
  DEMO_SPLIT,
  buildDemoProgram,
} from "./utils/demoData";
import { clearDemoTracking, fillDemoTracking } from "./utils/demoTracking";
import { doMigrateOffline as runOfflineMigration } from "./utils/offlineMigration";
import { authService } from "@features/auth/services/index";
import { passwordPolicyError } from "@features/auth/utils/passwordPolicy";
import { GoogleSignInCancelledError } from "@features/auth/googleSignIn";
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
import { friendsApi } from "@features/friends/services";
import HealthConnectSection from "@features/healthConnect/HealthConnectSection";
import type { BlockedUser } from "@features/friends/services";
import {
  isCrashReportingEnabled,
  setCrashReportingEnabled,
  isTelemetryEnabled,
  setTelemetryEnabled,
  trackFeature,
  sendTestEvent,
  captureException,
} from "@shared/services/crashReporting";
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
  moveTab,
  saveTabOrder,
  TAB_META,
  type TabName,
} from "@shared/services/tabOrder";
import { useNavigation } from "@react-navigation/native";
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
const ACCOUNT_COPY = {
  section: "Account",
  editLabel: "Edit your account details",
  row: "Account",
};

export default function SettingsScreen(): React.JSX.Element {
  const { colors, isDark } = useTheme();
  const switchThumbColor = (on: boolean) =>
    on ? colors.textOnAccent : colors.textMuted;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user, logout, updateProfile, refreshUser } = useAuth();
  // Server-granted, so offline profiles are never admin.
  const isAdmin = user?.isAdmin === true;
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [showClearDataModal, setShowClearDataModal] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
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
  const [serverInfo, setServerInfo] = useState<ServerVersionCheck | null>(null);
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
    unlockedOverrides,
    syncFromServer,
    saveWorkoutData,
    saveSelectedSplit,
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
    "unlockedOverrides",
    "syncFromServer",
    "saveWorkoutData",
    "saveSelectedSplit",
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
  const [tabOrder, setTabOrder] = useState<TabName[]>([]);

  const openTabOrder = async () => {
    setTabOrder(await loadTabOrder());
    setShowTabOrderModal(true);
  };

  const handleMoveTab = (index: number, direction: -1 | 1) => {
    const next = moveTab(tabOrder, index, direction);
    setTabOrder(next);
    void saveTabOrder(next);
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
        (result.skipped > 0 ? `\n${result.skipped} row(s) were skipped.` : "");
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
      if (!isMountedRef.current) return;
      await syncFromServer();
      const extras = [
        friends ? `${friends} demo friends` : null,
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
        "Error",
        userFacingError(error, "Failed to fill demo data"),
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
        ? "Adds about five weeks of generated sessions to your current program, plus demo friends, tracking and supplement entries, so every screen has something to show. Earlier demo data is replaced."
        : "Creates a sample program and adds about five weeks of generated sessions to it, plus demo friends, tracking and supplement entries.",
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
        lines.push("", "Look for 'OwnGains Sentry test event' in Sentry.");
      } else {
        lines.push("", "The event was queued but did not reach Sentry. Check connectivity.");
      }
      alert(
        "Sentry Test",
        lines.join("\n"),
        [{ text: "OK" }],
        result.flushed ? "success" : "warning",
      );
    } finally {
      setBusyAction(null);
    }
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
              await syncFromServer();
              const sessions = result?.deletedCount ?? 0;
              const friends = result?.deletedFriends ?? 0;
              showToast(
                sessions || friends || tracked
                  ? `Deleted ${sessions} session(s), ${friends} friend(s) and ${tracked} tracking entries.`
                  : "There was no demo data to remove.",
              );
            } catch (error) {
              alert(
                "Error",
                userFacingError(error, "Failed to remove demo data"),
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
        "Error",
        userFacingError(error, "Failed to clear all data"),
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
                "Error",
                "Failed to reset progress",
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
        "Error",
        userFacingError(error, "Failed to change password"),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setChangingPassword(false);
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
      const { photosOmitted } = await restoreDeviceBackup(backup, mode);
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

  const handleUnblock = async (blocked: BlockedUser) => {
    try {
      await friendsApi.unblockUser(blocked.id);
      setBlockedUsers((prev) => prev.filter((b) => b.id !== blocked.id));
      showToast(`${blocked.username} unblocked`);
    } catch (error) {
      alert(
        "Error",
        userFacingError(error, "Could not unblock user"),
        [{ text: "OK" }],
        "error",
      );
    }
  };

  const handleToggleCrashReporting = async (enabled: boolean) => {
    setCrashReporting(enabled);
    await setCrashReportingEnabled(enabled);
  };

  const handleToggleTelemetry = async (enabled: boolean) => {
    setTelemetry(enabled);
    await setTelemetryEnabled(enabled);
  };

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
      await authService.deleteAccount(googleOnly ? null : deleteAccountPassword);
    } catch (error) {
      if (error instanceof GoogleSignInCancelledError) {
        setDeletingAccount(false);
        return;
      }
      console.error("Error deleting account:", error);
      alert(
        "Error",
        userFacingError(error, "Failed to delete account"),
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
      "Logout",
      "Are you sure you want to logout?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Logout",
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

              alert(
                "Success",
                hasActiveSession
                  ? "Active session ended and all days unlocked. Your workout history is preserved in Analytics."
                  : "All days have been unlocked. Your workout history is preserved in Analytics.",
                [{ text: "OK" }],
                "success",
              );
            } catch (error) {
              console.error("Error unlocking days:", error);
              alert(
                "Error",
                "Failed to unlock days",
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

              const newCompletedDays = { ...completedDays };
              delete newCompletedDays[dayNumber];
              await saveCompletedDays(newCompletedDays);

              const newLockedDays = { ...lockedDays };
              delete newLockedDays[dayNumber];
              await saveLockedDays(newLockedDays);

              const newOverrides = { ...unlockedOverrides, [dayNumber]: true };
              await saveUnlockedOverrides(newOverrides);

              setShowResetDayModal(false);
              showToast(`${dayTitle} has been unlocked.`);
            } catch (error) {
              console.error("Error resetting day:", error);
              alert("Error", "Failed to reset day", [{ text: "OK" }], "error");
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

  const handleManualSync = async () => {
    alert(
      "Sync Pending Data?",
      `You have ${pendingSyncs.length} pending sync operation(s). Sync now?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sync",
          onPress: async () => {
            await syncPendingData();
            alert(
              "Sync Finished",
              "Anything that could not be synced is still listed under Data Sync.",
              [{ text: "OK" }],
              "info",
            );
          },
        },
      ],
      "info",
    );
  };

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

  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);
  const [showAccountModal, setShowAccountModal] = useState<boolean>(false);

  const [profileName, setProfileName] = useState<string>(user?.name ?? "");
  const [profileEmail, setProfileEmail] = useState<string>(user?.email ?? "");
  const [profileEmailPassword, setProfileEmailPassword] = useState<string>("");
  const [profileAvatarUri, setProfileAvatarUri] = useState<string | null>(null);
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
        const avatar = await getStorageItem(profileExtraKey("@profile_avatar"));
        if (cancelled) return;
        setProfileAvatarUri(avatar);
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
      if (profileAvatarUri)
        await setStorageItem(
          profileExtraKey("@profile_avatar"),
          profileAvatarUri,
        );
      showToast("Profile updated");
      await refreshUser();
      return true;
    } catch (error) {
      console.error("Save profile error:", error);
      alert("Error", "Failed to save profile", [{ text: "OK" }], "error");
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
            if (!(await doMigrateOffline(true)))
              alert(
                "Error",
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
    alert(
      "Migrate to Offline",
      "This will create a local offline account using your current profile data and switch the app to offline mode. All local app state (workout plan, progress, and session history) will be copied to the offline profile so you can continue where you left off. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Migrate",
          onPress: async () => {
            const ok = await doMigrateOffline();
            if (ok) {
              alert(
                "Success",
                "Migrated to offline account. Your data has been copied and you can continue where you left off.",
                [{ text: "OK" }],
                "success",
              );
            } else {
              alert(
                "Error",
                "Failed to migrate to offline account",
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
                "Error",
                "Failed to open the setup screen",
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

  const renderAdvancedSection = (): React.JSX.Element | null => {
    if (!showAdvanced) return null;
    return (
      <View>
        <View style={styles.section}>
          <Text
            style={styles.sectionTitle}
            accessibilityRole="header"
            accessibilityLabel="Workout History"
          >
            📝 Workout History
          </Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingRow}
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
              accessibilityRole="button"
              accessibilityLabel="Edit workout history"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>
                  Edit Workout History
                </Text>
                <Text style={styles.settingDescription}>
                  Update the name, muscle group, or time of already
                  logged/imported sets
                </Text>
              </View>
              <Text style={styles.settingValue}>Edit</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.actionButton,
              progressActionsDisabled &&
                styles.disabledButton,
            ]}
            onPress={handleUnlockAllDays}
            disabled={progressActionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Unlock all days"
            accessibilityState={{
              disabled: progressActionsDisabled,
              busy: busyAction === "unlockAll",
            }}
          >
            <Text
              style={styles.actionButtonIcon}
              importantForAccessibility="no"
            >
              🔓
            </Text>
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>
                Unlock All Days
              </Text>
              <Text style={styles.actionButtonSubtext}>
                {noLocalProgress
                  ? NO_LOCAL_PROGRESS_HINT
                  : "Clear local sets & unlock days"}
              </Text>
            </View>
            {busyAction === "unlockAll" && (
              <ActivityIndicator color={colors.accent} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.7}
            style={[
              styles.actionButton,
              progressActionsDisabled &&
                styles.disabledButton,
            ]}
            onPress={() => setShowResetDayModal(true)}
            disabled={progressActionsDisabled}
            accessibilityRole="button"
            accessibilityLabel="Unlock one day"
            accessibilityState={{
              disabled: progressActionsDisabled,
            }}
          >
            <Text
              style={styles.actionButtonIcon}
              importantForAccessibility="no"
            >
              🔄
            </Text>
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonText}>
                Unlock Single Day
              </Text>
              <Text style={styles.actionButtonSubtext}>
                {noLocalProgress
                  ? NO_LOCAL_PROGRESS_HINT
                  : "Clear local sets for one day"}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {(__DEV__ || isAdmin) && (
          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Developer"
            >
              🧪 Developer
            </Text>

            {isAdmin && !isOffline && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.actionButton}
                onPress={() => void Linking.openURL(`${serverUrl}/admin/metrics`)}
                accessibilityRole="link"
                accessibilityLabel="Open the server metrics dashboard in the browser"
              >
                <Text
                  style={styles.actionButtonIcon}
                  importantForAccessibility="no"
                >
                  📈
                </Text>
                <View style={styles.actionButtonContent}>
                  <Text style={styles.actionButtonText}>Server Metrics</Text>
                  <Text style={styles.actionButtonSubtext}>
                    Requests, errors and database health on the server&apos;s
                    admin dashboard. Sign in there with this account.
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                fillingDemoData && styles.disabledButton,
              ]}
              onPress={handleFillDemoData}
              disabled={fillingDemoData}
              accessibilityRole="button"
              accessibilityLabel="Fill the app with demo workout data"
            >
              <Text
                style={styles.actionButtonIcon}
                importantForAccessibility="no"
              >
                ✨
              </Text>
              <View style={styles.actionButtonContent}>
                <Text style={styles.actionButtonText}>
                  Fill Demo Data
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  Generate ~5 weeks of workout sessions (and a sample
                  program if you have none) to check every screen
                </Text>
              </View>
              {fillingDemoData && (
                <ActivityIndicator color={colors.accent} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                styles.dangerButton,
                (fillingDemoData || busyAction !== null) &&
                  styles.disabledButton,
              ]}
              onPress={handleRemoveDemoData}
              disabled={fillingDemoData || busyAction !== null}
              accessibilityRole="button"
              accessibilityLabel="Remove demo workout data"
              accessibilityState={{
                disabled: fillingDemoData || busyAction !== null,
                busy: busyAction === "removeDemo",
              }}
            >
              <Text
                style={styles.actionButtonIcon}
                importantForAccessibility="no"
              >
                🧹
              </Text>
              <View style={styles.actionButtonContent}>
                <Text
                  style={[styles.actionButtonText, styles.dangerText]}
                >
                  Remove Demo Data
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  Delete the generated sessions, keeping real ones
                </Text>
              </View>
              {busyAction === "removeDemo" && (
                <ActivityIndicator color={colors.accent} />
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.actionButton}
              onPress={() => {
                const preview =
                  ALERT_PREVIEWS[
                    alertPreviewIndexRef.current % ALERT_PREVIEWS.length
                  ];
                alertPreviewIndexRef.current += 1;
                alert(
                  preview.title,
                  preview.message,
                  preview.buttons,
                  preview.type,
                );
              }}
            >
              <Text style={styles.actionButtonIcon}>🔔</Text>
              <View style={styles.actionButtonContent}>
                <Text style={styles.actionButtonText}>
                  Preview Alert Style
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  Tap repeatedly to cycle through every alert variant
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                busyAction === "sentryTest" && styles.disabledButton,
              ]}
              onPress={handleSentryTest}
              disabled={busyAction === "sentryTest"}
              accessibilityRole="button"
              accessibilityLabel="Send a test event to Sentry"
              accessibilityState={{ busy: busyAction === "sentryTest" }}
            >
              <Text style={styles.actionButtonIcon} importantForAccessibility="no">
                📡
              </Text>
              <View style={styles.actionButtonContent}>
                <Text style={styles.actionButtonText}>Test Sentry</Text>
                <Text style={styles.actionButtonSubtext}>
                  Send an error, a log and a metric, then report whether they
                  reached Sentry and which consent gate stopped them
                </Text>
              </View>
              {busyAction === "sentryTest" && (
                <ActivityIndicator color={colors.accent} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.actionButton}
              onPress={handleShareDiagnostics}
              accessibilityRole="button"
              accessibilityLabel="Share diagnostics"
            >
              <Text style={styles.actionButtonIcon} importantForAccessibility="no">
                📋
              </Text>
              <View style={styles.actionButtonContent}>
                <Text style={styles.actionButtonText}>Share Diagnostics</Text>
                <Text style={styles.actionButtonSubtext}>
                  App version, mode, server, consent flags and pending sync
                  count, the details to attach to a bug report
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.helperText}>
              {__DEV__
                ? "💡 Debug build: this section is also shown to admin accounts in release APKs"
                : "💡 Shown because this account is an admin"}
            </Text>
          </View>
        )}

        {selectedSplit && workoutData && (
          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Progress"
            >
              📊 Progress
            </Text>
            <View style={styles.card}>
              {renderProgressCard()}
            </View>
          </View>
        )}

      </View>
    );
  };

  const renderServerCard = (): React.JSX.Element | null => {
    if (isOffline) return null;
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.settingRow}
          onPress={migrateToOnline}
          accessibilityRole="button"
          accessibilityLabel="Sign out and choose a different server or on-device storage"
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Connected To</Text>
            <Text style={styles.settingDescription}>
              {serverUrl}
            </Text>
            <Text style={styles.settingDescription}>
              Pointing OwnGains at a different server signs you out and takes you
              back to the setup screen, where the server address is set.
            </Text>
          </View>
          <Text style={styles.settingValue}>Sign out</Text>
        </TouchableOpacity>
        {localOnlyFeatures.length > 0 && (
          <>
            <View style={styles.divider} />
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingLabel}>Kept On This Device</Text>
                <Text style={[styles.settingDescription, styles.dangerText]}>
                  {describeLocalOnlyFeatures(localOnlyFeatures)} are not stored
                  on this server. They are kept on this phone only. They will not
                  sync to your other devices, and they are gone if you
                  uninstall OwnGains or lose the phone. Use Export My Data
                  under Privacy and Data to keep a copy.
                </Text>
              </View>
            </View>
          </>
        )}
        <View style={styles.divider} />
        <View style={styles.settingRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>Server Version</Text>
            <Text style={styles.settingDescription}>
              {serverInfo?.outdated
                ? `This server runs ${serverInfo.version}. Version ${MIN_SERVER_VERSION} or newer is needed for blocking, reporting, data export and changing day mid-workout. Ask its operator to update.`
                : "The version of OwnGains-Server you are signed in to"}
            </Text>
          </View>
          <Text
            style={[
              styles.infoValue,
              serverInfo?.outdated && styles.dangerText,
            ]}
          >
            {serverInfo ? serverInfo.version : "-"}
          </Text>
        </View>
      </View>
    );
  };

  const renderSyncSection = (): React.JSX.Element | null => {
    if (pendingSyncs.length === 0 && droppedSyncCount === 0) return null;
    return (
      <View style={styles.section}>
        <Text
          style={styles.sectionTitle}
          accessibilityRole="header"
          accessibilityLabel="Data Sync"
        >
          ☁️ Data Sync
        </Text>
        <View style={styles.card}>
          {pendingSyncs.length > 0 && (
            <>
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>Pending Syncs</Text>
                  <Text style={styles.settingDescription}>
                    {pendingSyncs.length} operation(s) waiting to sync
                  </Text>
                </View>
                <Text style={styles.warningValue}>
                  {pendingSyncs.length}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          )}
          {droppedSyncCount > 0 && (
            <View style={styles.infoRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Discarded Syncs</Text>
                <Text style={styles.settingDescription}>
                  {droppedSyncCount} operation(s) could not be synced and
                  were discarded. They are listed below so you can log them
                  again from the Workout screen. Edit Workout History can only
                  correct sets that were saved.
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
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={[
                  styles.syncButton,
                  isSyncing && styles.disabledButton,
                ]}
                onPress={handleManualSync}
                disabled={isSyncing}
                accessibilityRole="button"
                accessibilityLabel="Sync pending workout data now"
                ref={tutorialAnchor("settings.sync")}
                accessibilityState={{ busy: isSyncing }}
              >
                {isSyncing ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.syncButtonText}>Sync Now</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
        {pendingSyncs.length > 0 && (
          <Text style={styles.warningText}>
            ⚠️ Your workout data is stored locally. Connect to sync with
            the server.
          </Text>
        )}
      </View>
    );
  };

  const renderProgressCard = (): React.JSX.Element => {
    if (loadingProgress)
      return (
        <ActivityIndicator
          color={colors.accent}
          style={{ paddingVertical: 20 }}
        />
      );
    if (progressError)
      return (
        <>
          <Text style={styles.errorText}>
            Progress could not be loaded from the server. The
            numbers below your device holds are still intact.
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => void loadServerProgress()}
            accessibilityRole="button"
            accessibilityLabel="Retry loading progress"
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </>
      );
    return (
      <>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>
            Days with Activity
          </Text>
          <Text style={styles.infoValue}>
            {serverProgress?.daysCount ??
              getCompletedDaysCount()}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>
            Total Sets Completed
          </Text>
          <Text style={styles.infoValue}>
            {serverProgress?.setsCount ??
              getTotalCompletedSets()}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Locked Days</Text>
          <Text style={styles.infoValue}>
            {serverProgress?.lockedCount ??
              getLockedDaysCount()}
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Current Day</Text>
          <Text style={styles.infoValue}>
            Day {currentDay}
          </Text>
        </View>
      </>
    );
  };

  const renderModals = (): React.JSX.Element => (
    <>
      <ModalSheet
        visible={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        dirty={
          profileName !== (user?.name ?? "") ||
          profileEmail !== (user?.email ?? "")
        }
        title={isOffline ? "This Device Profile" : "Account"}
        showCancelButton={false}
        showConfirmButton={false}
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
                <Text style={styles.avatarPlaceholder}>Add</Text>
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

          <View style={{ height: 20 }} />
          <TouchableOpacity
            style={[
              styles.saveButtonBig,
              savingProfile && styles.disabledButton,
            ]}
            onPress={async () => {
              if (await handleSaveProfile()) setShowAccountModal(false);
            }}
            disabled={savingProfile}
          >
            <Text style={styles.saveButtonTextBig}>
              {savingProfile ? "Saving..." : "Save Profile"}
            </Text>
          </TouchableOpacity>
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
          const { icon, label } = TAB_META[name];
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

      <ClearDataPasswordModal
        visible={showClearDataModal}
        onClose={() => setShowClearDataModal(false)}
        onSubmit={clearData}
        busy={busyAction === "clearData"}
        styles={styles}
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

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        <View>
          <View style={styles.section}>
            <ScreenTitle title='Settings' style={{ marginBottom: 0 }} />
          </View>

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
                colors={
                  isDark
                    ? ["#9d174d", "#9f1239", "#9a3412"]
                    : ["#db2777", "#e11d48", "#ea580c"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.supportButton}
              >
                <Text style={styles.supportEmoji}>❤️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportTitle}>Support Development</Text>
                  <Text style={styles.supportSubtitle}>
                    Help keep OwnGains and its official server running
                  </Text>
                </View>
                <Text
                  style={[styles.supportCta, isDark && { color: "#9f1239" }]}
                >
                  {SUPPORT_COPY.cta}
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
                  alert(
                    "No email app",
                    "Send your feedback to kostissuperak0s@gmail.com.",
                  ),
                )
              }
              accessibilityRole="link"
              accessibilityLabel="Give feedback by email"
            >
              <LinearGradient
                colors={
                  isDark
                    ? ["#1e40af", "#5b21b6", "#6b21a8"]
                    : ["#2563eb", "#7c3aed", "#9333ea"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.supportButton}
              >
                <Text style={styles.supportEmoji}>💬</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.supportTitle}>Give Feedback</Text>
                  <Text style={styles.supportSubtitle}>
                    Report a bug or suggest an idea
                  </Text>
                </View>
                <Text
                  style={[
                    styles.supportCta,
                    { color: isDark ? "#5b21b6" : "#7c3aed" },
                  ]}
                >
                  Email ↗
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel={accountCopy.section}
            >
              👤 {accountCopy.section}
            </Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setShowAccountModal(true)}
                accessibilityRole="button"
                accessibilityLabel={accountCopy.editLabel}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>{accountCopy.row}</Text>
                  <Text style={styles.settingDescription}>
                    {user?.name ??
                      user?.username ??
                      "View or edit your account"}
                  </Text>
                </View>
                <Text style={styles.settingValue}>Edit</Text>
              </TouchableOpacity>
              {!isOffline && (
                <>
                  {!googleOnly && (
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => setShowChangePasswordModal(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Change your password"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingLabel}>Change Password</Text>
                      <Text style={styles.settingDescription}>
                        Signs out every other device
                      </Text>
                    </View>
                    <Text style={styles.settingValue}>Change</Text>
                  </TouchableOpacity>
                  )}
                  {!googleOnly && <View style={styles.divider} />}
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={handleLogout}
                    accessibilityRole="button"
                    accessibilityLabel="Log out of this device"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.settingLabel, styles.dangerText]}>
                        Log Out
                      </Text>
                      <Text style={styles.settingDescription}>
                        Sign out on this device
                      </Text>
                    </View>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

          {renderSyncSection()}
          <HealthConnectSection styles={styles} userId={user?.id ?? null} alert={alert} />

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Workout"
            >
              ⚙️ Workout
            </Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Use Manual Time</Text>
                  <Text style={styles.settingDescription}>
                    Use your manually set time instead of server analytics
                  </Text>
                </View>
                <Switch
                  value={useManualTime}
                  onValueChange={(on) => {
                    trackFeature("settings", "toggle", { setting: "manual_time", on });
                    if (on) confirmEnableManualTime();
                    else void toggleUseManualTime(false);
                  }}
                  trackColor={{
                    false: colors.surfaceBorder,
                    true: colors.accent,
                  }}
                  thumbColor={switchThumbColor(useManualTime)}
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>PR Celebration</Text>
                  <Text style={styles.settingDescription}>
                    Play an animation in-session when a set exceeds your best
                    estimated 1RM
                  </Text>
                </View>
                <Switch
                  value={prCelebration}
                  onValueChange={(on) =>
                    saveWorkoutPref(
                      STORAGE_KEYS.PR_CELEBRATION,
                      setPrCelebration,
                      on,
                    )
                  }
                  trackColor={{
                    false: colors.surfaceBorder,
                    true: colors.accent,
                  }}
                  thumbColor={switchThumbColor(prCelebration)}
                  accessibilityLabel="Celebrate personal records"
                />
              </View>
              <View style={styles.divider} />
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Auto-Progression Prompt</Text>
                  <Text style={styles.settingDescription}>
                    Suggest the next set's weight from your last set's reps and
                    reps in reserve
                  </Text>
                </View>
                <Switch
                  value={autoProgression}
                  onValueChange={(on) =>
                    saveWorkoutPref(
                      STORAGE_KEYS.AUTO_PROGRESSION,
                      setAutoProgression,
                      on,
                    )
                  }
                  trackColor={{
                    false: colors.surfaceBorder,
                    true: colors.accent,
                  }}
                  thumbColor={switchThumbColor(autoProgression)}
                  accessibilityLabel="Suggest auto-progression between sets"
                />
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setShowTimeBetweenSetsModal(true)}
                accessibilityRole="button"
                accessibilityLabel="Change the time between sets"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Time Between Sets</Text>
                  <Text style={styles.settingDescription}>
                    {useManualTime
                      ? "Manual time (used for estimates)"
                      : "Manual fallback (auto mode active)"}
                  </Text>
                </View>
                <Text style={styles.settingValue}>
                  {formatDuration(timeBetweenSets)}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.helperText}>
              💡{" "}
              {useManualTime
                ? "Using your manual time setting for workout estimates"
                : "Using server analytics when available, manual time as fallback"}
            </Text>
            <View style={[styles.card, { marginTop: 12 }]}>
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>
                    Show undertrained suggestions
                  </Text>
                  <Text style={styles.settingDescription}>
                    How to show exercise suggestions for muscle groups behind
                    this week
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={styles.dropdownButton}
                  accessibilityRole="button"
                  accessibilityLabel="Change how undertrained muscles are surfaced"
                  onPress={() => setShowDisplayModeMenu(true)}
                >
                  <Text style={styles.dropdownButtonText}>
                    {DISPLAY_MODE_OPTIONS.find(
                      (o) => o.key === undertrainedDisplayMode,
                    )?.label ?? undertrainedDisplayMode}
                  </Text>
                  <Text
                    style={styles.dropdownArrow}
                    importantForAccessibility="no"
                  >
                    ▼
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
              <View style={styles.compareSection}>
                <Text style={styles.settingLabel}>Compare against</Text>
                <View style={styles.compareRow} accessibilityRole="radiogroup">
                  {CALCULATION_MODE_OPTIONS.map((option) => {
                    const isSelected =
                      undertrainedCalculationMode === option.key;
                    return (
                      <TouchableOpacity
                        key={option.key}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: isSelected }}
                        accessibilityLabel={option.label}
                        style={[
                          styles.compareChip,
                          isSelected && styles.compareChipActive,
                        ]}
                        onPress={() =>
                          handleSetUndertrainedCalculationMode(option.key)
                        }
                      >
                        <Text
                          style={[
                            styles.compareChipText,
                            isSelected && styles.compareChipTextActive,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.settingDescription}>
                  {
                    CALCULATION_MODE_OPTIONS.find(
                      (o) => o.key === undertrainedCalculationMode,
                    )?.description
                  }
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Appearance"
            >
              🎨 Appearance
            </Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => setShowThemeEditor(true)}
                accessibilityRole="button"
                accessibilityLabel="Edit the app theme"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Theme</Text>
                  <Text style={styles.settingDescription}>
                    Customize app colors and appearance
                  </Text>
                </View>
                <Text style={styles.settingValue}>Edit</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => void openTabOrder()}
                accessibilityRole="button"
                accessibilityLabel="Reorder the bottom tabs"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Tab Order</Text>
                  <Text style={styles.settingDescription}>
                    Rearrange the screens in the bottom bar
                  </Text>
                </View>
                <Text style={styles.settingValue}>Edit</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Storage and Server"
            >
              🖥️ Storage & Server
            </Text>
            {renderServerCard()}
            {!isOffline && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.actionButton}
                onPress={migrateToOffline}
                accessibilityRole="button"
                accessibilityLabel="Migrate to an offline account"
              >
                <Text style={styles.actionButtonIcon}>⬇️</Text>
                <View style={styles.actionButtonContent}>
                  <Text style={styles.actionButtonText}>
                    Migrate to Offline Account
                  </Text>
                  <Text style={styles.actionButtonSubtext}>
                    Create a local profile and switch the app to offline mode
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            {isOffline && (
              <TouchableOpacity
                activeOpacity={0.7}
                style={styles.actionButton}
                onPress={migrateToOnline}
                accessibilityRole="button"
                accessibilityLabel="Change storage mode"
              >
                <Text style={styles.actionButtonIcon}>⬆️</Text>
                <View style={styles.actionButtonContent}>
                  <Text style={styles.actionButtonText}>
                    Change Storage Mode
                  </Text>
                  <Text style={styles.actionButtonSubtext}>
                    Go back to setup to switch between this device and a server
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="Privacy and Data"
            >
              🔒 Privacy and Data
            </Text>
            <View style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => navigation.navigate("PrivacyPolicy")}
                accessibilityRole="button"
                accessibilityLabel="Open the privacy policy"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Privacy Policy</Text>
                  <Text style={styles.settingDescription}>
                    What this app stores, and where
                  </Text>
                </View>
                <Text style={styles.settingValue}>View</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => navigation.navigate("TermsOfService")}
                accessibilityRole="button"
                accessibilityLabel="Open the terms of service"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Terms of Service</Text>
                  <Text style={styles.settingDescription}>
                    The rules for using the app and the official server
                  </Text>
                </View>
                <Text style={styles.settingValue}>View</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={[
                  styles.settingRow,
                  exportingData && styles.disabledButton,
                ]}
                onPress={() => setShowExportPassphraseModal(true)}
                disabled={exportingData}
                accessibilityRole="button"
                accessibilityLabel="Export all of my data to a file"
                ref={tutorialAnchor("settings.exportData")}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Export My Data</Text>
                  <Text style={styles.settingDescription}>
                    Save everything this app holds about you as a JSON file,
                    encrypted with a passphrase you choose
                  </Text>
                </View>
                {exportingData ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.settingValue}>Export</Text>
                )}
              </TouchableOpacity>

              {!isOffline && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={withdrawHealthConsent}
                    accessibilityRole="button"
                    accessibilityLabel="Withdraw health data consent"
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingLabel}>Withdraw Health Consent</Text>
                      <Text style={styles.settingDescription}>
                        Delete your workouts and body data from the server and
                        switch to offline mode
                      </Text>
                    </View>
                    <Text style={styles.settingValue}>Withdraw</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={styles.divider} />

              <TouchableOpacity
                style={[
                  styles.settingRow,
                  restoreBusy && styles.disabledButton,
                ]}
                onPress={handleRestoreData}
                disabled={restoreBusy}
                accessibilityRole="button"
                accessibilityLabel="Restore a backup or import a Strength Level CSV"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Restore Data</Text>
                  <Text style={styles.settingDescription}>
                    Pick an OwnGains backup to replace everything on this device,
                    or a Strength Level CSV to import its history
                  </Text>
                </View>
                {restoreBusy ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text style={styles.settingValue}>Restore</Text>
                )}
              </TouchableOpacity>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Send Crash Reports</Text>
                  <Text style={styles.settingDescription}>
                    Share anonymous crash diagnostics to help fix bugs
                  </Text>
                </View>
                <Switch
                  value={crashReporting}
                  onValueChange={handleToggleCrashReporting}
                  trackColor={{
                    false: colors.surfaceBorder,
                    true: colors.accent,
                  }}
                  thumbColor={switchThumbColor(crashReporting)}
                  accessibilityLabel="Send crash reports"
                />
              </View>

              <View style={styles.divider} />

              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Usage Metrics</Text>
                  <Text style={styles.settingDescription}>
                    Share which screens and features you use, workout length and
                    set counts, plus performance traces and diagnostic logs. Never
                    exercise names, weights or notes
                  </Text>
                </View>
                <Switch
                  value={telemetry}
                  onValueChange={handleToggleTelemetry}
                  trackColor={{
                    false: colors.surfaceBorder,
                    true: colors.accent,
                  }}
                  thumbColor={switchThumbColor(telemetry)}
                  accessibilityLabel="Send usage metrics and diagnostics"
                />
              </View>

              <View style={styles.divider} />

              {!isOffline && (
                <TouchableOpacity
                  style={styles.settingRow}
                  onPress={openBlockedUsers}
                  accessibilityRole="button"
                  accessibilityLabel="Manage blocked users"
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel}>Blocked Users</Text>
                    <Text style={styles.settingDescription}>
                      Review and unblock people you have blocked
                    </Text>
                  </View>
                  <Text style={styles.settingValue}>Manage</Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.dangerZone}>
              <Text style={styles.dangerZoneTitle}>
                ⚠️ None of these can be undone
              </Text>
              <Text style={styles.dangerZoneBody}>
                There is no undo and no automatic backup. Export your data from
                the row above first if you might want it back.
              </Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                styles.dangerButton,
                progressActionsDisabled &&
                  styles.disabledButton,
              ]}
              onPress={handleResetProgress}
              disabled={progressActionsDisabled}
              accessibilityRole="button"
              accessibilityLabel="Reset all progress"
              accessibilityState={{
                disabled: progressActionsDisabled,
                busy: busyAction === "resetProgress",
              }}
            >
              <Text
                style={styles.actionButtonIcon}
                importantForAccessibility="no"
              >
                ↩️
              </Text>
              <View style={styles.actionButtonContent}>
                <Text style={[styles.actionButtonText, styles.dangerText]}>
                  Reset Progress
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  {noLocalProgress
                    ? NO_LOCAL_PROGRESS_HINT
                    : "Delete all set history"}
                </Text>
              </View>
              {busyAction === "resetProgress" && (
                <ActivityIndicator color={colors.accent} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                styles.dangerButton,
                busyAction !== null && styles.disabledButton,
              ]}
              onPress={handleClearData}
              disabled={busyAction !== null}
              accessibilityRole="button"
              accessibilityLabel="Clear all data"
              accessibilityState={{
                disabled: busyAction !== null,
                busy: busyAction === "clearData",
              }}
            >
              <Text
                style={styles.actionButtonIcon}
                importantForAccessibility="no"
              >
                🗑️
              </Text>
              <View style={styles.actionButtonContent}>
                <Text style={[styles.actionButtonText, styles.dangerText]}>
                  Clear All Data
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  Delete everything
                </Text>
              </View>
              {busyAction === "clearData" && (
                <ActivityIndicator color={colors.accent} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[
                styles.actionButton,
                styles.dangerButton,
                busyAction !== null && styles.disabledButton,
              ]}
              onPress={() => setShowDeleteAccountModal(true)}
              disabled={busyAction !== null}
              accessibilityRole="button"
              accessibilityLabel="Delete my account permanently"
              accessibilityState={{ disabled: busyAction !== null }}
            >
              <Text style={styles.actionButtonIcon}>⚠️</Text>
              <View style={styles.actionButtonContent}>
                <Text style={[styles.actionButtonText, styles.dangerText]}>
                  Delete Account
                </Text>
                <Text style={styles.actionButtonSubtext}>
                  Permanently remove your account and all of its data
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.section}>
            <Text
              style={styles.sectionTitle}
              accessibilityRole="header"
              accessibilityLabel="About"
            >
              ℹ️ About
            </Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <Text style={styles.settingLabel}>Version</Text>
                <Text style={styles.infoValue}>
                  {Constants.expoConfig?.version ?? "-"}
                </Text>
              </View>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  trackFeature("settings", "changelog_open");
                  setShowChangelog(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="What's new in this version"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>What's New</Text>
                  <Text style={styles.settingDescription}>
                    Changes in this version, and every version before it
                  </Text>
                </View>
                <Text style={styles.settingValue}>View</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                ref={tutorialAnchor("settings.tutorial")}
                style={styles.settingRow}
                onPress={() => setShowTutorialMenu(true)}
                accessibilityRole="button"
                accessibilityLabel="Tutorial: replay the whole tour or single chapters"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Tutorial</Text>
                  <Text style={styles.settingDescription}>
                    Replay the tour, or just the chapters you need
                  </Text>
                </View>
                <Text style={styles.settingValue}>Open</Text>
              </TouchableOpacity>
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
              ].map(({ label, description, url }) => (
                <React.Fragment key={url}>
                  <View style={styles.divider} />
                  <TouchableOpacity
                    style={styles.settingRow}
                    onPress={() => void Linking.openURL(url)}
                    accessibilityRole="link"
                    accessibilityLabel={label}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.settingLabel}>{label}</Text>
                      <Text style={styles.settingDescription}>
                        {description}
                      </Text>
                    </View>
                    <Text style={styles.settingValue}>View ↗</Text>
                  </TouchableOpacity>
                </React.Fragment>
              ))}
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() =>
                  void Linking.openURL(
                    "https://raw.githubusercontent.com/Superak0s/OwnGains-App/main/docs/third-party-notices.md",
                  )
                }
                accessibilityRole="link"
                accessibilityLabel="Open-source licences"
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingLabel}>Open-Source Licences</Text>
                  <Text style={styles.settingDescription}>
                    The libraries and data OwnGains is built on
                  </Text>
                </View>
                <Text style={styles.settingValue}>View ↗</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.settingsSectionHeaderSimple}
              onPress={() => setShowAdvanced((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel="Advanced settings"
              accessibilityState={{ expanded: showAdvanced }}
            >
              <View style={styles.settingsTitleContainer}>
                <Text
                  style={styles.settingsSectionIcon}
                  importantForAccessibility="no"
                >
                  🧰
                </Text>
                <Text style={styles.settingsSectionTitle}>Advanced</Text>
              </View>
              <Text style={styles.settingValue}>
                {showAdvanced ? "Hide ▲" : "Show ▼"}
              </Text>
            </TouchableOpacity>

            {renderAdvancedSection()}
          </View>

        </View>

        {renderModals()}
        <ChangelogSheet
          visible={showChangelog}
          onClose={() => setShowChangelog(false)}
          currentVersion={Constants.expoConfig?.version}
        />
        <TipJarSheet visible={showTipJar} onClose={() => setShowTipJar(false)} />
      </ScrollView>
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

    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
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
    compareSection: { paddingVertical: 12, gap: 8 },
    compareRow: { flexDirection: "row", gap: 6 },
    compareChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 8,
      alignItems: "center",
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    compareChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    compareChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    compareChipTextActive: { color: colors.textOnAccent },
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
    dropdownButton: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginLeft: 12,
      maxWidth: "45%",
    },
    dropdownButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    dropdownArrow: { fontSize: 12, color: colors.accent, marginLeft: 12 },
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
    helperText: {
      fontSize: 14,
      color: colors.accent,
      marginTop: 12,
      fontStyle: "italic",
    },
    warningText: {
      fontSize: 14,
      color: colors.warning,
      marginTop: 12,
      fontStyle: "italic",
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
    actionButton: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    disabledButton: { opacity: 0.5 },
    dangerZone: {
      marginTop: 18,
      marginBottom: 6,
      paddingHorizontal: 4,
    },
    dangerZoneTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.error,
      marginBottom: 4,
    },
    dangerZoneBody: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    dangerButton: {
      borderColor: colors.surfaceBorder,
      borderLeftWidth: 3,
      borderLeftColor: colors.error,
    },
    actionButtonIcon: {
      fontSize: 20,
      marginRight: 14,
      width: 36,
      height: 36,
      textAlign: "center",
      textAlignVertical: "center",
      lineHeight: 36,
      borderRadius: 10,
      backgroundColor: colors.background,
      overflow: "hidden",
    },
    actionButtonContent: { flex: 1 },
    actionButtonText: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    dangerText: { color: colors.error },
    actionButtonSubtext: { fontSize: 14, color: colors.textSecondary },
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
    badgeText: { fontSize: 12, fontWeight: "600", color: colors.textPrimary },
    emptyDayList: { padding: 40, alignItems: "center" },
    emptyDayListText: {
      fontSize: 15,
      color: colors.textMuted,
      textAlign: "center",
    },
    fullModalContent: { padding: 20, paddingBottom: 20 },

    settingsTitleContainer: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    settingsSectionIcon: { fontSize: 24, marginRight: 12 },
    settingsSectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    settingsSectionHeaderSimple: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
    },
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
    saveButtonBig: {
      backgroundColor: colors.accent,
      paddingVertical: 16,
      borderRadius: 12,
      alignItems: "center",
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    saveButtonTextBig: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.textOnAccent,
    },
  });
