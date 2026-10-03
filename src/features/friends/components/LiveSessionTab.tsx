import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Animated,
  type TextStyle,
} from "react-native";
import { sharingApi } from "../services";
import { mergeLiveSet } from "../utils";
import { normalizeExerciseName } from "@utils/exerciseMatching";
import { muscleLabel } from "@utils/exerciseDb";
import { formatClockTime } from "@utils/format";
import { formatTime } from "@utils/timeEstimation";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { SetTiming } from "@shared/types";
import type {
  Friend,
  LiveData,
  ProgramDay,
  ProgramExercise,
  ReceivedProgram,
  Phase,
  ExerciseEntry,
} from "../types";
interface LiveSessionTabProps {
  readonly friend: Friend;
  readonly isVisible: boolean;
  readonly receivedPrograms?: ReceivedProgram[];
  /**
   * Registers an inbound-message listener and returns its unsubscribe. A
   * subscription rather than the latest message so a burst of live sets can't
   * overwrite each other between renders.
   */
  readonly subscribeToSocket?: (
    handler: (msg: {
      type: string;
      /** live_set_recorded carries just the set that was recorded, not the
       *  whole session (pushLiveSetToWatchers on the server). */
      set?: SetTiming;
      sessionId?: number | string;
      friendId?: string;
    }) => void,
  ) => () => void;
}

interface RetryScreen {
  icon: string;
  title: string;
  sub: string;
  button: string;
}

interface PlannedExercise {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  totalSets: number;
}

function dayExercises(day: ProgramDay): ProgramExercise[] {
  if (Array.isArray(day.exercises)) return day.exercises;
  const groups = day.split ?? day.people;
  if (!groups) return [];
  return Object.values(groups).flatMap((group) => group?.exercises ?? []);
}

function entryFromLoggedSets(
  key: string,
  completedSetMap: Record<number, SetTiming>,
  timings: SetTiming[],
): ExerciseEntry {
  const sample = timings.find(
    (t) => normalizeExerciseName(t.exerciseName ?? "") === key,
  );
  return {
    exerciseName: sample?.exerciseName ?? key,
    primaryMuscles: sample?.exercisePrimaryMuscles ?? [],
    secondaryMuscles: sample?.exerciseSecondaryMuscles ?? [],
    totalSets: Math.max(...Object.keys(completedSetMap).map(Number)) + 1,
    completedSetMap,
  };
}

function sessionTitleOf(live: LiveData | null): string {
  if (!live) return "";
  if (!live.dayTitle) return `Day ${live.dayNumber ?? "?"}`;
  if (!live.dayTitle.includes("—")) return live.dayTitle;
  return live.dayTitle.split("—")[1]?.trim() ?? "";
}

function elapsedFromStart(raw?: string): number {
  if (!raw) return 0;
  const start = new Date(raw.replace(" ", "T")).getTime();
  return Math.floor((Date.now() - start) / 1000);
}

function LiveDot() {
  const { colors } = useTheme();
  const liveDotSt = useMemo(() => makeLiveDotSt(colors), [colors]);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.15,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[liveDotSt.dot, { opacity }]} />;
}

const makeLiveDotSt = (colors: ThemeColors) =>
  StyleSheet.create({
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.success,
      marginRight: 6,
    },
  });

interface SetBubbleProps {
  readonly setIndex: number;
  readonly setData: SetTiming | null;
}

const SetBubble = React.memo(function SetBubble({
  setIndex,
  setData,
}: SetBubbleProps) {
  const { colors } = useTheme();
  const bbl = useMemo(() => makeBblStyles(colors), [colors]);
  const done = !!setData;
  const isWarmup = done && (setData?.isWarmup ?? false);

  return (
    <View
      style={[bbl.bubble, done && bbl.bubbleDone, isWarmup && bbl.bubbleWarmup]}
    >
      <Text style={[bbl.num, done && bbl.numDone]}>
        {isWarmup ? "W" : setIndex + 1}
      </Text>
      {done && (
        <View style={bbl.details}>
          <Text style={bbl.detailText}>{setData?.weight ?? 0}kg</Text>
          <Text style={bbl.detailText}>×{setData?.reps ?? 0}</Text>
        </View>
      )}
      {done && (
        <View style={bbl.check}>
          <Text style={bbl.checkText}>✓</Text>
        </View>
      )}
    </View>
  );
});

const makeBblStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    bubble: {
      width: 70,
      height: 70,
      borderRadius: 12,
      backgroundColor: colors.separator,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      padding: 4,
    },
    bubbleDone: { backgroundColor: colors.accent, borderColor: colors.accent },
    bubbleWarmup: { backgroundColor: "#fb923c", borderColor: "#ea580c" },
    num: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.textMuted,
      marginBottom: 2,
    },
    numDone: { color: colors.surface },
    details: { alignItems: "center" },
    detailText: { fontSize: 10, color: colors.surface, fontWeight: "500" },
    check: {
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
    checkText: { color: colors.surface, fontSize: 12, fontWeight: "bold" },
  });

interface ExerciseCardProps {
  readonly exerciseName: string;
  readonly primaryMuscles: string[];
  readonly secondaryMuscles: string[];
  readonly totalSets: number;
  readonly completedSetMap: Record<number, SetTiming>;
}

const ExerciseCard = React.memo(function ExerciseCard({
  exerciseName,
  primaryMuscles,
  secondaryMuscles,
  totalSets,
  completedSetMap,
}: ExerciseCardProps) {
  const { colors } = useTheme();
  const exSt = useMemo(() => makeExStStyles(colors), [colors]);
  const completedCount = Object.keys(completedSetMap).length;
  const allDone = totalSets > 0 && completedCount >= totalSets;
  const label = muscleLabel(primaryMuscles, secondaryMuscles);

  return (
    <View style={[exSt.card, allDone && exSt.cardDone]}>
      <View style={exSt.header}>
        <View style={exSt.info}>
          <Text style={[exSt.name, allDone && exSt.nameDone]}>
            {exerciseName}
          </Text>
          {label ? <Text style={exSt.muscle}>{label}</Text> : null}
        </View>
        <View style={exSt.badge}>
          <Text style={exSt.badgeText}>
            {completedCount}/{totalSets}
          </Text>
        </View>
      </View>
      <View style={exSt.sets}>
        {Array.from({ length: totalSets }, (_, i) => (
          <SetBubble
            key={i}
            setIndex={i}
            setData={completedSetMap[i] ?? null}
          />
        ))}
      </View>
    </View>
  );
});

const makeExStStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 2,
      elevation: 2,
      borderWidth: 2,
      borderColor: "transparent",
    },
    cardDone: {
      backgroundColor: colors.successLight,
      borderColor: colors.success,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    info: { flex: 1, marginRight: 12 },
    name: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 3,
    },
    nameDone: { color: colors.success },
    muscle: { fontSize: 13, color: colors.textMuted },
    badge: {
      backgroundColor: colors.separator,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 12,
    },
    badgeText: { fontSize: 13, fontWeight: "600", color: colors.accent },
    sets: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  });

// Keeps the per-second tick here so the watch view doesn't re-render on it.
function ElapsedClock({
  startRaw,
  style,
  prefix = "",
}: {
  startRaw?: string;
  style: TextStyle;
  prefix?: string;
}) {
  const [sec, setSec] = useState(() => elapsedFromStart(startRaw));
  useEffect(() => {
    setSec(elapsedFromStart(startRaw));
  }, [startRaw]);
  useEffect(() => {
    if (!startRaw) return;
    const tick = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, [startRaw]);
  return <Text style={style}>{prefix}{formatTime(sec)}</Text>;
}

export default function LiveSessionTab({
  friend,
  isVisible,
  receivedPrograms = [],
  subscribeToSocket,
}: LiveSessionTabProps) {
  const { colors } = useTheme();
  const st = useMemo(() => makeStStyles(colors), [colors]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [liveData, setLiveData] = useState<LiveData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [watchedSessionId, setWatchedSessionId] = useState<string | null>(null);

  const startWatching = useCallback(async () => {
    if (!friend?.id) return;
    setPhase("checking");
    setLiveData(null);
    setWatchedSessionId(null);
    try {
      const active = await sharingApi.getFriendActiveSession(friend.id);
      if (!active?.sessionId) {
        setPhase("no_session");
        return;
      }

      const live = await sharingApi.getFriendLiveSession(
        friend.id,
        active.sessionId,
      );
      if (!live) {
        setPhase("no_session");
        return;
      }

      setLiveData(live);
      setWatchedSessionId(String(active.sessionId));
      setPhase("watching");
    } catch {
      setPhase("error");
    }
  }, [friend?.id]);

  useEffect(() => {
    if (isVisible) void startWatching();
  }, [isVisible, startWatching]);

  useEffect(() => {
    if (!subscribeToSocket || phase !== "watching") return;

    return subscribeToSocket((msg) => {
      if (msg.type === "live_set_recorded" && msg.set) {
        const incoming = msg.set;
        setLiveData((prev) =>
          mergeLiveSet(prev, incoming, msg.sessionId, watchedSessionId),
        );
      }

      if (msg.type === "friend_session_ended" && msg.friendId === friend?.id) {
        setPhase("ended");
      }
    });
  }, [subscribeToSocket, phase, friend?.id, watchedSessionId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await startWatching();
    setRefreshing(false);
  };

  const programPlan = useMemo((): Map<string, PlannedExercise> | null => {
    if (!liveData?.dayNumber) return null;

    const prog = receivedPrograms.find((p) => p.senderId === friend?.id);
    if (!prog?.programData?.days) return null;

    const day = prog.programData.days.find(
      (d) => d.dayNumber === liveData.dayNumber,
    );
    if (!day) return null;

    const plan = new Map<string, PlannedExercise>();

    dayExercises(day).forEach((e) => {
      const key = normalizeExerciseName(e.name ?? "");
      if (!key) return;

      let totalSets = 0;
      const setsBySplit = e.setsBySplit;
      if (setsBySplit && typeof setsBySplit === "object") {
        totalSets = Math.max(
          ...Object.values(setsBySplit).map(Number).filter(Number.isFinite),
          0,
        );
      } else if (typeof e.sets === "number") {
        totalSets = e.sets;
      }

      if (!plan.has(key) || (plan.get(key)?.totalSets ?? 0) < totalSets) {
        plan.set(key, {
          name: e.name ?? key,
          primaryMuscles: e.primaryMuscles ?? [],
          secondaryMuscles: e.secondaryMuscles ?? [],
          totalSets,
        });
      }
    });

    return plan.size > 0 ? plan : null;
  }, [liveData?.dayNumber, receivedPrograms, friend?.id]);

  const exerciseList = useMemo((): ExerciseEntry[] => {
    const timings = liveData?.setTimings ?? [];
    const completedByExercise = new Map<string, Record<number, SetTiming>>();
    timings.forEach((t) => {
      if (!Number.isFinite(t.setIndex)) return;
      const key = normalizeExerciseName(t.exerciseName ?? "");
      if (!completedByExercise.has(key)) completedByExercise.set(key, {});
      completedByExercise.get(key)![t.setIndex] = t;
    });

    if (programPlan) {
      const list: ExerciseEntry[] = [];
      const coveredKeys = new Set<string>();

      programPlan.forEach((info, key) => {
        coveredKeys.add(key);
        const completedSetMap = completedByExercise.get(key) ?? {};
        const maxLoggedIndex = Object.keys(completedSetMap).reduce(
          (max, i) => Math.max(max, Number.parseInt(i)),
          -1,
        );
        const totalSets = Math.max(info.totalSets, maxLoggedIndex + 1);
        list.push({
          exerciseName: info.name,
          primaryMuscles: info.primaryMuscles,
          secondaryMuscles: info.secondaryMuscles,
          totalSets,
          completedSetMap,
        });
      });

      completedByExercise.forEach((completedSetMap, key) => {
        if (coveredKeys.has(key)) return;
        list.push(entryFromLoggedSets(key, completedSetMap, timings));
      });
      return list;
    }

    return Array.from(completedByExercise.entries()).map(([key, completed]) =>
      entryFromLoggedSets(key, completed, timings),
    );
  }, [liveData, programPlan]);

  const sessionMuscles = [
    ...(liveData?.primaryMuscles ?? []),
    ...(liveData?.secondaryMuscles ?? []),
  ];
  const totalCompleted = liveData?.setTimings?.length ?? 0;
  const totalPlanned = exerciseList.reduce((n, e) => n + e.totalSets, 0);
  const progressPct =
    totalPlanned > 0 ? Math.min((totalCompleted / totalPlanned) * 100, 100) : 0;

  const sessionTitle = sessionTitleOf(liveData);

  if (phase === "idle" || phase === "checking") {
    return (
      <View style={st.center}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={st.centerSub}>Loading live session…</Text>
      </View>
    );
  }

  const retryScreens: Partial<Record<Phase, RetryScreen>> = {
    no_session: {
      icon: "🏋️",
      title: `${friend?.username} isn't working out right now`,
      sub: "Come back when they start a session, or pull down to check again.",
      button: "Check Again",
    },
    ended: {
      icon: "✅",
      title: "Session Ended",
      sub: `${friend?.username} finished their workout.`,
      button: "Check for New Session",
    },
    error: {
      icon: "⚠️",
      title: "Couldn't Load Session",
      sub: "Check your connection and try again.",
      button: "Retry",
    },
  };

  const retryScreen = retryScreens[phase];
  if (retryScreen) {
    return (
      <View style={st.center}>
        <Text style={st.centerIcon}>{retryScreen.icon}</Text>
        <Text style={st.centerTitle}>{retryScreen.title}</Text>
        <Text style={st.centerSub}>{retryScreen.sub}</Text>
        <TouchableOpacity style={st.btn} onPress={() => void startWatching()}>
          <Text style={st.btnText}>{retryScreen.button}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView
      style={st.scroll}
      contentContainerStyle={st.scrollContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          colors={[colors.accent]}
          tintColor={colors.accent}
        />
      }
    >
      <View style={st.headerCard}>
        <View style={st.liveBadge}>
          <LiveDot />
          <Text style={st.liveBadgeText}>LIVE</Text>
          <Text style={st.liveUsername}> · {friend?.username}</Text>
        </View>

        <View style={st.headerTop}>
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text style={st.dayNumber}>Day {liveData?.dayNumber ?? "?"}</Text>
            {sessionTitle ? (
              <Text style={st.dayTitle} numberOfLines={2}>
                {sessionTitle}
              </Text>
            ) : null}
          </View>
          <View style={st.setsInfo}>
            <Text style={st.setsLabel}>Sets Done</Text>
            <Text style={st.setsValue}>{totalCompleted}</Text>
          </View>
        </View>

        <View style={st.progressContainer}>
          <View style={st.progressBar}>
            <View style={[st.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <View style={st.progressTextRow}>
            <Text style={st.progressText}>
              {totalCompleted}
              {totalPlanned > 0 ? ` / ${totalPlanned}` : ""} sets
            </Text>
            <ElapsedClock startRaw={liveData?.startTime} style={st.progressText} prefix="⏱ " />
          </View>
        </View>

        {liveData?.startTime ? (
          <Text style={st.startedAt}>
            Started at {formatClockTime(liveData.startTime.replace(" ", "T"))}
          </Text>
        ) : null}

        <View style={st.statsRow}>
          <View style={st.stat}>
            <Text style={st.statLabel}>⏱️ Duration</Text>
            <ElapsedClock startRaw={liveData?.startTime} style={st.statValue} />
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>💪 Exercises</Text>
            <Text style={st.statValue}>{exerciseList.length}</Text>
          </View>
          <View style={st.stat}>
            <Text style={st.statLabel}>📦 Sets Done</Text>
            <Text style={st.statValue}>{totalCompleted}</Text>
          </View>
        </View>

        {sessionMuscles.length > 0 && (
          <View style={st.muscleRow}>
            {sessionMuscles.map((g) => (
              <View key={g} style={st.muscleTag}>
                <Text style={st.muscleTagText}>{g}</Text>
              </View>
            ))}
          </View>
        )}

        {!programPlan && (
          <View style={st.noPlanNotice}>
            <Text style={st.noPlanText}>
              💡 Ask {friend?.username} to share their program to see all
              planned sets
            </Text>
          </View>
        )}
      </View>

      {exerciseList.length === 0 ? (
        <View style={st.noExercises}>
          <Text style={st.noExercisesIcon}>🔄</Text>
          <Text style={st.noExercisesText}>
            No sets logged yet. Pull down to refresh
          </Text>
        </View>
      ) : (
        exerciseList.map((e) => (
          <ExerciseCard
            key={e.exerciseName}
            exerciseName={e.exerciseName}
            primaryMuscles={e.primaryMuscles}
            secondaryMuscles={e.secondaryMuscles}
            totalSets={e.totalSets}
            completedSetMap={e.completedSetMap}
          />
        ))
      )}

      <Text style={st.refreshHint}>
        Updates live · Pull down to refresh now
      </Text>
    </ScrollView>
  );
}

const makeStStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 40,
      backgroundColor: colors.background,
      minHeight: 400,
    },
    centerIcon: { fontSize: 56, marginBottom: 16 },
    centerTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 8,
      textAlign: "center",
    },
    centerSub: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: 24,
      marginTop: 6,
    },
    btn: {
      backgroundColor: colors.accent,
      paddingHorizontal: 28,
      paddingVertical: 12,
      borderRadius: 12,
    },
    btnText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
    scroll: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 48 },
    headerCard: {
      backgroundColor: colors.accent,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    liveBadge: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    liveBadgeText: {
      color: colors.success,
      fontWeight: "800",
      fontSize: 12,
      letterSpacing: 1.2,
    },
    liveUsername: {
      color: "rgba(255,255,255,0.7)",
      fontSize: 12,
      fontWeight: "500",
    },
    headerTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 16,
    },
    dayNumber: {
      fontSize: 30,
      fontWeight: "bold",
      color: colors.surface,
      marginBottom: 4,
    },
    dayTitle: { fontSize: 14, color: "rgba(255,255,255,0.85)", lineHeight: 20 },
    setsInfo: { alignItems: "flex-end" },
    setsLabel: {
      fontSize: 12,
      color: "rgba(255,255,255,0.7)",
      marginBottom: 2,
    },
    setsValue: { fontSize: 36, fontWeight: "bold", color: colors.surface },
    progressContainer: { marginBottom: 10 },
    progressBar: {
      height: 8,
      backgroundColor: "rgba(255,255,255,0.3)",
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressFill: {
      height: "100%",
      backgroundColor: colors.surface,
      borderRadius: 4,
    },
    progressTextRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    progressText: { fontSize: 13, color: "rgba(255,255,255,0.9)" },
    startedAt: {
      fontSize: 12,
      color: "rgba(255,255,255,0.6)",
      marginBottom: 14,
    },
    statsRow: {
      flexDirection: "row",
      justifyContent: "space-around",
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 10,
      paddingVertical: 12,
      marginBottom: 14,
    },
    stat: { alignItems: "center" },
    statLabel: {
      fontSize: 11,
      color: "rgba(255,255,255,0.8)",
      marginBottom: 4,
    },
    statValue: { fontSize: 18, fontWeight: "bold", color: colors.surface },
    muscleRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    muscleTag: {
      backgroundColor: "rgba(255,255,255,0.2)",
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
    },
    muscleTagText: { color: colors.surface, fontSize: 12, fontWeight: "600" },
    noPlanNotice: {
      marginTop: 14,
      backgroundColor: "rgba(255,255,255,0.15)",
      borderRadius: 10,
      padding: 10,
    },
    noPlanText: {
      fontSize: 12,
      color: "rgba(255,255,255,0.85)",
      textAlign: "center",
      lineHeight: 18,
    },
    noExercises: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 40,
      alignItems: "center",
      marginBottom: 16,
    },
    noExercisesIcon: { fontSize: 36, marginBottom: 12 },
    noExercisesText: {
      fontSize: 14,
      color: colors.textMuted,
      textAlign: "center",
      fontStyle: "italic",
    },
    refreshHint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 8,
      fontStyle: "italic",
    },
  });
