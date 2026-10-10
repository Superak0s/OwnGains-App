import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { workoutApi } from "@features/workout/services/index";
import {
  findExerciseByName,
  muscleLabel,
  parseMuscleList,
} from "@utils/exerciseDb";
import type {
  WorkoutSession,
  FullSessionWithGroups,
  SetTiming,
  GroupedExercise,
} from "@shared/types";
import {
  checkForTypo,
  getCanonicalName,
  normalizeExerciseName,
  CANONICAL_MUSCLE_GROUPS,
} from "@utils/exerciseMatching";
import {
  formatDate,
  formatDateTime,
  parseDecimal,
  toDateString,
} from "@utils/format";
import ModalSheet from "@shared/components/ModalSheet";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import { showToast } from "@shared/components/toast";
import { SuggestionsBox } from "@shared/components/SuggestionsBox";
import { useAlert } from "@shared/components/CustomAlert";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { SimilarityMatch } from "@utils/exerciseMatching";
import { captureException, metric } from "@shared/services/crashReporting";
import { userFacingError } from "@shared/services/apiError";
import {
  BROWSE_MUSCLES,
  exercisesForMuscle,
  muscleDisplayName,
} from "@features/workout/utils";

const BROWSE_PAGE_SIZE = 3;

/** dayTitle stamped on every session created by the CSV importer. */
const IMPORTED_DAY_TITLE = "Imported (Strength Level)";

interface Props {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly split: string;
  /** Called after any successful edit, so the caller can refresh analytics/progress */
  readonly onDataChanged?: () => void;
}
/** Groups a session's flat set list by exercise name, preserving set order. */
function groupSetsByExercise(sets: SetTiming[]): GroupedExercise[] {
  const order: string[] = [];
  const groups = new Map<string, GroupedExercise>();

  sets.forEach((set) => {
    const name = set.exerciseName ?? "Unknown Exercise";
    if (!groups.has(name)) {
      groups.set(name, {
        exerciseName: name,
        primaryMuscles: set.exercisePrimaryMuscles,
        secondaryMuscles: set.exerciseSecondaryMuscles,
        sets: [],
      });
      order.push(name);
    }
    groups.get(name)!.sets.push(set);
  });

  return order.map((name) => groups.get(name)!);
}

function formatSessionLabel(session: WorkoutSession): string {
  const dateStr = session.startTime
    ? formatDate(session.startTime, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "Unknown date";
  const title = session.dayTitle ?? `Day ${session.dayNumber}`;
  return `${dateStr} · ${title}`;
}

function splitIso(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: toDateString(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function formatDateInput(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  return formatDate(new Date(`${date}T00:00:00`));
}

export function combineToIso(date: string, time: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match || !timeMatch) return null;

  // Range-checked before constructing: `new Date(y, m, d, 25, 99)` rolls over
  // silently, so an out-of-range time would move the set to another day
  // instead of being rejected.
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (hours > 23 || minutes > 59 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const d = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    0,
    0,
  );
  // A rolled-over date (31 February) is not the day that was typed.
  if (
    Number.isNaN(d.getTime()) ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d.toISOString();
}

const SessionRow = React.memo(function SessionRow({
  session,
  onPress,
  styles,
}: {
  readonly session: WorkoutSession;
  readonly onPress: (session: WorkoutSession) => void;
  readonly styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.sessionRow}
      onPress={() => onPress(session)}
      accessibilityRole="button"
      accessibilityLabel={`Edit ${formatSessionLabel(session)}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionTitle}>{formatSessionLabel(session)}</Text>
        <Text style={styles.sessionSubtitle}>
          {session.setCount ?? 0} set
          {(session.setCount ?? 0) === 1 ? "" : "s"}
        </Text>
      </View>
      <Text style={styles.chevron} importantForAccessibility="no">
        ›
      </Text>
    </TouchableOpacity>
  );
});

interface SessionListViewProps {
  readonly showImportedOnly: boolean;
  readonly setShowImportedOnly: (
    v: boolean | ((p: boolean) => boolean),
  ) => void;
  readonly loadingSessions: boolean;
  readonly sessionsError: boolean;
  readonly reloadSessions: () => void;
  readonly visibleSessions: WorkoutSession[];
  readonly openSession: (session: WorkoutSession) => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly colors: ThemeColors;
}

function SessionListView({
  showImportedOnly,
  setShowImportedOnly,
  loadingSessions,
  sessionsError,
  reloadSessions,
  visibleSessions,
  openSession,
  styles,
  colors,
}: SessionListViewProps): React.JSX.Element {
  const renderSession = useCallback(
    (row: { item: WorkoutSession }) => (
      <SessionRow session={row.item} onPress={openSession} styles={styles} />
    ),
    [openSession, styles],
  );

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={visibleSessions}
      keyExtractor={(session) => String(session.id)}
      ListHeaderComponent={
        <TouchableOpacity
          style={[
            styles.filterPill,
            showImportedOnly && styles.filterPillActive,
          ]}
          onPress={() => setShowImportedOnly((prev) => !prev)}
          accessibilityRole="switch"
          accessibilityLabel="Show imported sessions only"
          accessibilityState={{ checked: showImportedOnly }}
        >
          <Text
            style={[
              styles.filterPillText,
              showImportedOnly && styles.filterPillTextActive,
            ]}
          >
            {showImportedOnly
              ? "✓ Imported sessions only"
              : "Show imported sessions only"}
          </Text>
        </TouchableOpacity>
      }
      ListEmptyComponent={renderEmptyState({
        loadingSessions,
        sessionsError,
        reloadSessions,
        showImportedOnly,
        styles,
        colors,
      })}
      renderItem={renderSession}
    />
  );
}

function renderEmptyState({
  loadingSessions,
  sessionsError,
  reloadSessions,
  showImportedOnly,
  styles,
  colors,
}: {
  readonly loadingSessions: boolean;
  readonly sessionsError: boolean;
  readonly reloadSessions: () => void;
  readonly showImportedOnly: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly colors: ThemeColors;
}): React.JSX.Element {
  if (loadingSessions) {
    return (
      <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
    );
  }
  if (sessionsError) {
    return (
      <View>
        <Text style={styles.errorText}>
          Your history could not be loaded. Nothing has been changed.
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={reloadSessions}
          accessibilityRole="button"
          accessibilityLabel="Retry loading workout history"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <Text style={styles.emptyText}>
      {showImportedOnly
        ? "No imported sessions found for this split."
        : "No sessions found for this split."}
    </Text>
  );
}

const EXERCISE_FILTERS = [
  { key: "noMuscles", label: "No muscles set" },
  { key: "notInDb", label: "Not in database" },
] as const;

type ExerciseFilterKey = (typeof EXERCISE_FILTERS)[number]["key"];

function ExerciseListView({
  exercises,
  loading,
  failed,
  openEditExercise,
  styles,
  colors,
}: {
  readonly exercises: GroupedExercise[];
  readonly loading: boolean;
  readonly failed: boolean;
  readonly openEditExercise: (group: GroupedExercise) => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly colors: ThemeColors;
}): React.JSX.Element {
  const [filters, setFilters] = useState<Set<ExerciseFilterKey>>(new Set());

  const rows = useMemo(
    () =>
      exercises
        .map((group) => ({
          group,
          inDb: !!findExerciseByName(group.exerciseName),
          hasMuscles: !!muscleLabel(group.primaryMuscles, group.secondaryMuscles),
        }))
        .filter(
          (row) =>
            (!filters.has("noMuscles") || !row.hasMuscles) &&
            (!filters.has("notInDb") || !row.inDb),
        ),
    [exercises, filters],
  );

  const toggleFilter = (key: ExerciseFilterKey) =>
    setFilters((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  let empty: React.JSX.Element;
  if (loading) {
    empty = <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;
  } else if (failed) {
    empty = (
      <Text style={styles.errorText}>
        Your exercises could not be loaded. Nothing has been changed.
      </Text>
    );
  } else if (filters.size > 0) {
    empty = <Text style={styles.emptyText}>No exercises match these filters.</Text>;
  } else {
    empty = <Text style={styles.emptyText}>No exercises logged in this split.</Text>;
  }

  return (
    <FlatList
      contentContainerStyle={styles.listContent}
      data={rows}
      keyExtractor={(row) => row.group.exerciseName}
      ListHeaderComponent={
        <View style={styles.filterRow}>
          {EXERCISE_FILTERS.map(({ key, label }) => {
            const active = filters.has(key);
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterPill, active && styles.filterPillActive]}
                onPress={() => toggleFilter(key)}
                accessibilityRole="switch"
                accessibilityLabel={`Show only exercises with ${label.toLowerCase()}`}
                accessibilityState={{ checked: active }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    active && styles.filterPillTextActive,
                  ]}
                >
                  {active ? `✓ ${label}` : label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      }
      ListEmptyComponent={empty}
      renderItem={({ item: { group, inDb, hasMuscles } }) => (
        <TouchableOpacity
          style={styles.sessionRow}
          onPress={() => openEditExercise(group)}
          accessibilityRole="button"
          accessibilityLabel={`Edit ${group.exerciseName}${inDb ? ", in the exercise database" : ""}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.sessionTitle}>{group.exerciseName}</Text>
            <Text style={styles.sessionSubtitle}>
              {hasMuscles
                ? muscleLabel(group.primaryMuscles, group.secondaryMuscles)
                : "No muscle group set"}
            </Text>
          </View>
          <Text
            style={[styles.dbMark, { color: colors.success }]}
            importantForAccessibility="no"
          >
            {inDb ? "✓" : ""}
          </Text>
          <Text style={styles.chevron} importantForAccessibility="no">
            ›
          </Text>
        </TouchableOpacity>
      )}
    />
  );
}

interface SessionDetailViewProps {
  readonly loadingDetail: boolean;
  readonly groupedExercises: GroupedExercise[];
  readonly openEditExercise: (group: GroupedExercise) => void;
  readonly openEditSet: (set: SetTiming) => void;
  readonly styles: ReturnType<typeof makeStyles>;
  readonly colors: ThemeColors;
}

function SessionDetailView({
  loadingDetail,
  groupedExercises,
  openEditExercise,
  openEditSet,
  styles,
  colors,
}: SessionDetailViewProps): React.JSX.Element {
  let body: React.ReactNode;
  if (loadingDetail) {
    body = (
      <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
    );
  } else if (groupedExercises.length === 0) {
    body = (
      <Text style={styles.emptyText}>No sets recorded in this session.</Text>
    );
  } else {
    body = groupedExercises.map((group) => (
      <View key={group.exerciseName} style={styles.exerciseCard}>
        <View style={styles.exerciseHeaderRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.exerciseName}>{group.exerciseName}</Text>
            <Text style={styles.exerciseMuscleGroup}>
              {muscleLabel(group.primaryMuscles, group.secondaryMuscles) ||
                "No muscle group set"}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.smallEditButton}
            onPress={() => openEditExercise(group)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${group.exerciseName}`}
          >
            <Text style={styles.smallEditButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {group.sets.map((set, idx) => (
          <TouchableOpacity
            key={set.id ?? `${group.exerciseName}-${idx}`}
            style={styles.setRow}
            onPress={() => openEditSet(set)}
            accessibilityRole="button"
            accessibilityLabel={`Edit set ${set.setIndex} of ${group.exerciseName}`}
          >
            <Text style={styles.setLabel}>Set {set.setIndex}</Text>
            <Text style={styles.setDetail}>
              {set.weight ?? 0}kg × {set.reps ?? 0}
            </Text>
            <Text style={styles.setTime}>
              {formatDateTime(set.endTime, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    ));
  }

  return (
    <ScrollView contentContainerStyle={styles.listContent}>{body}</ScrollView>
  );
}

export default function EditWorkoutHistoryModal({
  visible,
  onClose,
  split,
  onDataChanged,
}: Props): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { alert, AlertComponent } = useAlert();

  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [showImportedOnly, setShowImportedOnly] = useState(false);
  const [selectedSession, setSelectedSession] =
    useState<FullSessionWithGroups | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Known exercise names / muscle groups across this split's history, used to
  // catch typos/near-duplicates via exerciseMatching when renaming.
  const [knownExercises, setKnownExercises] = useState<GroupedExercise[]>([]);
  const [knownMuscleGroups, setKnownMuscleGroups] = useState<string[]>([]);
  const [loadingNameIndex, setLoadingNameIndex] = useState(false);
  const [listMode, setListMode] = useState<"sessions" | "exercises">("sessions");
  const knownExerciseNames = useMemo(
    () => knownExercises.map((group) => group.exerciseName),
    [knownExercises],
  );

  // Edit-exercise (name + muscle group, applies everywhere) form state
  const [editingExercise, setEditingExercise] =
    useState<GroupedExercise | null>(null);
  const [exerciseNameInput, setExerciseNameInput] = useState("");
  const [muscleGroupInput, setMuscleGroupInput] = useState("");
  const [savingExercise, setSavingExercise] = useState(false);
  const [browseMuscle, setBrowseMuscle] = useState<string | null>(null);
  const [browseVisible, setBrowseVisible] = useState(BROWSE_PAGE_SIZE);
  const [nameSuggestions, setNameSuggestions] = useState<SimilarityMatch[]>([]);
  const [muscleGroupSuggestions, setMuscleGroupSuggestions] = useState<
    SimilarityMatch[]
  >([]);

  const [editingSet, setEditingSet] = useState<SetTiming | null>(null);
  const [setDateInput, setSetDateInput] = useState("");
  const [setTimeInput, setSetTimeInput] = useState("");
  const [setWeightInput, setSetWeightInput] = useState("");
  const [setRepsInput, setSetRepsInput] = useState("");
  const [savingSet, setSavingSet] = useState(false);
  const [sessionsError, setSessionsError] = useState(false);
  const [nameIndexFailed, setNameIndexFailed] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const nameIndexBuiltRef = useRef(false);

  const loadSessions = useCallback(async () => {
    if (!split) return;
    setLoadingSessions(true);
    setSessionsError(false);
    try {
      const result = await workoutApi.getSessionHistory(split, null, 60);
      setSessions(result ?? []);
    } catch (error) {
      console.error("Error loading sessions to edit:", error);
      metric.count("history.sessions_load_failed");
      captureException(error, { stage: "loadSessionsToEdit" });
      setSessions([]);
      setSessionsError(true);
    } finally {
      setLoadingSessions(false);
    }
  }, [split]);

  // Built on first use (the Edit Exercise sheet or the Exercises list) instead
  // of on every open of the history modal.
  const buildNameIndex = useCallback(async (): Promise<
    GroupedExercise[] | null
  > => {
    if (!split) return null;
    setLoadingNameIndex(true);
    try {
      const withTimings = await workoutApi.getSessionHistory(
        split,
        null,
        200,
        true,
      );
      const exercises = new Map<string, GroupedExercise>();
      const groups = new Set<string>();
      const sessionsWithTimings = (withTimings ??
        []) as (WorkoutSession & { setTimings?: SetTiming[] })[];
      for (const session of sessionsWithTimings) {
        for (const set of session.setTimings ?? []) {
          const name = set.exerciseName?.trim();
          if (name && !exercises.has(name)) {
            exercises.set(name, {
              exerciseName: name,
              primaryMuscles: set.exercisePrimaryMuscles,
              secondaryMuscles: set.exerciseSecondaryMuscles,
              sets: [],
            });
          }
          for (const muscle of [
            ...(set.exercisePrimaryMuscles ?? []),
            ...(set.exerciseSecondaryMuscles ?? []),
          ]) {
            const trimmed = muscle.trim();
            if (trimmed) groups.add(trimmed);
          }
        }
      }
      const sorted = Array.from(exercises.values()).sort((a, b) =>
        a.exerciseName.localeCompare(b.exerciseName),
      );
      setKnownExercises(sorted);
      setKnownMuscleGroups(Array.from(groups));
      nameIndexBuiltRef.current = true;
      setNameIndexFailed(false);
      return sorted;
    } catch (error) {
      console.error("Error building exercise name index:", error);
      metric.count("history.name_index_failed");
      captureException(error, { stage: "buildExerciseNameIndex" });
      // Re-arm so reopening the exercise editor retries the build.
      nameIndexBuiltRef.current = false;
      setNameIndexFailed(true);
      return null;
    } finally {
      setLoadingNameIndex(false);
    }
  }, [split]);

  const openSession = useCallback(async (session: WorkoutSession) => {
    setLoadingDetail(true);
    try {
      const full = await workoutApi.getSession(session.id);
      setSelectedSession(full);
    } catch (error) {
      console.error("Error loading session detail:", error);
      metric.count("history.session_detail_load_failed");
      captureException(error, { stage: "loadSessionDetail" });
      alert(
        "Error",
        "Failed to load that session's sets.",
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setLoadingDetail(false);
    }
  }, [alert]);

  // Imports write names as the source app spelled them ("Tricep" for the
  // database's "Triceps"), which leaves them unmatched until fixed.
  const fixDbSpellings = useCallback(async () => {
    const fixes = (await buildNameIndex() ?? []).flatMap((group) => {
      const db = findExerciseByName(group.exerciseName);
      return db && db.name !== group.exerciseName
        ? [{ oldName: group.exerciseName, db }]
        : [];
    });
    let fixed = 0;
    for (const { oldName, db } of fixes) {
      try {
        await workoutApi.renameExercise(split, oldName, {
          newName: db.name,
          primaryMuscles: db.primaryMuscles,
          secondaryMuscles: db.secondaryMuscles,
        });
        fixed += 1;
      } catch (error) {
        captureException(error, { stage: "fixDbSpelling" });
      }
    }
    if (fixed === 0) return;
    showToast(
      `Matched ${fixed} exercise name${fixed === 1 ? "" : "s"} to the exercise database.`,
    );
    await Promise.all([buildNameIndex(), loadSessions()]);
    onDataChanged?.();
  }, [buildNameIndex, loadSessions, onDataChanged, split]);

  const handleShow = useCallback(() => {
    setSelectedSession(null);
    setListMode("sessions");
    nameIndexBuiltRef.current = false;
    void loadSessions();
    void fixDbSpellings();
  }, [loadSessions, fixDbSpellings]);

  const openEditExercise = (group: GroupedExercise) => {
    setEditingExercise(group);
    setExerciseNameInput(group.exerciseName);
    setMuscleGroupInput((group.primaryMuscles ?? []).join(", "));
    setNameSuggestions([]);
    setMuscleGroupSuggestions([]);
    const primary = group.primaryMuscles?.map((m) => m.trim().toLowerCase());
    setBrowseMuscle(
      BROWSE_MUSCLES.find((muscle) => primary?.includes(muscle)) ?? null,
    );
    setBrowseVisible(BROWSE_PAGE_SIZE);
    if (!nameIndexBuiltRef.current) void buildNameIndex();
  };

  const closeEditExercise = () => {
    setEditingExercise(null);
    setNameSuggestions([]);
    setMuscleGroupSuggestions([]);
  };

  useEffect(() => {
    if (!editingExercise || !exerciseNameInput.trim()) {
      setNameSuggestions([]);
      return;
    }
    const otherNames = knownExerciseNames.filter(
      (n) =>
        normalizeExerciseName(n) !==
        normalizeExerciseName(editingExercise.exerciseName),
    );
    const t = checkForTypo(exerciseNameInput, otherNames);
    setNameSuggestions(t.suggestions.length > 0 ? t.suggestions : []);
  }, [exerciseNameInput, editingExercise, knownExerciseNames]);

  useEffect(() => {
    if (!editingExercise || !muscleGroupInput.trim()) {
      setMuscleGroupSuggestions([]);
      return;
    }
    const otherGroups = Array.from(
      new Set([...CANONICAL_MUSCLE_GROUPS, ...knownMuscleGroups]),
    );
    const t = checkForTypo(muscleGroupInput, otherGroups);
    setMuscleGroupSuggestions(t.suggestions.length > 0 ? t.suggestions : []);
  }, [muscleGroupInput, editingExercise, knownMuscleGroups]);

  const dbMatch = useMemo(
    () => (editingExercise ? findExerciseByName(exerciseNameInput) : undefined),
    [editingExercise, exerciseNameInput],
  );

  const muscleBrowseResults = useMemo(
    () => (browseMuscle ? exercisesForMuscle(browseMuscle, []) : []),
    [browseMuscle],
  );

  const toggleBrowseMuscle = (muscle: string) => {
    setBrowseMuscle((prev) => (prev === muscle ? null : muscle));
    setBrowseVisible(BROWSE_PAGE_SIZE);
  };

  const handleNameChange = (name: string) => {
    setExerciseNameInput(name);
    const muscles = findExerciseByName(name)?.primaryMuscles;
    if (muscles?.length) setMuscleGroupInput(muscles.join(", "));
  };

  const handleSuggestionPress = (
    name: string,
    field: "name" | "muscleGroup",
  ) => {
    if (field === "muscleGroup") {
      setMuscleGroupInput(name);
      setMuscleGroupSuggestions([]);
    } else {
      handleNameChange(name);
      setNameSuggestions([]);
    }
  };

  const commitExerciseEdit = async (finalName: string, finalGroup: string) => {
    if (!editingExercise) return;
    setSavingExercise(true);
    try {
      const primaryMuscles = finalGroup ? parseMuscleList(finalGroup) : null;
      // Secondaries have no input of their own, so only a database exercise
      // overwrites them. A custom name keeps whatever was logged.
      const secondaryMuscles = findExerciseByName(finalName)?.secondaryMuscles;
      await workoutApi.renameExercise(split, editingExercise.exerciseName, {
        newName:
          finalName === editingExercise.exerciseName ? undefined : finalName,
        primaryMuscles,
        secondaryMuscles,
      });

      setSelectedSession((prev) => {
        if (!prev?.setTimings) return prev;
        return {
          ...prev,
          setTimings: prev.setTimings.map((s: SetTiming) =>
            s.exerciseName === editingExercise.exerciseName
              ? {
                  ...s,
                  exerciseName: finalName,
                  exercisePrimaryMuscles: primaryMuscles ?? undefined,
                  exerciseSecondaryMuscles:
                    secondaryMuscles ?? s.exerciseSecondaryMuscles,
                }
              : s,
          ),
        };
      });

      closeEditExercise();
      void buildNameIndex();
      onDataChanged?.();
      showToast(
        `"${editingExercise.exerciseName}" was updated everywhere it appears.`,
      );
    } catch (error) {
      alert(
        "Error",
        userFacingError(error, "Failed to update exercise."),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setSavingExercise(false);
    }
  };

  const saveExerciseEdit = async () => {
    if (!editingExercise) return;
    const newName = exerciseNameInput.trim();
    const newMuscleGroup = muscleGroupInput.trim();

    if (!newName) {
      alert(
        "Missing Name",
        "Exercise name can't be empty.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    const otherNames = knownExerciseNames.filter(
      (n) =>
        normalizeExerciseName(n) !==
        normalizeExerciseName(editingExercise.exerciseName),
    );
    const otherGroups = Array.from(
      new Set([...CANONICAL_MUSCLE_GROUPS, ...knownMuscleGroups]),
    );

    // Case/whitespace-only difference from an existing exercise → silently
    // normalize to that exercise's canonical spelling instead of creating a
    // near-duplicate.
    const canonicalName =
      findExerciseByName(newName)?.name ?? getCanonicalName(newName, otherNames);
    const canonicalGroup = newMuscleGroup
      ? getCanonicalName(newMuscleGroup, otherGroups)
      : newMuscleGroup;

    const nameChanged =
      normalizeExerciseName(canonicalName) !==
      normalizeExerciseName(editingExercise.exerciseName);
    const nameTypo = checkForTypo(canonicalName, otherNames);
    if (
      nameChanged &&
      nameTypo.isLikelyTypo &&
      nameTypo.suggestions.length > 0
    ) {
      const suggestion = nameTypo.suggestions[0].name;
      alert(
        "Similar Exercise Exists",
        `"${canonicalName}" looks similar to your existing "${suggestion}". Merge into "${suggestion}", or keep "${canonicalName}" as a separate exercise?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: `Merge into "${suggestion}"`,
            onPress: () => void commitExerciseEdit(suggestion, canonicalGroup),
          },
          {
            text: "Keep as new",
            onPress: () =>
              void commitExerciseEdit(canonicalName, canonicalGroup),
          },
        ],
        "warning",
      );
      return;
    }

    if (canonicalGroup) {
      const groupTypo = checkForTypo(canonicalGroup, otherGroups);
      if (groupTypo.isLikelyTypo && groupTypo.suggestions.length > 0) {
        const suggestion = groupTypo.suggestions[0].name;
        alert(
          "Similar Muscle Group Exists",
          `"${canonicalGroup}" looks similar to "${suggestion}". Use "${suggestion}" instead, or keep "${canonicalGroup}"?`,
          [
            { text: "Cancel", style: "cancel" },
            {
              text: `Use "${suggestion}"`,
              onPress: () => void commitExerciseEdit(canonicalName, suggestion),
            },
            {
              text: "Keep as typed",
              onPress: () =>
                void commitExerciseEdit(canonicalName, canonicalGroup),
            },
          ],
          "warning",
        );
        return;
      }
    }

    if (nameChanged) {
      // Rewrites every set logged under the old name across the whole split,
      // with no way back, the one edit in the app that earns a confirmation
      // even when nothing looks like a typo.
      alert(
        "Rename everywhere?",
        `Every set logged as "${editingExercise.exerciseName}" in this split will be renamed to "${canonicalName}". This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Rename",
            onPress: () =>
              void commitExerciseEdit(canonicalName, canonicalGroup),
          },
        ],
        "warning",
      );
      return;
    }

    await commitExerciseEdit(canonicalName, canonicalGroup);
  };

  const openEditSet = (set: SetTiming) => {
    const { date, time } = splitIso(set.endTime);
    setEditingSet(set);
    setShowDatePicker(false);
    setSetDateInput(date);
    setSetTimeInput(time);
    setSetWeightInput(String(set.weight ?? ""));
    setSetRepsInput(String(set.reps ?? ""));
  };

  const saveSetEdit = async () => {
    if (!editingSet || !selectedSession || editingSet.id == null) {
      alert(
        "Can't Edit",
        "This set has no server ID yet, so it can't be edited directly.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    const newEndIso = combineToIso(setDateInput, setTimeInput);
    if (!newEndIso) {
      alert(
        "Invalid Date/Time",
        "Use format YYYY-MM-DD for date and HH:MM (24h) for time.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    const weight =
      setWeightInput.trim() === "" ? undefined : parseDecimal(setWeightInput);
    const reps =
      setRepsInput.trim() === "" ? undefined : parseDecimal(setRepsInput);
    if (
      weight !== undefined &&
      (Number.isNaN(weight) || weight < 0 || weight > 2000)
    ) {
      alert(
        "Invalid Weight",
        "Enter a weight between 0 and 2000.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }
    if (
      reps !== undefined &&
      (Number.isNaN(reps) || !Number.isInteger(reps) || reps < 0 || reps > 1000)
    ) {
      alert(
        "Invalid Reps",
        "Enter a whole number of reps between 0 and 1000.",
        [{ text: "OK" }],
        "error",
      );
      return;
    }

    // Preserve the original set duration by shifting startTime by the same delta
    const originalEnd = new Date(editingSet.endTime).getTime();
    const originalStart = editingSet.startTime
      ? new Date(editingSet.startTime).getTime()
      : Number.NaN;
    const durationMs =
      !Number.isNaN(originalEnd) && !Number.isNaN(originalStart)
        ? originalEnd - originalStart
        : 0;
    const newEndMs = new Date(newEndIso).getTime();
    const newStartIso = new Date(
      newEndMs - Math.max(durationMs, 0),
    ).toISOString();

    const sessionDay = toDateString(
      selectedSession.startTime ?? editingSet.endTime,
    );
    if (toDateString(newEndIso) !== sessionDay) {
      const proceed = await new Promise<boolean>((resolve) => {
        // The set stays attached to its session, so anything bucketing by
        // session date and anything bucketing by set timestamp will disagree.
        alert(
          "Different day to the session",
          `This set belongs to a session on ${sessionDay}. Moving it to ${toDateString(newEndIso)} leaves the set and its session on different days, and totals bucketed either way will stop matching.`,
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Move it anyway", onPress: () => resolve(true) },
          ],
          "warning",
        );
      });
      if (!proceed) return;
    }

    setSavingSet(true);
    try {
      const updated = await workoutApi.updateSet(
        selectedSession.id,
        editingSet.id,
        {
          endTime: newEndIso,
          startTime: newStartIso,
          weight,
          reps,
        },
      );

      setSelectedSession((prev) => {
        if (!prev?.setTimings) return prev;
        return {
          ...prev,
          setTimings: prev.setTimings.map((s: SetTiming) =>
            s.id === editingSet.id ? { ...s, ...updated } : s,
          ),
        };
      });

      setEditingSet(null);
      onDataChanged?.();
      showToast("Set updated successfully.");
    } catch (error) {
      alert(
        "Error",
        userFacingError(error, "Failed to update set."),
        [{ text: "OK" }],
        "error",
      );
    } finally {
      setSavingSet(false);
    }
  };

  const groupedExercises = selectedSession?.setTimings
    ? groupSetsByExercise(selectedSession.setTimings)
    : [];

  const visibleSessions = showImportedOnly
    ? sessions.filter((s) => s.dayTitle === IMPORTED_DAY_TITLE)
    : sessions;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onShow={handleShow}
      onRequestClose={() => {
        if (selectedSession) setSelectedSession(null);
        else onClose();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.header}>
          {selectedSession ? (
            <TouchableOpacity
              onPress={() => setSelectedSession(null)}
              style={styles.headerTouch}
              accessibilityRole="button"
              accessibilityLabel="Back to the session list"
            >
              <Text style={styles.headerButton}>← Sessions</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 80 }} />
          )}
          <Text style={styles.headerTitle} accessibilityRole="header">
            {selectedSession ? "Edit Sets" : "Edit Imported History"}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={styles.headerTouch}
            accessibilityRole="button"
            accessibilityLabel="Close workout history editor"
          >
            <Text style={styles.headerButton}>Close</Text>
          </TouchableOpacity>
        </View>

        {!selectedSession && !loadingDetail && (
          <View style={styles.modeRow}>
            {(["sessions", "exercises"] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.filterPill,
                  listMode === mode && styles.filterPillActive,
                ]}
                onPress={() => {
                  setListMode(mode);
                  if (mode === "exercises" && !nameIndexBuiltRef.current) {
                    void buildNameIndex();
                  }
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: listMode === mode }}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    listMode === mode && styles.filterPillTextActive,
                  ]}
                >
                  {mode === "sessions" ? "Sessions" : "Exercises"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {!selectedSession && !loadingDetail && listMode === "exercises" ? (
          <ExerciseListView
            exercises={knownExercises}
            loading={loadingNameIndex}
            failed={nameIndexFailed}
            openEditExercise={openEditExercise}
            styles={styles}
            colors={colors}
          />
        ) : !selectedSession && !loadingDetail ? (
          <SessionListView
            showImportedOnly={showImportedOnly}
            setShowImportedOnly={setShowImportedOnly}
            loadingSessions={loadingSessions}
            sessionsError={sessionsError}
            reloadSessions={() => void loadSessions()}
            visibleSessions={visibleSessions}
            openSession={openSession}
            styles={styles}
            colors={colors}
          />
        ) : (
          <SessionDetailView
            loadingDetail={loadingDetail}
            groupedExercises={groupedExercises}
            openEditExercise={openEditExercise}
            openEditSet={openEditSet}
            styles={styles}
            colors={colors}
          />
        )}
      </SafeAreaView>

      <ModalSheet
        visible={!!editingExercise}
        onClose={closeEditExercise}
        dirty={
          !!editingExercise &&
          exerciseNameInput.trim() !== editingExercise.exerciseName
        }
        title="Edit Exercise"
        onConfirm={saveExerciseEdit}
        confirmText={savingExercise ? "Saving…" : "Save Everywhere"}
      >
        <Text style={styles.modalDescription}>
          Changes apply to every set logged under this exercise name for this
          split, not just this session.
        </Text>
        {nameIndexFailed && (
          <Text style={[styles.modalDescription, { color: colors.error }]}>
            ⚠️ Your existing exercise names could not be loaded, so OwnGains
            cannot warn you about near-duplicates or offer merges here. Close
            and reopen this editor to try again.
          </Text>
        )}
        <Text style={styles.fieldLabel}>Exercise Name</Text>
        <TextInput
          style={styles.input}
          value={exerciseNameInput}
          onChangeText={handleNameChange}
          placeholder="e.g. Bench Press"
          placeholderTextColor={colors.textMuted}
        />
        {nameSuggestions.length > 0 && (
          <SuggestionsBox
            title="💡 Did you mean:"
            variant="highlight"
            items={nameSuggestions.map((s) => ({
              label: s.name,
              meta: `${Math.round(s.similarity * 100)}% match`,
            }))}
            onSelect={(name) => handleSuggestionPress(name, "name")}
          />
        )}
        <Text style={styles.fieldLabel}>Browse by muscle</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.chipRow}
        >
          {BROWSE_MUSCLES.map((muscle) => {
            const selected = browseMuscle === muscle;
            const label = muscleDisplayName(muscle);
            return (
              <TouchableOpacity
                key={muscle}
                style={[styles.chip, selected && styles.chipActive]}
                accessibilityRole="radio"
                accessibilityLabel={`${label} exercises`}
                accessibilityState={{ selected }}
                onPress={() => toggleBrowseMuscle(muscle)}
              >
                <Text
                  style={[styles.chipText, selected && styles.chipTextActive]}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {browseMuscle && (
          <SuggestionsBox
            title={`${muscleDisplayName(browseMuscle)} exercises:`}
            variant="highlight"
            items={muscleBrowseResults
              .slice(0, browseVisible)
              .map((item) => ({ label: item.name, meta: item.meta }))}
            onSelect={(name) => {
              handleNameChange(name);
              setNameSuggestions([]);
              setBrowseMuscle(null);
            }}
          />
        )}
        {browseMuscle && muscleBrowseResults.length > browseVisible && (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setBrowseVisible((v) => v + BROWSE_PAGE_SIZE)}
            accessibilityRole="button"
            accessibilityLabel={`Show ${Math.min(BROWSE_PAGE_SIZE, muscleBrowseResults.length - browseVisible)} more exercises`}
          >
            <Text style={styles.retryButtonText}>
              Load more ({muscleBrowseResults.length - browseVisible})
            </Text>
          </TouchableOpacity>
        )}
        <Text style={styles.fieldLabel}>Muscle Group</Text>
        <TextInput
          style={styles.input}
          value={muscleGroupInput}
          onChangeText={setMuscleGroupInput}
          placeholder="e.g. Chest"
          placeholderTextColor={colors.textMuted}
        />
        {muscleGroupSuggestions.length > 0 && (
          <SuggestionsBox
            title="💡 Did you mean:"
            variant="highlight"
            items={muscleGroupSuggestions.map((s) => ({
              label: s.name,
              meta: `${Math.round(s.similarity * 100)}% match`,
            }))}
            onSelect={(name) => handleSuggestionPress(name, "muscleGroup")}
          />
        )}
        {dbMatch && dbMatch.name !== exerciseNameInput.trim() && (
          <Text style={styles.modalDescription}>
            Will be saved as "{dbMatch.name}" from the exercise database.
          </Text>
        )}
        {!!dbMatch?.secondaryMuscles.length && (
          <Text style={styles.modalDescription}>
            Secondary muscles from the exercise database:{" "}
            {dbMatch.secondaryMuscles.join(", ")}
          </Text>
        )}
      </ModalSheet>

      <ModalSheet
        visible={!!editingSet}
        onClose={() => setEditingSet(null)}
        dirty={
          !!editingSet &&
          (setWeightInput !== String(editingSet.weight ?? "") ||
            setRepsInput !== String(editingSet.reps ?? "") ||
            combineToIso(setDateInput, setTimeInput) !== editingSet.endTime)
        }
        title="Edit Set"
        onConfirm={saveSetEdit}
        confirmText={savingSet ? "Saving…" : "Save"}
      >
        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.input}
          onPress={() => setShowDatePicker((prev) => !prev)}
          accessibilityRole="button"
          accessibilityLabel={`Date: ${formatDateInput(setDateInput) || "not set"}. Tap to change.`}
          accessibilityState={{ expanded: showDatePicker }}
        >
          <Text
            style={[
              styles.inputValueText,
              !formatDateInput(setDateInput) && styles.inputPlaceholderText,
            ]}
          >
            {formatDateInput(setDateInput) || "Pick a date"}
          </Text>
        </TouchableOpacity>
        {showDatePicker && (
          <UniversalCalendar
            initialView="month"
            onDatePress={(date) => {
              setSetDateInput(toDateString(date));
              setShowDatePicker(false);
            }}
            getDayDecoration={(date) =>
              toDateString(date) === setDateInput
                ? {
                    backgroundColor: colors.accent,
                    textColor: colors.textOnAccent,
                  }
                : null
            }
          />
        )}
        <Text style={styles.fieldLabel}>Time (24h, HH:MM)</Text>
        <TextInput
          style={styles.input}
          value={setTimeInput}
          onChangeText={setSetTimeInput}
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          placeholder="18:30"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Time, 24 hour, hours colon minutes"
        />
        <Text style={styles.fieldLabel}>Weight (kg)</Text>
        <TextInput
          style={styles.input}
          value={setWeightInput}
          onChangeText={setSetWeightInput}
          keyboardType="decimal-pad"
          placeholder="60"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.fieldLabel}>Reps</Text>
        <TextInput
          style={styles.input}
          value={setRepsInput}
          onChangeText={setSetRepsInput}
          keyboardType="number-pad"
          placeholder="8"
          placeholderTextColor={colors.textMuted}
        />
      </ModalSheet>

      {AlertComponent}
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceBorder,
      backgroundColor: colors.surface,
    },
    headerTouch: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 80 },
    headerButton: { fontSize: 15, fontWeight: "600", color: colors.accent },
    inputValueText: { fontSize: 16, color: colors.textPrimary },
    inputPlaceholderText: { color: colors.textMuted },
    errorText: {
      textAlign: "center",
      color: colors.error,
      marginTop: 40,
      fontSize: 15,
    },
    retryButton: {
      paddingVertical: 12,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    retryButtonText: { fontSize: 16, fontWeight: "600", color: colors.accent },
    chipRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    chip: {
      minWidth: 44,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      backgroundColor: colors.background,
    },
    chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    chipTextActive: { color: colors.textOnAccent },
    modeRow: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    headerTitle: { fontSize: 17, fontWeight: "700", color: colors.textPrimary },
    listContent: { padding: 16, paddingBottom: 60 },
    emptyText: {
      textAlign: "center",
      color: colors.textMuted,
      marginTop: 40,
      fontSize: 15,
    },
    filterPill: {
      alignSelf: "flex-start",
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      marginBottom: 14,
    },
    filterPillActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    filterPillText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    filterPillTextActive: {
      color: colors.textOnAccent,
    },
    sessionRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
    sessionTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
      marginBottom: 2,
    },
    sessionSubtitle: { fontSize: 13, color: colors.textSecondary },
    chevron: { fontSize: 22, color: colors.textMuted, marginLeft: 8 },
    dbMark: { width: 20, fontSize: 16, fontWeight: "700", textAlign: "center" },
    filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    exerciseCard: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 14,
    },
    exerciseHeaderRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 4,
    },
    exerciseName: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.textPrimary,
    },
    exerciseMuscleGroup: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    smallEditButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    smallEditButtonText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.accent,
    },
    setRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 12,
      minHeight: 44,
      borderTopWidth: 1,
      borderTopColor: colors.surfaceBorder,
    },
    setLabel: { fontSize: 13, color: colors.textMuted, width: 50 },
    setDetail: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textPrimary,
      flex: 1,
    },
    setTime: { fontSize: 12, color: colors.textSecondary },
    modalDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 16,
      lineHeight: 18,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 4,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.textPrimary,
      borderWidth: 2,
      borderColor: colors.surfaceBorder,
      marginBottom: 12,
    },
  });
