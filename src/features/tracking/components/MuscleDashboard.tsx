import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Alert,
  Dimensions,
} from "react-native";
import { ProgressPhotoThumb } from "./ProgressPhotoThumb";
import { useTheme } from "@shared/context/ThemeContext";
import { useAuthToken } from "@shared/context/AuthContext";
import {
  sorenessApi,
  injuryApi,
  progressPhotoApi,
  personalNotesApi,
} from "../services";
import {
  MuscleGroup,
  MUSCLE_GROUP_LABELS,
  PersonalMuscleNote,
} from "../types/muscleRecovery";
import type {
  ActiveSoreness,
  DOMSStats,
  InjuryRecord,
  ProgressPhotoMuscle,
} from "../types/muscleRecovery";
import ProgressChart from "@shared/components/ProgressChart";
import { getSeverityColor, SEVERITY_STOPS } from "@utils/severityColor";
import { captureException } from "@shared/services/crashReporting";
import type { ApiResponse } from "../services/types";
import { describeError } from "../helpers";
import {
  Bar,
  Button,
  Chip,
  IconButton,
  Metric,
  Note,
  Placeholder,
  Row,
  SectionLabel,
  TINT,
  radius,
  space,
} from "../ui";
import { NOTE_MAX_LENGTH } from "@shared/limits";

const SCREEN_WIDTH = Dimensions.get("window").width;
const PHOTO_SIZE = (SCREEN_WIDTH - 32 - space.md) / 2;

interface MuscleDashboardProps {
  readonly muscleGroup: MuscleGroup;
  readonly onClose: () => void;
}

type TabType = "soreness" | "photos" | "injuries" | "stats" | "notes";

const TABS: { key: TabType; label: string }[] = [
  { key: "soreness", label: "Soreness" },
  { key: "photos", label: "Photos" },
  { key: "injuries", label: "Injuries" },
  { key: "stats", label: "Stats" },
  { key: "notes", label: "Notes" },
];

const STATUS_COLORS: Record<string, string> = {
  active: SEVERITY_STOPS.bad,
  recovering: SEVERITY_STOPS.warn,
};
const RECOVERED_COLOR = SEVERITY_STOPS.good;

function recoveryTimeLabel(days: number): string {
  const rounded = Math.round(days);
  if (rounded < 1) return "under a day";
  if (rounded === 1) return "1 day";
  return `${rounded} days`;
}

function StatusBadge({ status }: { readonly status: string }) {
  const color = STATUS_COLORS[status] ?? RECOVERED_COLOR;
  return (
    <View style={[styles.badge, { backgroundColor: `${color}${TINT}` }]}>
      <Text style={[styles.badgeText, { color }]}>{status}</Text>
    </View>
  );
}

export const MuscleDashboard: React.FC<MuscleDashboardProps> = ({
  muscleGroup,
  onClose,
}) => {
  const { colors } = useTheme();
  const authToken = useAuthToken();
  const [activeTab, setActiveTab] = useState<TabType>("soreness");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sorenessHistory, setSorenessHistory] = useState<ActiveSoreness[]>([]);
  const [injuries, setInjuries] = useState<InjuryRecord[]>([]);
  const [photos, setPhotos] = useState<ProgressPhotoMuscle[]>([]);
  const [recoveryStats, setRecoveryStats] = useState<DOMSStats | null>(null);
  const [personalNotes, setPersonalNotes] = useState<PersonalMuscleNote[]>([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const muscleLabel = MUSCLE_GROUP_LABELS[muscleGroup] || muscleGroup;

  const loadData = useCallback(async () => {
    setLoading(true);
    const [soreness, injuryList, photoList, stats, notes] =
      await Promise.allSettled([
        sorenessApi.getHistoryByMuscle(muscleGroup),
        injuryApi.getInjuriesByMuscle(muscleGroup),
        progressPhotoApi.getPhotosByMuscle(muscleGroup),
        sorenessApi.getStats(),
        personalNotesApi.getNotesByMuscle(muscleGroup),
      ]);

    const unwrap = <T,>(
      result: PromiseSettledResult<ApiResponse<T>>,
    ): T | undefined => {
      if (result.status === "rejected") return undefined;
      return result.value?.data;
    };
    const asList = <T,>(result: PromiseSettledResult<ApiResponse<T[]>>) => {
      const value = unwrap(result);
      return Array.isArray(value) ? value : [];
    };

    if (soreness.status === "fulfilled") setSorenessHistory(asList(soreness));
    if (injuryList.status === "fulfilled") setInjuries(asList(injuryList));
    if (photoList.status === "fulfilled") setPhotos(asList(photoList));
    if (stats.status === "fulfilled") setRecoveryStats(unwrap(stats) ?? null);
    if (notes.status === "fulfilled") setPersonalNotes(asList(notes));

    const failures = [soreness, injuryList, photoList, stats, notes].filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    for (const failure of failures) {
      console.error("Failed to load muscle dashboard data:", failure.reason);
      captureException(failure.reason, { stage: "loadMuscleDashboard" });
    }
    setLoadFailed(failures.length > 0);
    setLoading(false);
  }, [muscleGroup]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentSoreness = sorenessHistory.find((s) => s.status === "active");
  const recoveryStat = recoveryStats?.muscleRecoveryStats?.find(
    (s) => s.muscleGroup === muscleGroup,
  );
  const recentTrend = recoveryStats?.severityTrend?.slice(-7) ?? [];

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    try {
      setSavingNote(true);
      const response = await personalNotesApi.createNote({
        muscleGroup,
        content: newNoteText.trim(),
      });

      const newNote = response?.data ?? response;
      if (newNote) {
        setPersonalNotes((prev) => [newNote, ...prev]);
        setNewNoteText("");
        setShowNoteInput(false);
      }
    } catch (error) {
      console.error("Failed to save note:", error);
      captureException(error, { stage: "saveMuscleNote" });
      Alert.alert("Couldn't save note", "Try again.");
    } finally {
      setSavingNote(false);
    }
  };

  const removeInjury = async (injury: InjuryRecord) => {
    try {
      await injuryApi.deleteInjury(injury.id);
      setInjuries((prev) => prev.filter((i) => i.id !== injury.id));
    } catch (error) {
      Alert.alert("Couldn't delete injury", describeError(error));
    }
  };

  const deleteInjury = (injury: InjuryRecord) => {
    Alert.alert("Delete injury", "Remove this injury record?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeInjury(injury) },
    ]);
  };

  const removeNote = async (note: PersonalMuscleNote) => {
    try {
      await personalNotesApi.deleteNote(note.id);
      setPersonalNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (error) {
      Alert.alert("Couldn't delete note", describeError(error));
    }
  };

  const deleteNote = (note: PersonalMuscleNote) => {
    Alert.alert("Delete note", "Remove this note?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => removeNote(note) },
    ]);
  };

  if (loading) {
    return (
      <View
        style={[styles.loading, { backgroundColor: colors.background }]}
        accessibilityRole='progressbar'
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { borderBottomColor: colors.separator }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {muscleLabel}
          </Text>
          {currentSoreness ? (
            <Text
              style={[
                styles.headerMeta,
                { color: getSeverityColor(currentSoreness.intensity) },
              ]}
            >
              Sore at {currentSoreness.intensity}/10 since{" "}
              {new Date(currentSoreness.loggedAt).toLocaleDateString()}
            </Text>
          ) : (
            <Text style={[styles.headerMeta, { color: colors.textMuted }]}>
              Not sore right now
            </Text>
          )}
        </View>
        <IconButton
          glyph='✕'
          label='Close muscle dashboard'
          onPress={onClose}
        />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <Chip
            key={tab.key}
            label={tab.label}
            selected={activeTab === tab.key}
            onPress={() => setActiveTab(tab.key)}
          />
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps='handled'
      >
        {loadFailed && (
          <View style={styles.loadFailed}>
            <View style={{ flex: 1 }}>
              <Note>Some of this muscle's data couldn't be loaded.</Note>
            </View>
            <Button
              label='Retry'
              size='sm'
              variant='quiet'
              onPress={() => void loadData()}
              accessibilityLabel={`Retry loading ${muscleLabel} data`}
            />
          </View>
        )}
        {activeTab === "soreness" &&
          (sorenessHistory.length === 0 ? (
            <Placeholder text='No soreness recorded for this muscle.' />
          ) : (
            <View style={{ gap: space.lg }}>
              {sorenessHistory.map((entry) => (
                <View key={entry.id} style={{ gap: space.sm }}>
                  <View style={styles.entryHead}>
                    <Text
                      style={[styles.entryDate, { color: colors.textPrimary }]}
                    >
                      {new Date(entry.loggedAt).toLocaleDateString()}
                    </Text>
                    <StatusBadge status={entry.status} />
                  </View>
                  <Bar
                    pct={(entry.intensity / 10) * 100}
                    tone={getSeverityColor(entry.intensity)}
                  />
                  <Text style={[styles.entryMeta, { color: colors.textMuted }]}>
                    {entry.intensity}/10
                    {entry.note ? ` · ${entry.note}` : ""}
                  </Text>
                  {entry.followUps && entry.followUps.length > 0 && (
                    <View style={styles.followUps}>
                      {entry.followUps.map((fu) => (
                        <Text
                          key={`${fu.createdAt}-${fu.status}`}
                          style={[
                            styles.entryMeta,
                            { color: colors.textMuted },
                          ]}
                        >
                          {new Date(fu.createdAt).toLocaleDateString()}:{" "}
                          {fu.status}, {fu.intensity}/10
                        </Text>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

        {activeTab === "photos" &&
          (photos.length === 0 ? (
            <Placeholder text='No photos tagged to this muscle yet.' />
          ) : (
            <View style={styles.photoGrid}>
              {photos.map((photo) => (
                <View key={photo.id} style={{ width: PHOTO_SIZE, gap: 6 }}>
                  <ProgressPhotoThumb
                    photo={photo}
                    authToken={authToken}
                    style={[
                      styles.photo,
                      { backgroundColor: colors.inputBackground },
                    ]}
                  />
                  <Text style={[styles.entryMeta, { color: colors.textMuted }]}>
                    {new Date(photo.takenAt ?? "").toLocaleDateString()} ·{" "}
                    {photo.angle}
                  </Text>
                  {photo.note ? (
                    <Text
                      style={[styles.entryMeta, { color: colors.textMuted }]}
                      numberOfLines={2}
                    >
                      {photo.note}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ))}

        {activeTab === "injuries" &&
          (injuries.length === 0 ? (
            <Placeholder text='No injuries recorded for this muscle.' />
          ) : (
            <View style={{ gap: space.lg }}>
              {injuries.map((injury) => (
                <View key={injury.id} style={{ gap: space.sm }}>
                  <View style={styles.entryHead}>
                    <Text
                      style={[styles.entryDate, { color: colors.textPrimary }]}
                    >
                      {injury.injuryType}
                    </Text>
                    <StatusBadge status={injury.status} />
                  </View>
                  <Bar
                    pct={(injury.painLevel / 10) * 100}
                    tone={getSeverityColor(injury.painLevel, 3)}
                  />
                  <Text style={[styles.entryMeta, { color: colors.textMuted }]}>
                    {injury.painLevel}/10 pain ·{" "}
                    {new Date(injury.startDate).toLocaleDateString()}
                  </Text>
                  {injury.note ? (
                    <Text
                      style={[
                        styles.entryMeta,
                        { color: colors.textSecondary },
                      ]}
                    >
                      {injury.note}
                    </Text>
                  ) : null}
                  <Button
                    label='Delete'
                    size='sm'
                    variant='danger'
                    onPress={() => deleteInjury(injury)}
                  />
                </View>
              ))}
            </View>
          ))}

        {activeTab === "stats" &&
          (recoveryStat ? (
            <View style={{ gap: space.lg }}>
              <Metric
                label='Sore episodes'
                value={String(recoveryStat.totalEpisodes)}
                meta={
                  recoveryStat.lastSorenessDate
                    ? `Last on ${new Date(recoveryStat.lastSorenessDate).toLocaleDateString()}`
                    : "Never logged"
                }
              />
              <View>
                <SectionLabel>Typical episode</SectionLabel>
                <Row
                  title='Recovery time'
                  value={
                    recoveryStat.averageRecoveryDays
                      ? recoveryTimeLabel(recoveryStat.averageRecoveryDays)
                      : "—"
                  }
                />
                <Row
                  title='Severity'
                  value={
                    recoveryStat.averageSeverity == null
                      ? "—"
                      : `${recoveryStat.averageSeverity.toFixed(1)}/10`
                  }
                  last
                />
              </View>
              {recentTrend.length > 0 && (
                <ProgressChart
                  title='Severity, last 7 logs'
                  chartType='bar'
                  chartWidth={SCREEN_WIDTH - 64}
                  barColors={recentTrend.map((point) =>
                    getSeverityColor(point.averageIntensity, 3),
                  )}
                  data={{
                    labels: recentTrend.map((point) =>
                      String(new Date(point.date).getDate()),
                    ),
                    datasets: [
                      {
                        data: recentTrend.map(
                          (point) => point.averageIntensity,
                        ),
                      },
                    ],
                  }}
                />
              )}
            </View>
          ) : (
            <Placeholder text='Log soreness a few times and the stats fill in.' />
          ))}

        {activeTab === "notes" && (
          <View style={{ gap: space.md }}>
            <Button
              label={showNoteInput ? "Cancel" : "Add a note"}
              variant={showNoteInput ? "quiet" : "primary"}
              onPress={() => setShowNoteInput(!showNoteInput)}
            />

            {showNoteInput && (
              <View style={{ gap: space.sm }}>
                <TextInput
                  style={[
                    styles.noteInput,
                    {
                      color: colors.textPrimary,
                      borderColor: colors.inputBorder,
                      backgroundColor: colors.inputBackground,
                    },
                  ]}
                  placeholder='What should you remember about this muscle?'
                  placeholderTextColor={colors.textMuted}
                  value={newNoteText}
                  maxLength={NOTE_MAX_LENGTH}
                  onChangeText={setNewNoteText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical='top'
                />
                <Button
                  label={savingNote ? "Saving…" : "Save note"}
                  onPress={handleAddNote}
                  disabled={savingNote || !newNoteText.trim()}
                />
              </View>
            )}

            {personalNotes.length === 0 ? (
              <Placeholder text='No notes for this muscle yet.' />
            ) : (
              <View>
                {personalNotes.map((note, index) => (
                  <Row
                    key={note.id}
                    title={note.content}
                    meta={new Date(note.createdAt).toLocaleDateString()}
                    last={index === personalNotes.length - 1}
                    right={
                      <IconButton
                        glyph='🗑'
                        label='Delete note'
                        tone='danger'
                        onPress={() => deleteNote(note)}
                      />
                    }
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadFailed: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    marginBottom: space.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 26, fontWeight: "700", letterSpacing: -0.5 },
  headerMeta: { fontSize: 13, marginTop: 2 },
  tabRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    paddingHorizontal: 16,
    paddingVertical: space.md,
  },
  content: { paddingHorizontal: 16, paddingBottom: 40 },
  entryHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  entryDate: { fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
  entryMeta: { fontSize: 12, lineHeight: 17 },
  followUps: { gap: 2, paddingLeft: space.md },
  badge: {
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.md },
  photo: { width: "100%", height: PHOTO_SIZE, borderRadius: radius.md },
  noteInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    minHeight: 90,
    fontSize: 15,
  },
});

export default MuscleDashboard;
