import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import ScreenTitle from "@shared/components/ScreenTitle";
import { trackScreenView, captureException, reportAndReturn } from "@shared/services/crashReporting";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import QRCode from "react-native-qrcode-svg";
import { useAuth } from "@shared/context/AuthContext";
import { isServerless } from "@shared/services/appMode";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { useJointSessionContext } from "@shared/context/JointSessionContext";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { SocketSubscriber } from "@shared/context/hooks/useRealtimeSocket";
import type { WatchTarget } from "@shared/context/hooks/useJointSession";
import ModalSheet from "@shared/components/ModalSheet";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import ScrollTabBar from "@shared/components/ScrollTabBar";
import { useAlert } from "@shared/components/CustomAlert";
import {
  getActiveTrainee,
  setActiveTrainee,
  onActiveTraineeChange,
} from "@shared/services/trainerEvents";
import ExerciseAnalytics from "@features/analytics/components/ExerciseAnalytics";
import LiveSessionTab from "./components/LiveSessionTab";
import { InviteBanner } from "./components/InviteBanner";
import {
  LiftTogetherButton,
  makeLiftStyles,
} from "./components/LiftTogetherButton";
import { makePermStyles } from "./components/PermissionRow";
import { trainerGrantConfirmation } from "./components/FriendPermissions";
import {
  RequestsPendingWidget,
  RequestsSentWidget,
} from "./components/RequestWidgets";
import { SearchQrWidget, SearchUsersWidget } from "./components/SearchWidgets";
import { FriendTabsBar } from "./components/FriendTabsBar";
import { FriendProgramTab } from "./components/FriendProgramTab";
import { FriendActionsTab } from "./components/FriendActionsTab";
import { friendsApi, sharingApi, REPORT_REASONS } from "./services";
import { MIN_USER_SEARCH_LENGTH } from "./utils";
import { formatTime } from "@utils/timeEstimation";
import { formatDate, toDateString } from "@utils/format";
import {
  buildFriendQrPayload,
  parseFriendQrPayload,
} from "./services/qrFriendCode";
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
  FRIENDS_TABS,
  FRIENDS_WIDGET_REGISTRY,
  DEFAULT_FRIENDS_WIDGETS,
  type FriendsWidgetType,
  REQUESTS_WIDGET_REGISTRY,
  DEFAULT_REQUESTS_WIDGETS,
  type RequestsWidgetType,
  SEARCH_WIDGET_REGISTRY,
  DEFAULT_SEARCH_WIDGETS,
  type SearchWidgetType,
} from "./widgets";
import { STORAGE_KEYS } from "@shared/services/storage";
import type {
  Friend,
  FriendId,
  GrantedPermission,
  ReceivedPermission,
  PendingFriendRequest,
  PermissionType,
  SentFriendRequest,
} from "./services";
import type {
  ProgramData,
  ReceivedProgram,
  SessionRecord,
  GroupedExercise,
  UserSearchResult,
  ReportReason,
  UserRef,
} from "./types";
import type {
  WidgetInstance,
  WidgetDefinition,
  WorkoutData,
} from "@shared/types";
import { Avatar } from "./components/Avatar";
import { mapWithConcurrency } from "@utils/concurrency";
import { userFacingError } from "@shared/services/apiError";

// The server rate-limits each IP to 200 requests a minute, and a shared NAT
// shares that bucket, so opening a friend must not fire dozens at once.
const FRIEND_FETCH_CONCURRENCY = 4;
const SHARED_STATUS_TTL_MS = 10_000;
const STATUS_BATCH_SIZE = 100;

// Each friends widget on Home mounts its own FriendsScreen. They share one
// status sweep rather than each spending a request per friend.
let sharedStatuses: {
  key: string;
  fetchedAt: number;
  statuses: Promise<Record<string | number, boolean>>;
} | null = null;

function fetchFriendSessionStatuses(
  friends: Friend[],
  key: string,
): Promise<Record<string | number, boolean>> {
  if (
    sharedStatuses?.key === key &&
    Date.now() - sharedStatuses.fetchedAt < SHARED_STATUS_TTL_MS
  ) {
    return sharedStatuses.statuses;
  }
  const batches: Friend[][] = [];
  for (let i = 0; i < friends.length; i += STATUS_BATCH_SIZE)
    batches.push(friends.slice(i, i + STATUS_BATCH_SIZE));
  const statuses = Promise.all(
    batches.map((batch) =>
      sharingApi.getFriendSessionStatuses(batch.map((f) => f.id)),
    ),
  )
    .then((maps) => Object.assign({}, ...maps))
    .catch(reportAndReturn({}, { stage: "friendSessionStatuses" }));
  sharedStatuses = { key, fetchedAt: Date.now(), statuses };
  return statuses;
}

type FriendsBoardWidgetType =
  | FriendsWidgetType
  | RequestsWidgetType
  | SearchWidgetType;

type FriendsBoard = ReturnType<typeof useWidgets<FriendsBoardWidgetType>>;

// Each tab's board is generic over its own widget-type union, so the boards
// only share a type once `addWidget` is widened back to the full union.
function toFriendsBoard<T extends FriendsBoardWidgetType>(
  board: ReturnType<typeof useWidgets<T>>,
): FriendsBoard {
  return { ...board, addWidget: (type) => board.addWidget(type as T) };
}

function useFriendSessionStatuses(
  friends: Friend[],
  subscribeToSocket: (handler: SocketSubscriber) => () => void,
  loadFriendsFn?: () => void,
): Record<string | number, boolean> {
  const [statuses, setStatuses] = useState<Record<string | number, boolean>>(
    {},
  );
  const friendIds = useMemo(
    () => friends.map((f) => f.id).join(","),
    [friends],
  );

  const refresh = useCallback(
    async (isCurrent: () => boolean) => {
      if (!friends.length) {
        setStatuses({});
        return;
      }
      const map = await fetchFriendSessionStatuses(friends, friendIds);
      if (isCurrent()) setStatuses(map);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on friendIds so a refetched but unchanged list doesn't refetch every status
    [friendIds],
  );

  useEffect(() => {
    let current = true;
    void refresh(() => current);
    return () => {
      current = false;
    };
  }, [refresh]);

  useEffect(
    () =>
      subscribeToSocket((msg) => {
        if (msg.type === "friend_request_received") {
          loadFriendsFn?.();
          return;
        }
        if (
          msg.type !== "friend_session_started" &&
          msg.type !== "friend_session_ended"
        ) {
          return;
        }
        const friendId = msg.friendId as number | string;
        setStatuses((prev) => ({
          ...prev,
          [friendId]: msg.type === "friend_session_started",
        }));
      }),
    [subscribeToSocket, loadFriendsFn],
  );

  return statuses;
}

interface FriendsListWidgetProps {
  readonly friends: Friend[];
  readonly friendSessionStatuses: Record<string | number, boolean>;
  readonly hasOwnActiveSession: boolean;
  readonly getInviteStatusForFriend: (friendId: number | string) => string;
  readonly isWatching: boolean;
  readonly watchTarget: WatchTarget | null;
  readonly onSelectFriend: (friend: Friend) => void;
  readonly onFindFriends: () => void;
  readonly onSendInvite: (friend: Friend) => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly liftStyles: ReturnType<typeof makeLiftStyles>;
  readonly watchStyles: ReturnType<typeof makeWatchStyles>;
  readonly colors: ThemeColors;
  readonly loadFailed: boolean;
  readonly onRetry: () => void;
}

const FriendsListWidget = React.memo(function FriendsListWidget({
  friends,
  friendSessionStatuses,
  hasOwnActiveSession,
  getInviteStatusForFriend,
  isWatching,
  watchTarget,
  onSelectFriend,
  onFindFriends,
  onSendInvite,
  styles,
  liftStyles,
  watchStyles,
  colors,
  loadFailed,
  onRetry,
}: FriendsListWidgetProps): React.JSX.Element {
  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Your Friends ({friends.length})</Text>
      </View>
      {friends.length === 0 && loadFailed && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>Couldn't load your friends</Text>
          <Text style={styles.emptyText}>
            Check your connection and try again.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={onRetry}
            accessibilityRole='button'
          >
            <Text style={styles.emptyButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
      {friends.length === 0 && !loadFailed && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>👋</Text>
          <Text style={styles.emptyTitle}>No friends yet</Text>
          <Text style={styles.emptyText}>
            Search for users to add friends and share your progress
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={onFindFriends}>
            <Text style={styles.emptyButtonText}>Find Friends</Text>
          </TouchableOpacity>
        </View>
      )}
      {friends.length > 0 && (
        <ScrollView
          style={styles.friendListBounded}
          contentContainerStyle={styles.friendListContent}
          nestedScrollEnabled
        >
          {friends.map((friend) => {
            const friendIsWorkingOut = !!friendSessionStatuses[friend.id];
            const cardStatus = getInviteStatusForFriend(friend.id);
            const showLiftButton =
              hasOwnActiveSession &&
              friendIsWorkingOut &&
              cardStatus !== "active";
            const isBeingWatched =
              isWatching && watchTarget?.friendId === String(friend.id);
            let metaText = `Friends since ${formatDate(friend.createdAt)}`;
            if (isBeingWatched) metaText = "👀 Watching their session";
            else if (friendIsWorkingOut) metaText = "🏋️ Working out now";

            return (
              <TouchableOpacity
                key={String(friend.id)}
                style={[
                  styles.friendCard,
                  friendIsWorkingOut && styles.friendCardActive,
                  isBeingWatched && watchStyles.friendCardWatched,
                ]}
                onPress={() => onSelectFriend(friend)}
                activeOpacity={0.85}
              >
                <View style={styles.friendInfo}>
                  <Avatar
                    username={friend.username}
                    active={friendIsWorkingOut}
                  >
                    {friendIsWorkingOut && (
                      <View style={styles.workingOutDot} />
                    )}
                  </Avatar>
                  <View style={styles.friendDetails}>
                    <Text style={styles.friendName}>{friend.username}</Text>
                    <Text style={styles.friendMeta}>{metaText}</Text>
                  </View>
                </View>
                <View style={styles.friendCardRight}>
                  {showLiftButton && (
                    <LiftTogetherButton
                      small
                      status={cardStatus}
                      onPress={() => onSendInvite(friend)}
                    />
                  )}
                  {cardStatus === "active" && (
                    <View
                      style={[
                        liftStyles.button,
                        liftStyles.buttonSmall,
                        { backgroundColor: colors.success },
                      ]}
                    >
                      <Text style={liftStyles.labelSmall}>✓ Together</Text>
                    </View>
                  )}
                  <Text style={styles.chevronRight}>›</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
});

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

export default function FriendsScreen({
  embedWidget,
}: {
  readonly embedWidget?:
    | FriendsWidgetType
    | RequestsWidgetType
    | SearchWidgetType;
} = {}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const liftStyles = useMemo(() => makeLiftStyles(colors), [colors]);
  const permStyles = useMemo(() => makePermStyles(colors), [colors]);
  const watchStyles = useMemo(() => makeWatchStyles(colors), [colors]);
  const jointStyles = useMemo(() => makeJointStyles(colors), [colors]);
  const { user } = useAuth();
  const { workoutData, workoutStartTime, currentSessionId } = useWorkoutPick(
    "workoutData",
    "workoutStartTime",
    "currentSessionId",
  );

  const {
    isInJointSession,
    jointSession,
    pendingJointInvite,
    jointInviteStatus,
    sendJointInvite,
    acceptJointInvite,
    declineJointInvite,
    leaveJointSession,
    isWatching,
    watchTarget,
    startWatching,
    stopWatching,
    subscribeToSocket,
  } = useJointSessionContext();

  const { alert, AlertComponent } = useAlert();

  const alertError = useCallback(
    (message: string, onPress?: () => void): void =>
      alert("Error", message, [{ text: "OK", onPress }], "error"),
    [alert],
  );

  const confirmDestructive = (
    title: string,
    message: string,
    confirmText: string,
    run: () => Promise<void>,
    failureMessage: string,
  ): void =>
    alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: confirmText,
          style: "destructive",
          onPress: async () => {
            try {
              await run();
            } catch (e) {
              alertError(userFacingError(e, failureMessage));
            }
          },
        },
      ],
      "warning",
    );

  const confirmLeaveJointSession = (): void =>
    confirmDestructive(
      "Leave joint session?",
      "You and your partner will stop seeing each other's progress. Your own sets stay logged.",
      "Leave",
      leaveJointSession,
      "Couldn't leave the joint session",
    );
  const [reportTarget, setReportTarget] = useState<UserRef | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [isOffline, setIsOffline] = useState<boolean>(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("friends");
  useEffect(() => {
    trackScreenView(`Friends/${activeTab}`);
  }, [activeTab]);

  const friendsBoard = useWidgets<FriendsWidgetType>(user?.id ?? null, {
    registry: FRIENDS_WIDGET_REGISTRY,
    defaults: DEFAULT_FRIENDS_WIDGETS,
    storageKey: STORAGE_KEYS.FRIENDS_TAB_WIDGETS,
  });
  const requestsBoard = useWidgets<RequestsWidgetType>(user?.id ?? null, {
    registry: REQUESTS_WIDGET_REGISTRY,
    defaults: DEFAULT_REQUESTS_WIDGETS,
    storageKey: STORAGE_KEYS.REQUESTS_TAB_WIDGETS,
  });
  const searchBoard = useWidgets<SearchWidgetType>(user?.id ?? null, {
    registry: SEARCH_WIDGET_REGISTRY,
    defaults: DEFAULT_SEARCH_WIDGETS,
    storageKey: STORAGE_KEYS.SEARCH_TAB_WIDGETS,
  });

  const boardsByTab: Record<string, FriendsBoard> = {
    friends: toFriendsBoard(friendsBoard),
    requests: toFriendsBoard(requestsBoard),
    search: toFriendsBoard(searchBoard),
  };
  const registriesByTab: Record<
    string,
    Record<string, WidgetDefinition<FriendsBoardWidgetType>>
  > = {
    friends: FRIENDS_WIDGET_REGISTRY,
    requests: REQUESTS_WIDGET_REGISTRY,
    search: SEARCH_WIDGET_REGISTRY,
  };
  const activeBoard = boardsByTab[activeTab] ?? boardsByTab.search;
  const activeRegistry = registriesByTab[activeTab] ?? registriesByTab.search;

  // Two-finger pull opens the active tab's widget panel, as on Home/Tracking.
  const widgetBoard = useWidgetBoard<FriendsBoardWidgetType>(
    activeBoard.addWidget,
    { onError: (m) => alert("Can't Add Widget", m, [{ text: "OK" }]) },
  );

  // Edit mode from one tab must not linger on the next.
  const { closeGallery, setEditMode } = widgetBoard;
  useEffect(() => {
    closeGallery();
    setEditMode(false);
  }, [activeTab, closeGallery, setEditMode]);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [pendingRequests, setPendingRequests] = useState<
    PendingFriendRequest[]
  >([]);
  const [sentRequests, setSentRequests] = useState<SentFriendRequest[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState<boolean>(false);

  const [sendingRequestTo, setSendingRequestTo] = useState<
    number | string | null
  >(null);

  const [showMyQrModal, setShowMyQrModal] = useState<boolean>(false);
  const [showScanQrModal, setShowScanQrModal] = useState<boolean>(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [qrScanLocked, setQrScanLocked] = useState<boolean>(false);
  const [addingFriendFromQr, setAddingFriendFromQr] = useState<boolean>(false);
  const acceptingFriendIdsRef = useRef<Set<number | string>>(new Set());

  const [grantedPermissions, setGrantedPermissions] = useState<
    GrantedPermission[]
  >([]);
  const [receivedPermissions, setReceivedPermissions] = useState<
    ReceivedPermission[]
  >([]);
  const [permissionLoading, setPermissionLoading] = useState<
    Record<string, boolean>
  >({});

  const [showFriendDetailModal, setShowFriendDetailModal] =
    useState<boolean>(false);
  const [activeFriendTab, setActiveFriendTab] = useState<string>("history");
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const friendLoadSeqRef = useRef(0);

  const [friendSessionHistory, setFriendSessionHistory] = useState<
    SessionRecord[]
  >([]);
  const [loadingFriendSessions, setLoadingFriendSessions] =
    useState<boolean>(false);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(
    null,
  );
  const [showSessionDetails, setShowSessionDetails] = useState<boolean>(false);
  const sessionMuscles = [
    ...(selectedSession?.primaryMuscles ?? []),
    ...(selectedSession?.secondaryMuscles ?? []),
  ];
  const [friendSessionsWithTimings, setFriendSessionsWithTimings] = useState<
    SessionRecord[]
  >([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState<boolean>(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);

  const [checkingActiveSession, setCheckingActiveSession] =
    useState<boolean>(false);

  const hasOwnActiveSession = !!workoutStartTime && !!currentSessionId;

  const [trainee, setTrainee] = useState(() => getActiveTrainee());
  useEffect(() => onActiveTraineeChange.subscribe(setTrainee), []);

  const handleStartTrainer = (friend: Friend): void => {
    setActiveTrainee({ userId: String(friend.id), username: friend.username });
    closeFriendDetail();
    alert(
      "Trainer Session Started",
      `You're now logging ${friend.username}'s session. Switch to the Workout tab to record their sets.`,
      [{ text: "OK" }],
      "success",
    );
  };

  const handleStopTrainer = (): void => {
    setActiveTrainee(null);
  };

  const loadFriends = useCallback(async () => {
    const [friendsData, pendingData, sentData] = await Promise.all([
      friendsApi.getFriends(),
      friendsApi.getPendingRequests(),
      friendsApi.getSentRequests(),
    ]);
    setFriends(friendsData || []);
    setPendingRequests(pendingData || []);
    setSentRequests(sentData || []);
  }, []);

  const friendSessionStatuses = useFriendSessionStatuses(
    friends,
    subscribeToSocket,
    loadFriends,
  );
  const [inviteTargetId, setInviteTargetId] = useState<number | string | null>(
    null,
  );

  const getGrantedPermission = (
    friendId: FriendId,
    type: PermissionType,
  ): GrantedPermission | undefined =>
    grantedPermissions.find(
      (p) => p.toUserId === friendId && p.permissionType === type,
    );

  const hasReceivedPermission = useCallback(
    (friendId: FriendId, type: PermissionType): boolean => {
      if (friendId === undefined) return false;
      return receivedPermissions.some(
        (p) => p.fromUserId === friendId && p.permissionType === type,
      );
    },
    [receivedPermissions],
  );

  const setPermLoading = (
    friendId: number | string,
    type: PermissionType,
    val: boolean,
  ): void =>
    setPermissionLoading((prev) => ({ ...prev, [`${friendId}:${type}`]: val }));

  const isPermLoading = (
    friendId: FriendId,
    type: PermissionType,
  ): boolean => {
    if (friendId === undefined) return false;
    return !!permissionLoading[`${friendId}:${type}`];
  };

  const confirmGrantPermission = (friend: Friend, type: PermissionType): void => {
    if (type !== "trainer") {
      void handleGrantPermission(friend, type);
      return;
    }
    const { title, message } = trainerGrantConfirmation(friend.username);
    alert(
      title,
      message,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Grant access",
          onPress: () => void handleGrantPermission(friend, type),
        },
      ],
      "warning",
    );
  };

  const handleGrantPermission = async (
    friend: Friend,
    type: PermissionType,
    payload: Record<string, unknown> | null = null,
  ) => {
    setPermLoading(friend.id, type, true);
    try {
      await sharingApi.grantPermission(friend.id, type, payload);
      await loadPermissions();
    } catch (e) {
      alertError(userFacingError(e, "Failed to grant permission"));
    } finally {
      setPermLoading(friend.id, type, false);
    }
  };

  const handleRevokePermission = async (
    friend: Friend,
    type: PermissionType,
  ) => {
    const perm = getGrantedPermission(friend.id, type);
    if (!perm) return;
    setPermLoading(friend.id, type, true);
    try {
      await sharingApi.revokePermission(perm.id);
      await loadPermissions();
    } catch (e) {
      alertError(userFacingError(e, "Failed to revoke permission"));
    } finally {
      setPermLoading(friend.id, type, false);
    }
  };

  const handleGrantProgramPermission = async (friend: Friend) => {
    if (!workoutData) {
      alert(
        "No Program Loaded",
        "Load a workout program first before sharing it.",
        [{ text: "OK" }],
        "info",
      );
      return;
    }
    const wd = workoutData as WorkoutData & { people?: string[] };
    const split = wd.split ?? wd.people;
    const payload: Record<string, unknown> = {
      programData: {
        name: `${split?.join("/")} Program, ${wd.totalDays} Days`,
        totalDays: wd.totalDays,
        split,
        days: wd.days,
      },
      message: null,
    };
    await handleGrantPermission(friend, "program", payload);
  };

  const getInviteStatusForFriend = useCallback(
    (friendId: number | string): string => {
      if (isInJointSession) {
        const partnerInSession = jointSession?.participants?.find(
          (p) => p.userId !== user?.id,
        );
        return partnerInSession?.userId === friendId ? "active" : "idle";
      }
      if (inviteTargetId === friendId) return jointInviteStatus;
      return "idle";
    },
    [isInJointSession, jointSession, user, inviteTargetId, jointInviteStatus],
  );

  const handleSendInvite = useCallback(
    async (friend: Friend) => {
      if (!hasOwnActiveSession) {
        alert(
          "Start a workout first",
          "You need to have an active workout session before inviting a friend.",
          [{ text: "OK" }],
          "info",
        );
        return;
      }
      setInviteTargetId(friend.id);
      const ok = await sendJointInvite(String(friend.id));
      if (!ok) {
        setInviteTargetId(null);
        alertError("Could not send the invite. Try again.");
      }
    },
    [hasOwnActiveSession, alert, sendJointInvite, alertError],
  );

  useEffect(() => {
    if (jointInviteStatus === "idle" || jointInviteStatus === "active")
      setInviteTargetId(null);
  }, [jointInviteStatus]);

  const handleAcceptInvite = async () => {
    if (!workoutStartTime) {
      alert(
        "Start your workout first",
        "Accept the invite after you've begun your own workout session.",
        [{ text: "OK" }],
        "info",
      );
      return;
    }
    const ok = await acceptJointInvite();
    if (!ok) alertError("Could not join the session.");
  };

  const handleWatchSession = async (friend: Friend) => {
    if (!friend) return;
    if (isWatching && watchTarget?.friendId === String(friend.id)) {
      alert(
        "Already Watching",
        `You're already watching ${friend.username}'s session. Switch to the Workout tab.`,
        [{ text: "OK" }],
        "info",
      );
      return;
    }
    if (isWatching) stopWatching();

    setCheckingActiveSession(true);
    try {
      const activeSession = await sharingApi.getFriendActiveSession(friend.id);
      if (!activeSession) {
        alert(
          "No Active Session",
          `${friend.username} doesn't have an active workout session right now.`,
          [{ text: "OK" }],
          "info",
        );
        return;
      }
      const { sessionId } = activeSession;
      const ok = await startWatching(
        String(friend.id),
        friend.username,
        sessionId,
      );
      if (ok) {
        alert(
          "Watching 👀",
          `You're now watching ${friend.username}'s workout. Switch to the Workout tab to see it live.`,
          [{ text: "Go to Workout" }],
          "success",
        );
      } else {
        alert(
          "Session Ended",
          `${friend.username}'s session may have just ended.`,
          [{ text: "OK" }],
          "info",
        );
      }
    } catch (error) {
      captureException(error, { stage: "loadLiveSession" });
      alertError("Could not load the live session. Try again.");
    } finally {
      setCheckingActiveSession(false);
    }
  };

  useEffect(() => {
    if (user?.id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload only when the signed-in user changes
  }, [user?.id]);

  const loadPermissions = useCallback(async () => {
    const [granted, received] = await Promise.all([
      sharingApi.getGrantedPermissions().catch(reportAndReturn([] as GrantedPermission[], { stage: "loadPermissions" })),
      sharingApi
        .getReceivedPermissions()
        .catch(reportAndReturn([] as ReceivedPermission[], { stage: "loadPermissions" })),
    ]);
    setGrantedPermissions(granted);
    setReceivedPermissions(received);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    if (await isServerless()) {
      setIsOffline(true);
      setLoading(false);
      return;
    }
    setIsOffline(false);
    try {
      await Promise.all([loadFriends(), loadPermissions()]);
      setLoadFailed(false);
    } catch (error) {
      captureException(error, { stage: "loadFriendsData" });
      setLoadFailed(true);
      if (friends.length > 0) alertError("Failed to load friends data");
    } finally {
      setLoading(false);
    }
  }, [loadFriends, loadPermissions, alertError, friends]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
    } catch {
      // loadData already reports its own failures.
    } finally {
      setRefreshing(false);
    }
  };

  const hasFriendSharedHistoryWith = useCallback(
    (friendId: FriendId): boolean =>
      !!friendId && hasReceivedPermission(friendId, "history"),
    [hasReceivedPermission],
  );

  const receivedPrograms: ReceivedProgram[] = receivedPermissions
    .filter(
      (p) =>
        p.permissionType === "program" &&
        (p.payload as Record<string, unknown>)?.programData,
    )
    .map((p) => ({
      id: p.id,
      senderId: p.fromUserId,
      senderUsername: p.fromUsername,
      sharedAt: p.createdAt,
      message:
        ((p.payload as Record<string, unknown>)?.message as string) ?? null,
      programData: (p.payload as Record<string, unknown>)
        .programData as ProgramData,
    }));

  const searchSeqRef = useRef(0);
  const handleSearch = useCallback(async () => {
    const seq = ++searchSeqRef.current;
    if (searchQuery.trim().length < MIN_USER_SEARCH_LENGTH) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await friendsApi.searchUsers(searchQuery.trim(), 20);
      if (seq === searchSeqRef.current) setSearchResults(results || []);
    } catch (error) {
      captureException(error, { stage: "searchUsers" });
      if (seq === searchSeqRef.current) alertError("Failed to search users");
    } finally {
      if (seq === searchSeqRef.current) setSearching(false);
    }
  }, [searchQuery, alertError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= MIN_USER_SEARCH_LENGTH) void handleSearch();
      else {
        searchSeqRef.current++;
        setSearchResults([]);
        setSearching(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, handleSearch]);

  const sendFriendRequest = async (username: string) => {
    if (sendingRequestTo === username) return;
    setSendingRequestTo(username);
    try {
      await friendsApi.sendFriendRequest(username);
      await loadFriends();
      setSearchQuery("");
      setSearchResults([]);
    } catch (error) {
      alertError(userFacingError(error, "Failed to send friend request"));
    } finally {
      setSendingRequestTo(null);
    }
  };

  const openScanQrModal = async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        alert(
          "Camera Access Needed",
          "Enable camera access in your device settings to scan a friend's QR code.",
          [{ text: "OK" }],
          "error",
        );
        return;
      }
    }
    setQrScanLocked(false);
    setShowScanQrModal(true);
  };

  const handleQrScanned = async (result: BarcodeScanningResult) => {
    if (qrScanLocked) return;
    setQrScanLocked(true);

    const payload = parseFriendQrPayload(result.data);
    if (!payload) {
      alert(
        "Invalid Code",
        "That doesn't look like a friend QR code from this app.",
        [{ text: "OK", onPress: () => setQrScanLocked(false) }],
        "error",
      );
      return;
    }

    if (payload.username === user?.username || payload.id === user?.id) {
      alert(
        "That's You!",
        "You can't add yourself as a friend.",
        [{ text: "OK", onPress: () => setQrScanLocked(false) }],
        "error",
      );
      return;
    }

    const isFriend = friends.some(
      (f) => f.id === payload.id || f.username === payload.username,
    );
    if (isFriend) {
      alert(
        "Already Friends",
        `You and ${payload.username} are already friends.`,
        [{ text: "OK", onPress: () => setShowScanQrModal(false) }],
        "info",
      );
      return;
    }

    setAddingFriendFromQr(true);
    try {
      await friendsApi.sendFriendRequest(payload.username);
      await loadFriends();
      setShowScanQrModal(false);
      alert(
        "Request Sent",
        `Friend request sent to ${payload.username}.`,
        [{ text: "OK" }],
        "success",
      );
    } catch (error) {
      alertError(userFacingError(error, "Failed to send friend request"), () =>
        setQrScanLocked(false),
      );
    } finally {
      setAddingFriendFromQr(false);
    }
  };

  const acceptFriendRequest = async (friendshipId: number | string) => {
    if (acceptingFriendIdsRef.current.has(friendshipId)) return;
    acceptingFriendIdsRef.current.add(friendshipId);
    try {
      await friendsApi.acceptFriendRequest(friendshipId);
      await loadFriends();
    } catch (error) {
      alertError(userFacingError(error, "Failed to accept friend request"));
    } finally {
      acceptingFriendIdsRef.current.delete(friendshipId);
    }
  };

  const rejectFriendRequest = (
    friendshipId: number | string,
    username: string,
  ): void =>
    confirmDestructive(
      "Reject Request",
      `Reject friend request from ${username}?`,
      "Reject",
      async () => {
        await friendsApi.rejectFriendRequest(friendshipId);
        await loadFriends();
      },
      "Failed",
    );

  const cancelSentRequest = (
    friendshipId: number | string,
    username: string,
  ): void =>
    confirmDestructive(
      "Cancel Request",
      `Cancel your friend request to ${username}?`,
      "Cancel Request",
      async () => {
        await friendsApi.rejectFriendRequest(friendshipId);
        await loadFriends();
      },
      "Failed to cancel request",
    );

  const stopTrainingFriend = (friend: UserRef): void => {
    if (getActiveTrainee()?.userId === String(friend.id)) {
      setActiveTrainee(null);
    }
  };

  const handleRemoveFriend = (friend: Friend): void => {
    confirmDestructive(
      "Remove Friend",
      `Remove ${friend.username} from your friends list?`,
      "Remove",
      async () => {
        await friendsApi.removeFriend(friend.id);
        stopTrainingFriend(friend);
        closeFriendDetail();
        await loadFriends();
      },
      "Failed",
    );
  };

  const handleBlockFriend = (friend: UserRef): void => {
    confirmDestructive(
      "Block User",
      `Block ${friend.username}? They will be removed from your friends, ` +
        `everything you share with each other stops, and neither of you can ` +
        `send the other a friend request until you unblock them.`,
      "Block",
      async () => {
        await friendsApi.blockUser(friend.id);
        stopTrainingFriend(friend);
        closeFriendDetail();
        await loadFriends();
        alert(
          "Blocked",
          `${friend.username} has been blocked. You can unblock them in Settings.`,
          [{ text: "OK" }],
          "success",
        );
      },
      "Failed to block user",
    );
  };

  const handleReportFriend = (friend: UserRef) => {
    setShowFriendDetailModal(false);
    setReportReason(null);
    setReportDetails("");
    setReportTarget(friend);
  };

  const showUserSafetyActions = (target: UserRef): void =>
    alert(
      target.username,
      "Report this account to the server's operator, or block it so it can't contact you.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report", onPress: () => handleReportFriend(target) },
        {
          text: "Block",
          style: "destructive",
          onPress: () => handleBlockFriend(target),
        },
      ],
      "info",
    );

  const submitReport = async () => {
    if (!reportTarget || !reportReason) return;
    setSubmittingReport(true);
    try {
      await friendsApi.reportUser(
        reportTarget.id,
        reportReason,
        reportDetails.trim() || undefined,
      );
      setReportTarget(null);
      alert(
        "Report Sent",
        "Whoever runs this server can now review it. You can also block this user to cut off contact straight away.",
        [{ text: "OK" }],
        "success",
      );
    } catch (e) {
      alertError(userFacingError(e, "Failed to submit report"));
    } finally {
      setSubmittingReport(false);
    }
  };

  const loadFriendData = useCallback(
    async (friend: Friend) => {
      const seq = ++friendLoadSeqRef.current;
      const sharesHistory = hasFriendSharedHistoryWith(friend.id);
      setShowFriendDetailModal(true);
      setActiveFriendTab(sharesHistory ? "history" : "actions");
      if (!sharesHistory) {
        setFriendSessionHistory([]);
        setFriendSessionsWithTimings([]);
        return;
      }
      setLoadingFriendSessions(true);
      setFriendSessionsWithTimings([]);
      try {
        const sessions = await sharingApi.getFriendSessions(friend.id, 60);
        if (seq !== friendLoadSeqRef.current) return;
        setFriendSessionHistory((sessions || []) as SessionRecord[]);
      } catch (error) {
        captureException(error, { stage: "loadFriendHistory" });
        if (seq !== friendLoadSeqRef.current) return;
        alertError("Failed to load friend's workout history");
        setFriendSessionHistory([]);
      } finally {
        if (seq === friendLoadSeqRef.current) setLoadingFriendSessions(false);
      }
    },
    [hasFriendSharedHistoryWith, alertError],
  );

  const loadFriendAnalytics = async (
    friend: Friend,
    sessions: SessionRecord[],
  ) => {
    if (!friend || !sessions.length) return;
    const seq = friendLoadSeqRef.current;
    setLoadingAnalytics(true);
    try {
      const batched = await sharingApi
        .getFriendSessionsWithTimings(friend.id, sessions.length)
        .catch(reportAndReturn(null, { stage: "friendSessionTimings" }));
      const detailed = batched ?? await mapWithConcurrency(
        sessions,
        FRIEND_FETCH_CONCURRENCY,
        (s) =>
          sharingApi
            .getFriendSessionDetails(friend.id, s.id)
            .then((d) => d ?? { ...s, setTimings: [] })
            .catch(reportAndReturn({ ...s, setTimings: [] }, { stage: "friendSessionDetails" })),
      );
      if (seq === friendLoadSeqRef.current)
        setFriendSessionsWithTimings(detailed as SessionRecord[]);
    } catch (error) {
      captureException(error, { stage: "friendAnalytics" });
    } finally {
      setLoadingAnalytics(false);
    }
  };

  useEffect(() => {
    if (
      activeFriendTab === "analytics" &&
      selectedFriend &&
      friendSessionHistory.length > 0 &&
      friendSessionsWithTimings.length === 0 &&
      !loadingAnalytics
    )
      loadFriendAnalytics(selectedFriend, friendSessionHistory);
  }, [
    activeFriendTab,
    selectedFriend,
    friendSessionHistory,
    friendSessionsWithTimings.length,
    loadingAnalytics,
  ]);

  const getSessionsForDate = (date: Date): SessionRecord[] => {
    const t = toDateString(date);
    return friendSessionHistory.filter(
      (s) => String(s.startTime).replace("T", " ").split(" ")[0] === t,
    );
  };
  const hasSessionOnDate = (date: Date): boolean =>
    getSessionsForDate(date).length > 0;
  const handleDatePress = (date: Date) => {
    const s = getSessionsForDate(date);
    if (s.length === 1) handleSessionPress(s[0], selectedFriend);
    else if (s.length > 1) setSelectedDate(date);
  };

  const handleSessionPress = async (
    session: SessionRecord,
    friend: Friend | null = selectedFriend,
  ) => {
    if (!friend) {
      alertError("Friend context lost.");
      return;
    }
    try {
      const details = (await sharingApi.getFriendSessionDetails(
        friend.id,
        session.id,
      )) as SessionRecord | null;
      if (!details) throw new Error("Session details unavailable");
      if (details.setTimings && details.setTimings.length > 0) {
        const map = new Map<string, GroupedExercise>();
        details.setTimings.forEach((t) => {
          const k = t.exerciseName || `Exercise ${t.exerciseId ?? "?"}`;
          if (!map.has(k)) map.set(k, { exerciseName: k, sets: [] });
          map.get(k)!.sets.push(t);
        });
        map.forEach((ex) => {
          ex.sets = ex.sets.toSorted(
            (a: { setIndex: number }, b: { setIndex: number }) =>
              a.setIndex - b.setIndex,
          );
        });
        details.groupedExercises = Array.from(map.values());
      } else {
        details.groupedExercises = [];
      }
      setSelectedSession(details);
      setSelectedDate(null);
      setShowSessionDetails(true);
    } catch (error) {
      captureException(error, { stage: "loadFriendSessionDetails" });
      alertError("Failed to load session details");
    }
  };

  const formatSessionTime = (s: string | number | undefined): string => {
    const p = String(s).replace("T", " ").split(" ")[1] || "";
    const [h, m] = p.split(":");
    const hr = Number.parseInt(h);
    if (!Number.isFinite(hr)) return "—";
    return `${hr % 12 || 12}:${m || "00"} ${hr >= 12 ? "PM" : "AM"}`;
  };
  const getSessionTitle = (s: SessionRecord | null): string => {
    if (!s?.dayTitle) return `Day ${s?.dayNumber ?? ""}`;
    const p = s.dayTitle.split("—");
    return p.length > 1 ? p[1].trim() : s.dayTitle;
  };

  const closeSessionDetails = (): void => {
    setShowSessionDetails(false);
    setSelectedSession(null);
  };

  const closeFriendDetail = (): void => {
    friendLoadSeqRef.current++;
    setShowFriendDetailModal(false);
    setSelectedFriend(null);
    setFriendSessionHistory([]);
    setFriendSessionsWithTimings([]);
    setSelectedDate(null);
  };

  const handleLockedFriendTab = (tabKey: string): void => {
    const LOCK_MESSAGE_BY_TAB: Record<string, string> = {
      history: `${selectedFriend?.username} hasn't granted you History access yet.`,
      analytics: `Analytics needs both History and Analytics access from ${selectedFriend?.username}.`,
      program: `${selectedFriend?.username} hasn't shared a program with you yet.`,
      live: `${selectedFriend?.username} hasn't granted you Watch Session permission yet.`,
    };
    const msg =
      LOCK_MESSAGE_BY_TAB[tabKey] ??
      `${selectedFriend?.username} hasn't granted you analytics access yet.`;
    alert("Not Available", msg, [{ text: "OK" }], "lock");
  };

  const inviteForBanner: { fromUsername: string } | null = pendingJointInvite
    ? {
        fromUsername:
          typeof pendingJointInvite.fromUsername === "string"
            ? pendingJointInvite.fromUsername
            : "",
      }
    : null;

  const handleSelectFriend = useCallback(
    (friend: Friend) => {
      setSelectedFriend(friend);
      void loadFriendData(friend);
    },
    [loadFriendData],
  );

  const handleFindFriends = useCallback(() => setActiveTab("search"), []);

  const handleRetryLoad = useCallback(() => void loadData(), [loadData]);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={["top"]}>
        <ActivityIndicator size='large' color={colors.accent} />
        <Text style={styles.loadingText}>Loading friends...</Text>
      </SafeAreaView>
    );
  }

  if (isOffline) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={["top"]}>
        <Text style={styles.loadingText}>
          Friends require an internet connection. Switch to Server Mode in
          Settings to use this feature.
        </Text>
      </SafeAreaView>
    );
  }

  // Typed loosely because it serves all three differently-typed boards.
  const renderWidgetContent = (
    instance: WidgetInstance<string>,
  ): React.ReactNode => {
    switch (instance.type) {
      case "friends_list":
        return (
          <FriendsListWidget
            friends={friends}
            friendSessionStatuses={friendSessionStatuses}
            hasOwnActiveSession={hasOwnActiveSession}
            getInviteStatusForFriend={getInviteStatusForFriend}
            isWatching={isWatching}
            watchTarget={watchTarget}
            onSelectFriend={handleSelectFriend}
            onFindFriends={handleFindFriends}
            onSendInvite={handleSendInvite}
            styles={styles}
            liftStyles={liftStyles}
            watchStyles={watchStyles}
            colors={colors}
            loadFailed={loadFailed}
            onRetry={handleRetryLoad}
          />
        );

      case "requests_pending":
        return (
          <RequestsPendingWidget
            pendingRequests={pendingRequests}
            styles={styles}
            onAccept={acceptFriendRequest}
            onReject={rejectFriendRequest}
            onMoreActions={showUserSafetyActions}
          />
        );

      case "requests_sent":
        return (
          <RequestsSentWidget
            sentRequests={sentRequests}
            styles={styles}
            onCancel={cancelSentRequest}
          />
        );

      case "search_qr":
        return (
          <SearchQrWidget
            permStyles={permStyles}
            onShowMyQr={() => setShowMyQrModal(true)}
            onScanQr={openScanQrModal}
          />
        );

      case "search_users":
        return (
          <SearchUsersWidget
            styles={styles}
            colors={colors}
            searchQuery={searchQuery}
            onChangeQuery={setSearchQuery}
            searching={searching}
            searchResults={searchResults}
            friends={friends}
            sentRequests={sentRequests}
            pendingRequests={pendingRequests}
            currentUserId={user?.id}
            onGoToRequests={() => setActiveTab("requests")}
            onAddFriend={sendFriendRequest}
            sendingRequestTo={sendingRequestTo}
            onMoreActions={showUserSafetyActions}
          />
        );

      default:
        return <Text style={styles.emptyTextSmall}>Coming soon</Text>;
    }
  };

  const renderModals = (): React.JSX.Element => (
    <>
      <ModalSheet
        visible={showFriendDetailModal}
        fullHeight={true}
        showCancelButton={false}
        showConfirmButton={false}
        onClose={closeFriendDetail}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={closeFriendDetail}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>
              {selectedFriend?.username || ""}
            </Text>
            <View style={styles.backButton} />
          </View>

          <FriendTabsBar
            selectedFriend={selectedFriend}
            activeFriendTab={activeFriendTab}
            receivedPrograms={receivedPrograms}
            hasReceivedPermission={hasReceivedPermission}
            onSelectTab={setActiveFriendTab}
            onLockedTab={handleLockedFriendTab}
            styles={styles}
          />

          {activeFriendTab === "history" &&
            (hasFriendSharedHistoryWith(selectedFriend?.id) ? (
              <ScrollView style={styles.modalScroll}>
                <View style={styles.friendDetailContent}>
                  <View style={styles.workoutHistorySection}>
                    <Text style={styles.sectionTitleLarge}>
                      📅 Workout History
                    </Text>
                    {loadingFriendSessions ? (
                      <View style={styles.calendarLoading}>
                        <ActivityIndicator size='large' color={colors.accent} />
                      </View>
                    ) : (
                      <>
                        <Text style={styles.calendarHint}>
                          Tap a date to view workout details
                        </Text>
                        <UniversalCalendar
                          hasDataOnDate={hasSessionOnDate}
                          onDatePress={handleDatePress}
                          initialView='month'
                          dotColor='#10b981'
                          legendText='Workout day'
                        />
                      </>
                    )}
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔒</Text>
                <Text style={styles.emptyTitle}>Not shared yet</Text>
                <Text style={styles.emptyText}>
                  {selectedFriend?.username} hasn't granted you history
                  access.
                </Text>
              </View>
            ))}

          {activeFriendTab === "analytics" &&
            (loadingAnalytics ? (
              <View style={styles.analyticsLoading}>
                <ActivityIndicator size='large' color={colors.accent} />
                <Text style={styles.analyticsLoadingText}>
                  Loading exercise data...
                </Text>
              </View>
            ) : (
              <View style={{ flex: 1 }}>
                <ExerciseAnalytics
                  sessions={
                    friendSessionsWithTimings as Parameters<
                      typeof ExerciseAnalytics
                    >[0]["sessions"]
                  }
                  workoutData={null}
                  selectedSplit={null}
                  title={`📊 ${selectedFriend?.username}'s Analytics`}
                  completedDays={{}}
                  currentBodyWeight={null}
                />
              </View>
            ))}

          {activeFriendTab === "program" && (
            <FriendProgramTab
              selectedFriend={selectedFriend}
              receivedPrograms={receivedPrograms}
              selectedProgram={selectedProgram}
              setSelectedProgram={setSelectedProgram}
              styles={styles}
            />
          )}

          {activeFriendTab === "live" && selectedFriend && (
            <LiveSessionTab
              friend={{ ...selectedFriend, id: String(selectedFriend.id) }}
              isVisible={showFriendDetailModal}
              receivedPrograms={receivedPrograms.map((p) => ({
                ...p,
                senderId: String(p.senderId),
              }))}
              subscribeToSocket={subscribeToSocket}
            />
          )}

          {activeFriendTab === "actions" && (
            <FriendActionsTab
              selectedFriend={selectedFriend}
              hasTrainerAccess={hasReceivedPermission(
                selectedFriend?.id,
                "trainer",
              )}
              activeTraineeUserId={trainee?.userId ?? null}
              styles={styles}
              watchStyles={watchStyles}
              jointStyles={jointStyles}
              colors={colors}
              workoutData={workoutData}
              getGrantedPermission={getGrantedPermission}
              isPermLoading={isPermLoading}
              hasReceivedPermission={hasReceivedPermission}
              onGrantPermission={confirmGrantPermission}
              onRevokePermission={handleRevokePermission}
              onGrantProgramPermission={handleGrantProgramPermission}
              friendSessionStatuses={friendSessionStatuses}
              checkingActiveSession={checkingActiveSession}
              onWatchSession={handleWatchSession}
              hasOwnActiveSession={hasOwnActiveSession}
              getInviteStatusForFriend={getInviteStatusForFriend}
              onSendInvite={handleSendInvite}
              onStartTrainer={handleStartTrainer}
              onStopTrainer={handleStopTrainer}
              onRemoveFriend={handleRemoveFriend}
              onBlockFriend={handleBlockFriend}
              onReportFriend={handleReportFriend}
              onLeaveJointSession={confirmLeaveJointSession}
            />
          )}
        </SafeAreaView>
      </ModalSheet>

      <ModalSheet
        visible={selectedDate !== null}
        onClose={() => setSelectedDate(null)}
        title={
          selectedDate
            ? formatDate(selectedDate, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })
            : ""
        }
        showCancelButton={false}
        showConfirmButton={false}
        scrollable={true}
      >
        {selectedDate &&
          getSessionsForDate(selectedDate).map((session) => (
            <TouchableOpacity
              key={String(session.id)}
              style={styles.sessionListItem}
              onPress={() => handleSessionPress(session, selectedFriend)}
            >
              <View style={styles.sessionListLeft}>
                <Text style={styles.sessionListTitle}>
                  {`Day ${session.dayNumber} - ${getSessionTitle(session)}`}
                </Text>
                <View style={styles.sessionListMeta}>
                  <Text style={styles.sessionListTime}>
                    {`⏱️ ${formatSessionTime(session.startTime)}`}
                  </Text>
                  {!!session.totalDuration && (
                    <Text style={styles.sessionListDuration}>
                      {` • ${formatTime(session.totalDuration ?? 0, "N/A")}`}
                    </Text>
                  )}
                  <Text style={styles.sessionListSets}>
                    {` • ${session.completedSets} sets`}
                  </Text>
                </View>
              </View>
              <Text style={styles.sessionListArrow}>›</Text>
            </TouchableOpacity>
          ))}
      </ModalSheet>

      <ModalSheet
        visible={showSessionDetails}
        onClose={closeSessionDetails}
        title='Session Details'
        scrollable={true}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={closeSessionDetails}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.modalHeaderTitle}>Workout Details</Text>
            <View style={styles.backButton} />
          </View>
          <ScrollView style={styles.modalScroll}>
            <View style={styles.sessionDetailsContent}>
              {selectedSession && (
                <>
                  <View style={styles.detailSection}>
                    <Text style={styles.detailTitle}>
                      Day {selectedSession.dayNumber}
                    </Text>
                    <Text style={styles.detailSubtitle}>
                      {getSessionTitle(selectedSession)}
                    </Text>
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
                          selectedSession.startTime as string | number,
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
                        {formatTime(selectedSession.totalDuration ?? 0, "N/A")}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Sets Completed</Text>
                      <Text style={styles.detailValue}>
                        {selectedSession.completedSets ?? 0}
                      </Text>
                    </View>
                  </View>
                  {Array.isArray(selectedSession.groupedExercises) &&
                    selectedSession.groupedExercises.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={styles.detailSectionTitle}>Exercises</Text>
                        {selectedSession.groupedExercises.map((exercise) => (
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

      <ModalSheet
        visible={showMyQrModal}
        onClose={() => setShowMyQrModal(false)}
        title='My QR Code'
        showCancelButton={false}
        showConfirmButton={false}
      >
        <View style={styles.qrModalContent}>
          <Text style={styles.qrModalHint}>
            Have a friend scan this with their camera to send you a friend
            request.
          </Text>
          <View style={styles.qrCodeWrapper}>
            {user?.username ? (
              <QRCode
                value={buildFriendQrPayload(user.id, user.username)}
                size={220}
                backgroundColor={colors.surface}
              />
            ) : (
              <ActivityIndicator size='large' color={colors.accent} />
            )}
          </View>
          {!!user?.username && (
            <Text style={styles.qrModalUsername}>{user.username}</Text>
          )}
        </View>
      </ModalSheet>

      <ModalSheet
        visible={showScanQrModal}
        onClose={() => setShowScanQrModal(false)}
        title="Scan Friend's QR Code"
        showCancelButton={false}
        showConfirmButton={false}
        fullHeight={true}
      >
        <View style={styles.qrScannerContainer}>
          {cameraPermission?.granted ? (
            <>
              <CameraView
                style={styles.qrCameraView}
                facing='back'
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={qrScanLocked ? undefined : handleQrScanned}
              />
              <View style={styles.qrScanFrame} pointerEvents='none' />
              <Text style={styles.qrScannerHint}>
                Point your camera at your friend's QR code
              </Text>
              {addingFriendFromQr && (
                <View style={styles.qrScannerLoading}>
                  <ActivityIndicator size='large' color='#fff' />
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyStateSmall}>
              <Text style={styles.emptyTextSmall}>
                Camera access is needed to scan QR codes. You can enable it in
                your device settings.
              </Text>
            </View>
          )}
        </View>
      </ModalSheet>

      <ModalSheet
        visible={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        title={reportTarget ? `Report ${reportTarget.username}` : "Report"}
        subtitle='Reports go to the operator of the server you are signed in to.'
        confirmText={submittingReport ? "Sending…" : "Submit Report"}
        confirmDisabled={!reportReason || submittingReport}
        onConfirm={submitReport}
        scrollable={true}
      >
        <View style={styles.reportModalContent}>
          {REPORT_REASONS.map((reason) => (
            <TouchableOpacity
              key={reason.key}
              style={[
                styles.reportReasonRow,
                reportReason === reason.key && styles.reportReasonRowActive,
              ]}
              onPress={() => setReportReason(reason.key)}
              activeOpacity={0.7}
              accessibilityRole='radio'
              accessibilityState={{ selected: reportReason === reason.key }}
              accessibilityLabel={reason.label}
            >
              <Text style={styles.reportReasonText}>{reason.label}</Text>
              {reportReason === reason.key && (
                <Text style={styles.reportReasonCheck}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.reportDetailsInput}
            value={reportDetails}
            onChangeText={setReportDetails}
            placeholder='Anything else the operator should know (optional)'
            placeholderTextColor={colors.textMuted}
            multiline={true}
            maxLength={1000}
            accessibilityLabel='Additional report details'
          />
        </View>
      </ModalSheet>
    </>
  );

  return (
    <SafeAreaView
      style={embedWidget ? undefined : { flex: 1 }}
      edges={embedWidget ? [] : ["top"]}
      {...(embedWidget ? {} : widgetBoard.panHandlers)}
    >
      {embedWidget && renderWidgetContent(embedInstance(embedWidget))}
      {!embedWidget && (
        <>
          {widgetBoard.isPulling && (
            <WidgetPullHint armed={widgetBoard.pullArmed} />
          )}
          <InviteBanner
            invite={inviteForBanner}
            onAccept={handleAcceptInvite}
            onDecline={declineJointInvite}
          />

          {isInJointSession && (
            <View style={styles.activeSessionPill}>
              <View style={styles.liveIndicator} />
              <Text style={styles.activeSessionText}>Joint session active</Text>
              <TouchableOpacity
                onPress={confirmLeaveJointSession}
                hitSlop={14}
                accessibilityRole='button'
                accessibilityLabel='Leave joint session'
              >
                <Text style={styles.leaveText}>Leave</Text>
              </TouchableOpacity>
            </View>
          )}

          {isWatching && (
            <View style={[styles.activeSessionPill, watchStyles.pill]}>
              <Text style={watchStyles.pillIcon}>👀</Text>
              <Text style={watchStyles.pillText}>
                Watching {watchTarget?.friendUsername}
              </Text>
              <TouchableOpacity
                onPress={stopWatching}
                hitSlop={14}
                accessibilityRole='button'
                accessibilityLabel={`Stop watching ${watchTarget?.friendUsername ?? "session"}`}
              >
                <Text style={styles.leaveText}>Stop</Text>
              </TouchableOpacity>
            </View>
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
              />
            }
          >
            <View style={styles.content}>
              <ScreenTitle title='Friends' />

              <ScrollTabBar
                tabs={FRIENDS_TABS}
                activeTab={activeTab}
                onTabChange={setActiveTab}
                badges={{ requests: pendingRequests.length }}
                storageKey='friendsScreen_tabConfig'
              />

              {activeBoard.isLoaded && activeBoard.widgets.length > 0 && (
                <WidgetEditHeader
                  editMode={widgetBoard.editMode}
                  onDone={() => widgetBoard.setEditMode(false)}
                />
              )}

              {activeBoard.isLoaded && activeBoard.widgets.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>
                    No widgets on this tab yet
                  </Text>
                  <TouchableOpacity
                    style={styles.emptyButton}
                    onPress={widgetBoard.openGallery}
                  >
                    <Text style={styles.emptyButtonText}>+ Add a Widget</Text>
                  </TouchableOpacity>
                </View>
              )}

              <WidgetsPanel
                key={activeTab}
                widgets={activeBoard.widgets}
                editMode={widgetBoard.editMode}
                onCycleSize={activeBoard.cycleWidgetSize}
                onRemove={activeBoard.removeWidget}
                onReorder={activeBoard.reorderWidgets}
                renderContent={renderWidgetContent}
                registry={activeRegistry}
              />

              {activeBoard.isLoaded && activeBoard.widgets.length > 0 && (
                <WidgetEditButton onPress={widgetBoard.openGallery} />
              )}
            </View>
          </ScrollView>

          <WidgetGallery
            visible={widgetBoard.galleryVisible}
            onClose={widgetBoard.closeGallery}
            availableWidgets={activeBoard.availableToAdd}
            onAddWidget={widgetBoard.add}
            hasPlacedWidgets={activeBoard.widgets.length > 0}
            onEditWidgets={widgetBoard.editWidgets}
          />
        </>
      )}

      {renderModals()}

      {AlertComponent}
    </SafeAreaView>
  );
}

export const makeWatchStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pill: {
      backgroundColor: colors.infoLight,
      borderBottomColor: colors.surfaceBorder,
    },
    pillIcon: { fontSize: 16 },
    pillText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.info },
    friendCardWatched: {
      borderWidth: 2,
      borderColor: colors.info,
      backgroundColor: colors.infoLight,
    },
    activeRow: {
      backgroundColor: colors.infoLight,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    availableRow: {
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.infoLight,
    },
    stopBtn: {
      backgroundColor: colors.errorLight,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    stopBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  });

export const makeJointStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    activeRow: {
      backgroundColor: colors.successLight,
      borderWidth: 1,
      borderColor: colors.success,
    },
    inviteRow: {
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    liveDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.success,
      marginRight: 14,
      shadowColor: colors.success,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
      elevation: 3,
    },
    leaveBtn: {
      backgroundColor: colors.errorLight,
      paddingHorizontal: 12,
      paddingVertical: 7,
      minHeight: 48,
      justifyContent: "center",
      borderRadius: 10,
    },
    leaveBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
  });

export const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { padding: 10, paddingTop: 10, paddingBottom: 120 },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: colors.background,
    },
    loadingText: { marginTop: 12, color: colors.textSecondary, fontSize: 16 },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 15,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
    },
    subsectionTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 12,
    },
    listContainer: { gap: 12 },
    friendListBounded: { maxHeight: 480 },
    friendListContent: { gap: 12 },
    friendCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    friendCardActive: {
      borderWidth: 2,
      borderColor: colors.info,
      backgroundColor: colors.infoLight,
    },
    friendCardRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    friendInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
    workingOutDot: {
      position: "absolute",
      bottom: 0,
      right: 0,
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    friendDetails: { flex: 1 },
    friendName: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    friendMeta: { fontSize: 13, color: colors.textMuted },
    requestCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    requestActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    acceptButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.successLight,
      justifyContent: "center",
      alignItems: "center",
    },
    acceptButtonText: {
      color: colors.success,
      fontSize: 20,
      fontWeight: "bold",
    },
    rejectButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.errorLight,
      justifyContent: "center",
      alignItems: "center",
    },
    rejectButtonText: { color: colors.error, fontSize: 20, fontWeight: "bold" },
    sentRequestCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    statusBadge: {
      backgroundColor: colors.warningLight,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 12,
    },
    statusBadgeText: { color: colors.warning, fontSize: 12, fontWeight: "600" },
    statusBadgeFriend: { backgroundColor: colors.successLight },
    searchContainer: { position: "relative", marginBottom: 20 },
    searchInput: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 2,
      borderColor: colors.infoLight,
    },
    searchLoader: { position: "absolute", right: 14, top: 14 },
    searchResultCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    searchResultActions: { flexDirection: "row", gap: 8 },
    addButton: {
      backgroundColor: colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    addButtonText: { color: colors.surface, fontWeight: "600", fontSize: 13 },
    respondButton: {
      backgroundColor: colors.accentLight,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
    },
    respondButtonText: {
      color: colors.accent,
      fontWeight: "600",
      fontSize: 13,
    },
    emptyState: {
      alignItems: "center",
      padding: 40,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    emptyIcon: { fontSize: 64, marginBottom: 16 },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
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
    emptyButtonText: { color: colors.surface, fontWeight: "600", fontSize: 15 },
    emptyStateSmall: {
      alignItems: "center",
      padding: 24,
      backgroundColor: colors.surface,
      borderRadius: 12,
    },
    emptyTextSmall: { fontSize: 14, color: colors.textMuted },
    calendarHint: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
      marginBottom: 16,
    },
    calendarLoading: { paddingVertical: 40, alignItems: "center" },
    analyticsLoading: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 16,
    },
    analyticsLoadingText: { fontSize: 16, color: colors.textSecondary },
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
    friendDetailContent: { paddingHorizontal: 12, paddingTop: 20, paddingBottom: 40 },
    workoutHistorySection: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
    },
    sectionTitleLarge: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 16,
    },
    chevronRight: { fontSize: 28, color: colors.surfaceBorder },
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
    sessionListLeft: { flex: 1 },
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
    sessionListTime: { fontSize: 13, color: colors.textSecondary },
    sessionListDuration: { fontSize: 13, color: colors.textSecondary },
    sessionListSets: { fontSize: 13, color: colors.textSecondary },
    sessionListArrow: {
      fontSize: 24,
      color: colors.surfaceBorder,
      marginLeft: 10,
    },
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
    friendTabContainer: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
    },
    friendTab: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 2,
      alignItems: "center",
      borderBottomWidth: 3,
      borderBottomColor: "transparent",
    },
    friendTabActive: { borderBottomColor: colors.accent },
    friendTabText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      textAlign: "center",
    },
    friendTabTextActive: { color: colors.accent },
    actionsTabContent: { paddingHorizontal: 12, paddingTop: 20, paddingBottom: 60 },
    actionsTabSectionTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.9,
      marginBottom: 6,
    },
    actionsTabSectionHint: {
      fontSize: 12,
      color: colors.textMuted,
      marginBottom: 12,
      lineHeight: 17,
    },
    actionRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    actionRowDanger: {
      borderWidth: 1,
      borderColor: colors.error,
      backgroundColor: colors.errorLight,
    },
    actionRowIcon: { fontSize: 28, marginRight: 14 },
    actionRowText: { flex: 1 },
    actionRowTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    actionRowSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
    actionRowArrow: {
      fontSize: 24,
      color: colors.surfaceBorder,
      marginLeft: 4,
    },
    programViewHeader: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    programViewTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    programViewMeta: {
      fontSize: 14,
      color: colors.accent,
      fontWeight: "600",
      marginBottom: 4,
    },
    programViewShared: { fontSize: 13, color: colors.textMuted },
    programDayCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
    },
    programDayHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
      gap: 10,
    },
    programDayNumber: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent,
      backgroundColor: colors.infoLight,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    programDayTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      flex: 1,
    },
    programExerciseRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.background,
    },
    programExerciseLeft: { flex: 1, marginRight: 12 },
    programExerciseName: {
      fontSize: 15,
      fontWeight: "500",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    programExerciseSets: { fontSize: 13, color: colors.textMuted },
    programSetsBadge: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.infoLight,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minWidth: 44,
    },
    programSetsBadgeText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.accent,
      lineHeight: 18,
    },
    programSetsBadgeLabel: {
      fontSize: 10,
      color: colors.accent,
      fontWeight: "600",
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    programSetsRow: { flexDirection: "row", gap: 6 },
    peopleSelectorContainer: {
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
      paddingVertical: 10,
    },
    peopleSelectorScroll: { paddingHorizontal: 16, gap: 8 },
    peoplePill: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.separator,
      borderWidth: 2,
      borderColor: "transparent",
    },
    peoplePillActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    peoplePillText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    peoplePillTextActive: { color: colors.accent },
    activeSessionPill: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.successLight,
      borderBottomWidth: 1,
      borderBottomColor: colors.success,
      paddingHorizontal: 20,
      paddingVertical: 10,
      gap: 8,
    },
    liveIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
    },
    activeSessionText: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: colors.success,
    },
    leaveText: { fontSize: 13, fontWeight: "700", color: colors.error },
    qrModalContent: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    qrModalHint: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 20,
      marginBottom: 24,
    },
    qrCodeWrapper: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 260,
      minWidth: 260,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 1,
    },
    qrModalUsername: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 20,
    },
    qrScannerContainer: {
      flex: 1,
      minHeight: 420,
      backgroundColor: "#000",
      borderRadius: 16,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },
    qrCameraView: {
      ...StyleSheet.absoluteFill,
    },
    qrScanFrame: {
      width: 220,
      height: 220,
      borderWidth: 3,
      borderColor: "rgba(255,255,255,0.85)",
      borderRadius: 20,
      backgroundColor: "transparent",
    },
    qrScannerHint: {
      position: "absolute",
      bottom: 28,
      left: 24,
      right: 24,
      textAlign: "center",
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    qrScannerLoading: {
      ...StyleSheet.absoluteFill,
      backgroundColor: colors.overlay,
      alignItems: "center",
      justifyContent: "center",
    },
    reportModalContent: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
    reportReasonRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.surface,
    },
    reportReasonRowActive: {
      borderColor: colors.accent,
      backgroundColor: colors.accentLight,
    },
    reportReasonText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
    reportReasonCheck: {
      fontSize: 16,
      color: colors.accent,
      fontWeight: "700",
    },
    reportDetailsInput: {
      marginTop: 8,
      minHeight: 90,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      padding: 14,
      fontSize: 15,
      color: colors.textPrimary,
      textAlignVertical: "top",
    },
  });
