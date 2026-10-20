import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ModalSheet from "@shared/components/ModalSheet";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import { TrainerLoggedBadge } from "@shared/components/TrainerLoggedBadge";
import { useAlert, type UseAlertReturn } from "@shared/components/CustomAlert";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useAuth } from "@shared/context/AuthContext";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { userFacingError } from "@shared/services/apiError";
import { reportAndReturn } from "@shared/services/crashReporting";
import { traineeFetch } from "@shared/services/traineeFetch";
import { alarmsAvailable } from "@shared/services/supplementAlarms";
import { initializeSupplementNotifications } from "@shared/services/supplementReminders";
import { promptForAlarmPermissions } from "@shared/services/notifications";
import type { RootStackParamList } from "@shared/types";
import { clientScheduleEvents, useSchedule } from "./ScheduleContext";
import { makeProgramApi } from "@features/plan/services/programApiFactory";
import { makeScheduleApi } from "./services";
import { isCalendarSyncEnabled, setCalendarSync } from "./calendarSync";
import {
  dayStatus,
  entriesOnDay,
  formatDay,
  formatTime,
  formatWhen,
  MAX_REMINDER_MINUTES,
  notInPast,
  REMINDER_UNITS,
  splitReminder,
  upcomingEntries,
} from "./utils";
import type { ScheduledWorkout, ScheduleParams } from "./types";

const DAY_MS = 86_400_000;
const UPCOMING_SHOWN = 4;
const DURATIONS = [30, 45, 60, 90];
const REMINDERS: { label: string; minutes: number | null }[] = [
  { label: "None", minutes: null },
  { label: "30 min", minutes: 30 },
  { label: "1 hour", minutes: 60 },
  { label: "2 hours", minutes: 120 },
  { label: "1 day", minutes: 1440 },
];
const ALERT_TYPES = [
  { alarm: false, icon: "🔔", label: "Notification", desc: "Standard alert" },
  { alarm: true, icon: "⏰", label: "Alarm", desc: "Rings until dismissed" },
];

interface Source {
  entries: ScheduledWorkout[];
  /** True in a trainer's act-as pane, where entries are suggestions to a client. */
  asTrainer: boolean;
  create: (params: ScheduleParams) => Promise<void>;
  update: (id: number, patch: Partial<ScheduleParams>) => Promise<void>;
  accept: (id: number) => Promise<void>;
  /** Deletes the user's own entry, or withdraws the trainer's suggestion. */
  remove: (id: number) => Promise<void>;
}

function useClientSchedule(client: { userId: string } | null): Source | null {
  const { user } = useAuth();
  const api = useMemo(() => (client ? makeScheduleApi(traineeFetch(client.userId)) : null), [client]);
  const [entries, setEntries] = useState<ScheduledWorkout[]>([]);
  const refresh = useCallback(async () => {
    if (!api) return;
    const from = new Date(Date.now() - DAY_MS);
    setEntries(await api.list(from, new Date(from.getTime() + 400 * DAY_MS), true).catch(reportAndReturn([], { stage: "clientScheduleList" })));
  }, [api]);
  useEffect(() => {
    if (!client) return;
    void refresh();
    return clientScheduleEvents.subscribe((uuid) => {
      if (uuid === client.userId) void refresh();
    });
  }, [client, refresh]);
  return useMemo(() => {
    if (!api) return null;
    const then =
      <A extends unknown[]>(call: (...args: A) => Promise<unknown>) =>
      async (...args: A) => {
        await call(...args);
        await refresh();
      };
    return {
      // The client's own plans are theirs. A trainer sees only what they suggested.
      entries: entries.filter((e) => e.scheduledBy?.uuid === user?.id),
      asTrainer: true,
      create: then(api.create),
      update: then(api.update),
      accept: async () => {},
      remove: then(api.cancel),
    };
  }, [api, entries, refresh, user?.id]);
}

function useOwnSchedule(trainerUuid?: string): Source {
  const schedule = useSchedule();
  return useMemo(
    () => ({
      ...schedule,
      entries: trainerUuid ? schedule.entries.filter((e) => e.scheduledBy?.uuid === trainerUuid) : schedule.entries,
      asTrainer: false,
    }),
    [schedule, trainerUuid],
  );
}

type ProgramDay = { dayNumber: number; dayTitle?: string };

function useClientDays(client: { userId: string } | undefined): ProgramDay[] | null {
  const [days, setDays] = useState<ProgramDay[] | null>(null);
  useEffect(() => {
    setDays(null);
    if (!client) return;
    let active = true;
    void makeProgramApi(traineeFetch(client.userId))
      .fetchSavedProgram()
      .then((program) => program?.days ?? [])
      .catch(reportAndReturn([] as ProgramDay[], { stage: "clientScheduleDays" }))
      .then((list) => {
        if (active) setDays(list);
      });
    return () => {
      active = false;
    };
  }, [client]);
  return days;
}

type FormState = { editing: ScheduledWorkout | null; date: Date };

interface ScheduleWidgetProps {
  /** A client to suggest workouts to, outside their act-as pane. */
  readonly client?: { userId: string };
  /** Shows only what this trainer suggested, on the client's view of their trainer. */
  readonly trainerUuid?: string;
}

export default function ScheduleWidget({ client: clientProp, trainerUuid }: ScheduleWidgetProps = {}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { actAs, workoutData, saveCurrentDay, hasActiveSession } = useWorkoutPick(
    "actAs",
    "workoutData",
    "saveCurrentDay",
    "hasActiveSession",
  );
  const own = useOwnSchedule(trainerUuid);
  const client = useClientSchedule(clientProp ?? actAs);
  const clientDays = useClientDays(clientProp);
  const source = client ?? own;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { alert, AlertComponent } = useAlert();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [form, setForm] = useState<FormState | null>(null);

  const days = clientDays ?? (clientProp ? [] : (workoutData?.days ?? []));
  const canAdd = !trainerUuid;
  const active = source.entries.filter((e) => e.status !== "cancelled");
  const upcoming = upcomingEntries(active, Date.now()).slice(0, UPCOMING_SHOWN);

  const dotColorOn = (date: Date): string | undefined => {
    const status = dayStatus(source.entries, date);
    if (status === "pending") return colors.warning;
    if (status === "cancelled") return colors.error;
    return undefined;
  };

  const run = (action: () => Promise<void>, failure: string) =>
    action().catch((error: unknown) => alert("Schedule", userFacingError(error, failure), [{ text: "OK" }], "error"));

  const start = (entry: ScheduledWorkout) => {
    if (entry.programDay == null) return;
    if (hasActiveSession()) {
      alert("Workout in progress", "Finish or end the current workout first.", [{ text: "OK" }], "warning");
      return;
    }
    void saveCurrentDay(entry.programDay);
    navigation.navigate("Workout");
  };

  const renderEntry = (entry: ScheduledWorkout) => {
    const pending = entry.status === "pending";
    const cancelled = entry.status === "cancelled";
    const mine = !source.asTrainer && entry.scheduledBy == null;
    const isToday = new Date(entry.startAt).toDateString() === new Date().toDateString();
    return (
      <TouchableOpacity
        key={entry.id}
        style={styles.entry}
        onPress={() => setForm({ editing: entry, date: new Date(entry.startAt) })}
        disabled={cancelled}
        accessibilityRole='button'
        accessibilityState={{ disabled: cancelled }}
        accessibilityLabel={`${entry.title}, ${formatWhen(entry.startAt)}${pending ? ", pending" : ""}${cancelled ? ", cancelled" : ". Edit"}`}
      >
        <View style={styles.entryHeader}>
          <Text style={styles.entryWhen}>{formatWhen(entry.startAt)}</Text>
          {pending && <Text style={styles.pendingTag}>Pending</Text>}
          {cancelled && <Text style={styles.cancelledTag}>Cancelled</Text>}
        </View>
        <Text style={styles.entryTitle}>
          {entry.title}
          {entry.programDay != null ? `  ·  Day ${entry.programDay}` : ""}
        </Text>
        {!source.asTrainer && (
          <TrainerLoggedBadge
            loggedByTrainerId={entry.scheduledBy?.uuid}
            loggedByTrainerUsername={entry.scheduledBy?.username}
            verb='Scheduled'
          />
        )}
        {pending && !source.asTrainer && (
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => void run(() => source.accept(entry.id), "Could not accept the workout.")}
              accessibilityRole='button'
              accessibilityLabel={`Accept ${entry.title}`}
            >
              <Text style={styles.primaryButtonText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => void run(() => source.remove(entry.id), "Could not decline the workout.")}
              accessibilityRole='button'
              accessibilityLabel={`Decline ${entry.title}`}
            >
              <Text style={styles.secondaryButtonText}>Decline</Text>
            </TouchableOpacity>
          </View>
        )}
        {!pending && !cancelled && !source.asTrainer && isToday && entry.programDay != null && (mine || entry.scheduledBy) && (
          <TouchableOpacity
            style={[styles.primaryButton, styles.startButton]}
            onPress={() => start(entry)}
            accessibilityRole='button'
            accessibilityLabel={`Start Day ${entry.programDay}`}
          >
            <Text style={styles.primaryButtonText}>Start</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const dayEntries = entriesOnDay(source.entries, selectedDay);
  const selectedIsPast =
    selectedDay.toDateString() !== new Date().toDateString() &&
    selectedDay.getTime() < Date.now();

  return (
    <View>
      {upcoming.length === 0 ? (
        <Text style={styles.muted}>
          {source.asTrainer
            ? "Nothing planned for this client."
            : trainerUuid
              ? "Your trainer hasn't suggested any workouts yet."
              : "Nothing planned. Schedule a workout to get a reminder."}
        </Text>
      ) : (
        upcoming.map(renderEntry)
      )}
      <View style={styles.actions}>
        {canAdd && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setForm({ editing: null, date: nextHour() })}
            accessibilityRole='button'
          >
            <Text style={styles.primaryButtonText}>{source.asTrainer ? "Suggest workout" : "Schedule"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setCalendarOpen(true)} accessibilityRole='button'>
          <Text style={styles.secondaryButtonText}>Calendar</Text>
        </TouchableOpacity>
      </View>

      <ModalSheet
        visible={calendarOpen && !form}
        onClose={() => setCalendarOpen(false)}
        title='Scheduled workouts'
        showConfirmButton={false}
        cancelText='Close'
        scrollable
      >
        <UniversalCalendar
          allowFuture
          hasDataOnDate={(date) => entriesOnDay(source.entries, date).length > 0}
          onDatePress={setSelectedDay}
          legendText='Workout planned'
          getDayDecoration={(date) => ({
            backgroundColor: date.toDateString() === selectedDay.toDateString() ? colors.accentLight : undefined,
            dotColor: dotColorOn(date),
          })}
        />
        <Text style={styles.dayHeading}>{formatDay(selectedDay)}</Text>
        {dayEntries.length === 0 ? <Text style={styles.muted}>Nothing planned.</Text> : dayEntries.map(renderEntry)}
        {canAdd && !selectedIsPast && (
          <TouchableOpacity
            style={[styles.primaryButton, styles.startButton]}
            onPress={() => setForm({ editing: null, date: notInPast(atHourOf(selectedDay), Date.now()) })}
            accessibilityRole='button'
          >
            <Text style={styles.primaryButtonText}>{source.asTrainer ? "Suggest on this day" : "Schedule on this day"}</Text>
          </TouchableOpacity>
        )}
      </ModalSheet>

      {form && (
        <ScheduleForm
          key={form.editing?.id ?? "new"}
          initial={form}
          source={source}
          days={days}
          onClose={() => setForm(null)}
          onError={(message) => alert("Schedule", message, [{ text: "OK" }], "error")}
          alert={alert}
        />
      )}
      {AlertComponent}
    </View>
  );
}

const nextHour = (): Date => {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d;
};

const atHourOf = (day: Date): Date => {
  const d = new Date(day);
  d.setHours(18, 0, 0, 0);
  return d;
};

function ScheduleForm({
  initial,
  source,
  days,
  onClose,
  onError,
  alert,
}: {
  readonly initial: FormState;
  readonly source: Source;
  readonly days: { dayNumber: number; dayTitle?: string }[];
  readonly onClose: () => void;
  readonly onError: (message: string) => void;
  readonly alert: UseAlertReturn["alert"];
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { editing } = initial;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [when, setWhen] = useState(initial.date);
  const [programDay, setProgramDay] = useState<number | null>(editing?.programDay ?? null);
  const [durationMin, setDurationMin] = useState(editing?.durationMin ?? 60);
  const initialReminder = editing ? editing.reminderMinutes : 60;
  const initialCustom =
    initialReminder != null &&
    !REMINDERS.some((r) => r.minutes === initialReminder);
  const [reminderPreset, setReminderPreset] = useState<number | null>(
    initialReminder,
  );
  const [customReminder, setCustomReminder] = useState(initialCustom);
  const [customAmount, setCustomAmount] = useState(() =>
    initialCustom ? String(splitReminder(initialReminder ?? 0).amount) : "3",
  );
  const [customUnit, setCustomUnit] = useState(() =>
    initialCustom ? splitReminder(initialReminder ?? 0).unit : 60,
  );
  const [alarm, setAlarm] = useState(editing?.alarm ?? false);
  const [calendarSync, setCalendarSyncState] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void isCalendarSyncEnabled().then(setCalendarSyncState);
  }, []);

  // A trainer may only change their own suggestions. A client may edit what their trainer suggested.
  const readOnly = source.asTrainer && editing != null && editing.scheduledBy == null;
  const dayTitle = (n: number) => days.find((d) => d.dayNumber === n)?.dayTitle;

  const now = Date.now();
  const timeChanged =
    editing == null ||
    when.toISOString() !== new Date(editing.startAt).toISOString();
  const inPast = timeChanged && when.getTime() <= now;

  const reminderMinutes = customReminder
    ? Number(customAmount) * customUnit
    : reminderPreset;
  const reminderInvalid =
    customReminder &&
    !(
      Number(customAmount) >= 1 &&
      Number(customAmount) * customUnit <= MAX_REMINDER_MINUTES
    );

  const openDate = () =>
    DateTimePickerAndroid.open({
      value: when,
      mode: "date",
      minimumDate: new Date(),
      onValueChange: (_event, date) => {
        const next = new Date(date);
        next.setHours(when.getHours(), when.getMinutes(), 0, 0);
        setWhen(notInPast(next, Date.now()));
      },
    });

  const openTime = () =>
    DateTimePickerAndroid.open({
      value: when,
      mode: "time",
      is24Hour: true,
      display: "clock",
      onValueChange: (_event, time) => {
        const next = new Date(when);
        next.setHours(time.getHours(), time.getMinutes(), 0, 0);
        setWhen(next);
      },
    });

  const selectAlarm = (ring: boolean) => {
    setAlarm(ring);
    if (ring && !source.asTrainer) void promptForAlarmPermissions(alert);
  };

  const toggleCalendar = async (enabled: boolean) => {
    if (await setCalendarSync(enabled)) setCalendarSyncState(enabled);
    else onError("OwnGains needs calendar access to add your workouts to your calendar.");
  };

  const save = async () => {
    if (inPast) {
      onError("Pick a time that hasn't passed yet.");
      return;
    }
    if (reminderInvalid) {
      onError(
        "A custom reminder can be 1 minute to 7 days before the workout.",
      );
      return;
    }
    const params: ScheduleParams = {
      title: title.trim() || (programDay != null ? dayTitle(programDay) : undefined) || "Workout",
      startAt: when.toISOString(),
      programDay,
      durationMin,
      reminderMinutes,
      alarm,
    };
    setSaving(true);
    try {
      if (!source.asTrainer && reminderMinutes != null) await initializeSupplementNotifications(true);
      if (editing) await source.update(editing.id, params);
      else await source.create(params);
      onClose();
    } catch (error) {
      onError(userFacingError(error, "Could not save the workout."));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    try {
      await source.remove(editing.id);
      onClose();
    } catch (error) {
      onError(userFacingError(error, "Could not remove the workout."));
    }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, a11y = label) => (
    <TouchableOpacity
      key={label}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      disabled={readOnly}
      accessibilityRole='button'
      accessibilityState={{ selected }}
      accessibilityLabel={a11y}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  let removeLabel = "Delete";
  if (source.asTrainer) removeLabel = editing?.status === "accepted" ? "Cancel" : "Withdraw suggestion";
  let saveLabel = editing ? "Save" : "Schedule";
  if (source.asTrainer && !editing) saveLabel = "Suggest";

  return (
    <ModalSheet
      visible
      onClose={onClose}
      title={editing ? "Planned workout" : source.asTrainer ? "Suggest a workout" : "Schedule a workout"}
      subtitle={source.asTrainer ? "Your client gets it as a suggestion to accept." : undefined}
      confirmText={saveLabel}
      onConfirm={() => void save()}
      showConfirmButton={!readOnly}
      confirmDisabled={saving || inPast || reminderInvalid}
      scrollable
      fullHeight
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        editable={!readOnly}
        maxLength={100}
        placeholder={programDay != null ? (dayTitle(programDay) ?? "Workout") : "Workout"}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel='Workout name'
      />

      <Text style={styles.label}>When</Text>
      <View style={styles.whenRow}>
        <TouchableOpacity
          style={[styles.whenButton, inPast && styles.whenButtonError]}
          onPress={openDate}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={`Date, ${formatDay(when)}. Change`}
        >
          <Text style={styles.whenCaption}>📅 Date</Text>
          <Text style={styles.whenValue}>{formatDay(when)}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.whenButton, inPast && styles.whenButtonError]}
          onPress={openTime}
          disabled={readOnly}
          accessibilityRole="button"
          accessibilityLabel={`Time, ${formatTime(when)}. Change`}
        >
          <Text style={styles.whenCaption}>🕒 Time</Text>
          <Text style={styles.whenValue}>{formatTime(when)}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.whenMeta, inPast && styles.whenMetaError]}>
        {inPast
          ? "This time has passed. Pick a later one."
          : `${formatTime(when)} to ${formatTime(new Date(when.getTime() + durationMin * 60_000))}`}
      </Text>

      {days.length > 0 && (
        <>
          <Text style={styles.label}>Program day</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {chip("None", programDay == null, () => setProgramDay(null), "No program day")}
            {days.map((d) =>
              chip(
                d.dayTitle ? `Day ${d.dayNumber} · ${d.dayTitle}` : `Day ${d.dayNumber}`,
                programDay === d.dayNumber,
                () => setProgramDay(d.dayNumber),
              ),
            )}
          </ScrollView>
        </>
      )}

      <Text style={styles.label}>Duration</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {DURATIONS.map((m) => chip(`${m} min`, durationMin === m, () => setDurationMin(m)))}
      </ScrollView>

      <Text style={styles.label}>Reminder</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {REMINDERS.map((r) =>
          chip(
            r.minutes == null ? r.label : `${r.label} before`,
            !customReminder && reminderPreset === r.minutes,
            () => {
              setCustomReminder(false);
              setReminderPreset(r.minutes);
            },
            `Reminder: ${r.label}`,
          ),
        )}
        {chip(
          "Custom",
          customReminder,
          () => setCustomReminder(true),
          "Custom reminder",
        )}
      </ScrollView>
      {customReminder && (
        <View style={styles.customRow}>
          <TextInput
            style={[
              styles.input,
              styles.customInput,
              reminderInvalid && styles.inputError,
            ]}
            value={customAmount}
            onChangeText={(t) => setCustomAmount(t.replaceAll(/\D/g, ""))}
            editable={!readOnly}
            keyboardType="number-pad"
            maxLength={5}
            accessibilityLabel="Custom reminder amount"
          />
          {REMINDER_UNITS.map((u) =>
            chip(u.label, customUnit === u.minutes, () =>
              setCustomUnit(u.minutes),
            ),
          )}
          <Text style={styles.customSuffix}>before</Text>
        </View>
      )}

      {alarmsAvailable && reminderMinutes != null && (
        <>
          <Text style={styles.label}>Notification type</Text>
          <View style={styles.typeRow}>
            {ALERT_TYPES.map((t) => {
              const selected = alarm === t.alarm;
              return (
                <TouchableOpacity
                  key={t.label}
                  style={[
                    styles.typeOption,
                    selected && styles.typeOptionActive,
                  ]}
                  onPress={() => selectAlarm(t.alarm)}
                  disabled={readOnly}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${t.label}, ${t.desc}`}
                >
                  <Text style={styles.typeIcon}>{t.icon}</Text>
                  <Text
                    style={[
                      styles.typeLabel,
                      selected && styles.typeLabelActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                  <Text style={styles.typeDesc}>{t.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
      {!source.asTrainer && (
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Add to my calendar</Text>
          <Switch
            value={calendarSync}
            onValueChange={(v) => void toggleCalendar(v)}
            accessibilityLabel='Add scheduled workouts to my calendar'
          />
        </View>
      )}

      {editing && !readOnly && (
        <TouchableOpacity
          style={[styles.secondaryButton, styles.removeButton]}
          onPress={() => void remove()}
          accessibilityRole='button'
          accessibilityLabel={removeLabel === "Cancel" ? "Cancel this workout" : removeLabel}
        >
          <Text style={styles.removeText}>{removeLabel}</Text>
        </TouchableOpacity>
      )}
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    muted: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
    entry: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    entryHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    entryWhen: { fontSize: 13, fontWeight: "700", color: colors.accent },
    entryTitle: { fontSize: 15, fontWeight: "600", color: colors.textPrimary, marginTop: 2 },
    pendingTag: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.warning,
      backgroundColor: colors.warningLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: "hidden",
    },
    cancelledTag: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.error,
      backgroundColor: colors.errorLight,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: "hidden",
    },
    actions: { flexDirection: "row", gap: 8, marginTop: 10 },
    primaryButton: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.accent,
    },
    primaryButtonText: { color: colors.textOnAccent, fontWeight: "700", fontSize: 14 },
    secondaryButton: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    secondaryButtonText: { color: colors.textPrimary, fontWeight: "600", fontSize: 14 },
    startButton: { marginTop: 10, flex: 0 },
    dayHeading: { fontSize: 15, fontWeight: "700", color: colors.textPrimary, marginTop: 16 },
    label: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginTop: 20,
      marginBottom: 8,
    },
    whenRow: { flexDirection: "row", gap: 10 },
    whenButton: {
      flex: 1,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    whenButtonError: { borderColor: colors.error },
    whenCaption: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
    whenValue: {
      fontSize: 20,
      fontWeight: "700",
      color: colors.textPrimary,
      marginTop: 4,
      fontVariant: ["tabular-nums"],
    },
    whenMeta: { fontSize: 12, color: colors.textMuted, marginTop: 6 },
    whenMetaError: { color: colors.error, fontWeight: "600" },
    customRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 10,
    },
    customInput: { width: 64, textAlign: "center" },
    inputError: { borderColor: colors.error },
    customSuffix: { fontSize: 13, color: colors.textSecondary },
    typeRow: { flexDirection: "row", gap: 12 },
    typeOption: {
      flex: 1,
      backgroundColor: colors.inputBackground,
      borderRadius: 12,
      padding: 14,
      alignItems: "center",
      borderWidth: 2,
      borderColor: colors.inputBorder,
    },
    typeOptionActive: {
      backgroundColor: colors.infoLight,
      borderColor: colors.accent,
    },
    typeIcon: { fontSize: 28, marginBottom: 6 },
    typeLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.textSecondary,
      marginBottom: 3,
    },
    typeLabelActive: { color: colors.accent },
    typeDesc: { fontSize: 11, color: colors.textMuted, textAlign: "center" },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      color: colors.textPrimary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    chips: { flexDirection: "row", gap: 8 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
    chipText: { fontSize: 13, color: colors.textPrimary },
    chipTextSelected: { color: colors.textOnAccent, fontWeight: "700" },
    switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 },
    switchLabel: { fontSize: 15, color: colors.textPrimary },
    removeButton: { marginTop: 20, borderColor: colors.error, flex: 0 },
    removeText: { color: colors.error, fontWeight: "700", fontSize: 14 },
  });
