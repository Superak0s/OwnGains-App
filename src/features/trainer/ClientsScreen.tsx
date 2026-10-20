import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenTitle from "@shared/components/ScreenTitle";
import InboxButton from "@features/messages/InboxButton";
import { useAlert } from "@shared/components/CustomAlert";
import { useAuth } from "@shared/context/AuthContext";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { userFacingError } from "@shared/services/apiError";
import { captureException, trackFeature } from "@shared/services/crashReporting";
import { getActiveTrainee, queueTraineeStart, setActiveTrainee } from "@shared/services/trainerEvents";
import { SCREEN_PADDING } from "@shared/layout";
import type { RootStackParamList } from "@shared/types";
import { sharingApi } from "@features/friends/services";
import { programPayload, programSplits } from "@features/friends/utils";
import {
  trainerApi,
  TrainerRequestConflictError,
  type ClientSummary,
  type TrainerRequest,
} from "./services";
import { groupRoster, toDateKey, weekStart } from "./utils/roster";
import { trainerDayChoices, type CustomWorkout } from "./utils/sessionStart";
import ClientRow, { daysAgoText } from "./components/ClientRow";
import ClientPage from "./components/ClientPage";
import AddClientSheet from "./components/AddClientSheet";
import { purgeTrackingCopies, syncTrackingInbox } from "./utils/trackingInbox";

const STALE_AFTER_MS = 60_000;

export default function ClientsScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const { workoutData, selectedSplit } = useWorkoutPick("workoutData", "selectedSplit");
  const dayChoices = useMemo(() => trainerDayChoices(workoutData, selectedSplit), [workoutData, selectedSplit]);
  const splitChoices = useMemo(() => (workoutData ? programSplits(workoutData) : []), [workoutData]);
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { alert, AlertComponent } = useAlert();

  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [sent, setSent] = useState<TrainerRequest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [adding, setAdding] = useState(false);
  const lastLoadRef = useRef(0);
  const sendingRef = useRef(false);

  const alertError = useCallback(
    (message: string) => alert("Error", message, [{ text: "OK" }], "error"),
    [alert],
  );

  const load = useCallback(async () => {
    lastLoadRef.current = Date.now();
    try {
      const [roster, requests] = await Promise.all([
        trainerApi.getClients(toDateKey(weekStart(new Date()))),
        trainerApi.getSentRequests(),
      ]);
      setClients(roster);
      setSent(requests);
      void purgeTrackingCopies(roster)
        .then(syncTrackingInbox)
        .catch((e: unknown) => captureException(e, { stage: "trackingInbox" }));
      const active = getActiveTrainee();
      if (active && !roster.some((c) => c.userId === active.userId)) setActiveTrainee(null);
      setError(null);
    } catch (e) {
      captureException(e, { stage: "trainerRoster" });
      setError(userFacingError(e, "Couldn't load your clients"));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastLoadRef.current > STALE_AFTER_MS) void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sendRequest = async (target: { userId: string; username: string }, includeTracking: boolean) => {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setAdding(false);
    try {
      await trainerApi.sendRequest({ userId: target.userId }, includeTracking);
      trackFeature("trainer", "request_sent");
      alert(
        "Request sent",
        includeTracking
          ? `${target.username} can turn on Tracking Access from the request in Friends.`
          : `${target.username} becomes your client once they accept.`,
        [{ text: "OK" }],
        "success",
      );
      await load();
    } catch (e) {
      alertError(
        e instanceof TrainerRequestConflictError ? e.message : userFacingError(e, "Couldn't send the request"),
      );
    } finally {
      sendingRef.current = false;
    }
  };

  const cancelRequest = (request: TrainerRequest) =>
    alert(
      `Cancel request to ${request.toUsername}?`,
      "They won't be able to accept it anymore.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel request",
          style: "destructive",
          onPress: async () => {
            try {
              await trainerApi.cancelRequest(request.id);
              await load();
            } catch (e) {
              alertError(userFacingError(e, "Couldn't cancel the request"));
            }
          },
        },
      ],
      "warning",
    );

  const removeClient = (client: ClientSummary) =>
    alert(
      `Remove ${client.username}?`,
      `You'll stop coaching ${client.username} and lose access to their workouts and tracking. You stay friends, and they can add you as a trainer again.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await trainerApi.removeClient(client.userId);
              if (getActiveTrainee()?.userId === client.userId) setActiveTrainee(null);
              setSelected(null);
              await load();
            } catch (e) {
              alertError(userFacingError(e, "Couldn't remove the client"));
            }
          },
        },
      ],
      "warning",
    );

  const startSession = (client: ClientSummary, start: CustomWorkout | null, split?: string) => {
    const running = getActiveTrainee();
    if (running) {
      setSelected(null);
      alert(
        "Session already running",
        `Stop the session with ${running.username} before starting another.`,
        [
          { text: "OK", style: "cancel" },
          { text: "Go to session", onPress: () => navigation.navigate("Workout") },
        ],
        "info",
      );
      return;
    }
    queueTraineeStart(client.userId, start, split);
    setActiveTrainee({ userId: client.userId, username: client.username });
    setSelected(null);
    navigation.navigate("Workout");
  };

  const editProgram = (client: ClientSummary) => {
    setActiveTrainee({ userId: client.userId, username: client.username });
    setSelected(null);
    navigation.navigate("Plan");
  };

  const sendProgram = (client: ClientSummary, splits: string[]) => {
    if (!workoutData) {
      alert("No Program Loaded", "Load a workout program first before sending it.", [{ text: "OK" }], "info");
      return;
    }
    const send = async () => {
      try {
        await sharingApi.grantPermission(client.userId, "program", programPayload(workoutData, splits));
        alert(
          "Plan sent",
          `${client.username} can open it from your Program tab and choose to use it.`,
          [{ text: "OK" }],
          "success",
        );
      } catch (e) {
        alertError(userFacingError(e, "Failed to grant permission"));
      }
    };
    alert(
      `Send ${client.username} your plan`,
      `It replaces any program you've already shared with ${client.username}. Their own plan only changes if they choose to use it.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => void send() },
      ],
      "info",
    );
  };

  const now = new Date();
  const { attention, onTrack } = groupRoster(clients ?? [], now);
  const renderRow = (c: ClientSummary) => (
    <ClientRow key={c.userId} client={c} now={now} onPress={setSelected} />
  );

  const takenIds = new Set([...(clients ?? []).map((c) => c.userId), ...sent.map((r) => r.toUserId)]);

  const errorBox = error && (
    <View style={styles.errorBox}>
      <Text style={styles.message}>{error}</Text>
      <TouchableOpacity style={styles.retry} onPress={() => void refresh()} accessibilityRole="button">
        <Text style={styles.addText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  let body: React.ReactNode;
  if (clients === null)
    body = errorBox || <ActivityIndicator color={colors.accent} accessibilityLabel="Loading clients" />;
  else if (clients.length === 0 && sent.length === 0)
    body = (
      <>
        {errorBox}
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No clients yet</Text>
          <Text style={styles.message}>Send someone a request to start coaching them.</Text>
          <TouchableOpacity style={styles.emptyButton} onPress={() => setAdding(true)} accessibilityRole="button">
            <Text style={styles.emptyButtonText}>Add your first client</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  else
    body = (
      <>
        {errorBox}
        {attention.length > 0 && <Text style={styles.section}>Needs attention</Text>}
        {attention.map(renderRow)}
        {onTrack.length > 0 && <Text style={styles.section}>On track</Text>}
        {onTrack.map(renderRow)}
        {sent.length > 0 && <Text style={styles.section}>Requests sent</Text>}
        {sent.map((r) => (
          <View key={r.id} style={styles.sentRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sentName}>{r.toUsername}</Text>
              <Text style={styles.sentStatus}>{`Sent ${daysAgoText(r.createdAt, now)}`}</Text>
            </View>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => cancelRequest(r)}
              accessibilityRole="button"
              accessibilityLabel={`Cancel request to ${r.toUsername}`}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ))}
      </>
    );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={SCREEN_PADDING}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
      >
        <View style={styles.titleRow}>
          <ScreenTitle title="Clients" style={{ flex: 1 }} />
          <InboxButton />
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setAdding(true)}
            accessibilityRole="button"
            accessibilityLabel="Add client"
          >
            <Text style={styles.addText}>+ Add client</Text>
          </TouchableOpacity>
        </View>
        {body}
      </ScrollView>
      <ClientPage
        client={selected}
        trainerId={String(user?.id ?? "")}
        now={now}
        onClose={() => setSelected(null)}
        onStartSession={startSession}
        dayChoices={dayChoices}
        splitChoices={splitChoices}
        onSendProgram={sendProgram}
        onEditProgram={editProgram}
        onRemoveClient={removeClient}
        onAskTracking={(c) => void sendRequest(c, true)}
        onError={alertError}
      />
      <AddClientSheet
        visible={adding}
        onClose={() => setAdding(false)}
        onPick={(u) => void sendRequest({ userId: String(u.id), username: u.username }, false)}
        takenIds={takenIds}
      />
      {AlertComponent}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    addButton: { minHeight: 48, paddingHorizontal: 12, justifyContent: "center" },
    addText: { color: colors.accent, fontWeight: "600", fontSize: 15 },
    section: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      marginTop: 16,
      marginBottom: 8,
    },
    message: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 8 },
    empty: { alignItems: "center", marginTop: 48 },
    emptyButton: {
      minHeight: 48,
      paddingHorizontal: 20,
      marginTop: 16,
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    emptyButtonText: { color: colors.textOnAccent, fontWeight: "600" },
    errorBox: { alignItems: "center", marginBottom: 8 },
    retry: { minHeight: 48, paddingHorizontal: 12, justifyContent: "center" },
    cancelText: { color: colors.error, fontWeight: "600" },
    emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    sentRow: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    sentName: { color: colors.textPrimary, fontSize: 16 },
    sentStatus: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  });
