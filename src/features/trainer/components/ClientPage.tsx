import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { Avatar } from "@shared/components/Avatar";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { reportAndReturn } from "@shared/services/crashReporting";
import { userFacingError } from "@shared/services/apiError";
import { useMessages } from "@features/messages/MessagesContext";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import ScheduleWidget from "@features/schedule/ScheduleWidget";
import { sharingApi } from "@features/friends/services";
import { programSplits } from "@features/friends/utils";
import { makeProgramApi } from "@features/plan/services/programApiFactory";
import { traineeFetch } from "@shared/services/traineeFetch";
import { PERMISSION_GROUPS, PERMISSION_TYPES } from "@features/friends/components/FriendPermissions";
import { PermissionRow } from "@features/friends/components/PermissionRow";
import type { PermissionType, SessionRecord } from "@features/friends/types";
import SessionDetailsSheet, {
  loadFriendSessionDetails,
} from "@features/friends/components/SessionDetailsSheet";
import { sessionTitle } from "@shared/components/SessionDetails";
import { dayLabel } from "@utils/dayCarryOver";
import { formatDate, toDateString } from "@utils/format";
import { EMPTY_WORKOUT_TITLE } from "@features/workout/utils";
import type { ClientSummary } from "../types";
import type { CustomWorkout, DayChoice } from "../utils/sessionStart";
import { sessionOrigin } from "../utils/roster";
import { clientStatusLine } from "./ClientRow";
import { getDeviceKey, safetyCode } from "../utils/trackingCrypto";


interface ClientPageProps {
  readonly client: ClientSummary | null;
  readonly trainerId: string;
  readonly now: Date;
  readonly onClose: () => void;
  /** Called with null to run the client's own plan, on `split` when given. */
  readonly onStartSession: (client: ClientSummary, start: CustomWorkout | null, split?: string) => void;
  readonly dayChoices: readonly DayChoice[];
  readonly splitChoices: readonly string[];
  readonly onSendProgram: (client: ClientSummary, splits: string[]) => void;
  readonly onEditProgram: (client: ClientSummary) => void;
  readonly onRemoveClient: (client: ClientSummary) => void;
  readonly onAskTracking: (client: ClientSummary) => void;
  readonly onError: (message: string) => void;
}

export default function ClientPage({
  client,
  trainerId,
  now,
  onClose,
  onStartSession,
  dayChoices,
  splitChoices,
  onSendProgram,
  onEditProgram,
  onRemoveClient,
  onAskTracking,
  onError,
}: ClientPageProps): React.JSX.Element {
  const { available: messagesAvailable, openConversation } = useMessages();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [selected, setSelected] = useState<SessionRecord | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [picking, setPicking] = useState<"root" | "mine" | "client" | null>(null);
  const [clientSplits, setClientSplits] = useState<string[]>([]);
  const [sendSplits, setSendSplits] = useState<string[] | null>(null);
  const [ownCode, setOwnCode] = useState<string | null>(null);
  const [granted, setGranted] = useState<PermissionType[] | null>(null);
  const clientIdRef = useRef<string | null>(null);
  clientIdRef.current = client?.userId ?? null;

  useEffect(() => {
    setSessions(null);
    setSelected(null);
    setSelectedDate(null);
    setPicking(null);
    setSendSplits(null);
    setClientSplits([]);
    setGranted(null);
    if (!client) return;
    let active = true;
    void sharingApi
      .getReceivedPermissions()
      .then((all) =>
        all.filter((p) => String(p.fromUserId) === client.userId).map((p) => p.permissionType),
      )
      .catch(reportAndReturn([] as PermissionType[], { stage: "clientPermissions" }))
      .then((types) => {
        if (active) setGranted(types);
      });
    if (client.hasTrackingAccess) {
      void getDeviceKey().then((k) => {
        if (active) setOwnCode(safetyCode([k.publicKey]));
      });
    }
    void makeProgramApi(traineeFetch(client.userId))
      .fetchSavedProgram()
      .then((program) => (program?.days?.length ? programSplits(program) : []))
      .catch(reportAndReturn([] as string[], { stage: "clientProgram" }))
      .then((splits) => {
        if (active) setClientSplits(splits);
      });
    void sharingApi
      .getFriendSessions(client.userId)
      .then((rows) => rows as SessionRecord[])
      .catch(reportAndReturn([] as SessionRecord[], { stage: "clientSessions" }))
      .then((rows) => {
        if (active) setSessions(rows);
      });
    return () => {
      active = false;
    };
  }, [client]);

  const openSession = async (session: SessionRecord) => {
    if (!client) return;
    const { userId } = client;
    try {
      const details = await loadFriendSessionDetails(userId, session.id);
      if (clientIdRef.current === userId) setSelected(details);
    } catch (error) {
      const message = userFacingError(error, "Couldn't load that session.");
      if (clientIdRef.current === userId) onError(message);
    }
  };

  if (!client) return <ModalSheet visible={false} onClose={onClose} />;

  const choiceRow = (label: string, hint: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity
      key={label}
      style={[styles.pickerRow, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.sessionTitle}>{label}</Text>
        <Text style={styles.line}>{hint}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );

  const sessionsOn = (date: string) =>
    (sessions ?? []).filter((s) => s.startTime !== undefined && toDateString(new Date(s.startTime)) === date);
  const onDatePress = (date: Date) => {
    const onDay = sessionsOn(toDateString(date));
    if (onDay.length === 1) void openSession(onDay[0]);
    setSelectedDate(onDay.length > 1 ? toDateString(date) : null);
  };
  const isGranted = (type: PermissionType) => granted?.includes(type) ?? false;

  return (
    <>
      <ModalSheet
        visible={selected === null}
        onClose={onClose}
        title={client.username}
        fullHeight
        scrollable
      >
        <View style={styles.header}>
          <Avatar name={client.username} size={48} style={styles.avatar} textStyle={styles.initial} />
          <View style={{ flex: 1 }}>
            <Text style={styles.line}>{clientStatusLine(client, now)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.primary}
          onPress={() => {
            setSendSplits(null);
            setPicking((p) => (p ? null : "root"));
          }}
          accessibilityRole="button"
          accessibilityLabel={picking ? "Cancel starting a session" : `Start a session for ${client.username}`}
        >
          <Text style={styles.primaryText}>{picking ? "Cancel" : "Start session"}</Text>
        </TouchableOpacity>

        {picking && (
          <View style={styles.picker}>
            {picking === "root" ? (
              <>
                <Text style={styles.pickerTitle}>Start which workout?</Text>
                {choiceRow(
                  `${client.username}'s program`,
                  clientSplits.length > 0 ? "Pick one of their splits" : "Run their current plan",
                  () => (clientSplits.length > 0 ? setPicking("client") : onStartSession(client, null)),
                )}
                {choiceRow(
                  "My program",
                  dayChoices.length > 0 ? "Pick one of your days" : "Load a program of your own first",
                  () => setPicking("mine"),
                  dayChoices.length === 0,
                )}
                {choiceRow(EMPTY_WORKOUT_TITLE, "Add exercises as you go", () =>
                  onStartSession(client, { dayTitle: EMPTY_WORKOUT_TITLE, exercises: [] }),
                )}
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.pickerBack}
                  onPress={() => setPicking("root")}
                  accessibilityRole="button"
                  accessibilityLabel="Back to workout choices"
                >
                  <Text style={styles.pickerTitle}>
                    {picking === "mine" ? "‹ My program" : `‹ ${client.username}'s program`}
                  </Text>
                </TouchableOpacity>
                {picking === "mine"
                  ? dayChoices.map((d) =>
                      choiceRow(d.label, `${d.start.exercises.length} exercises`, () =>
                        onStartSession(client, d.start),
                      ),
                    )
                  : clientSplits.map((split) =>
                      choiceRow(split, "Run this split", () => onStartSession(client, null, split)),
                    )}
              </>
            )}
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => {
              setPicking(null);
              if (splitChoices.length > 1) setSendSplits((s) => (s ? null : [...splitChoices]));
              else onSendProgram(client, [...splitChoices]);
            }}
            accessibilityRole="button"
            accessibilityLabel={sendSplits ? "Cancel sending your program" : `Send ${client.username} your program`}
          >
            <Text style={styles.secondaryText}>{sendSplits ? "Cancel" : "Send program"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondary}
            onPress={() => onEditProgram(client)}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${client.username}'s program`}
          >
            <Text style={styles.secondaryText}>Edit program</Text>
          </TouchableOpacity>
          {messagesAvailable && (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => openConversation({ userUuid: client.userId, username: client.username })}
              accessibilityRole="button"
              accessibilityLabel={`Message ${client.username}`}
            >
              <Text style={styles.secondaryText}>💬 Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {sendSplits && (
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>Send which splits?</Text>
            {splitChoices.map((name) => {
              const checked = sendSplits.includes(name);
              return (
                <TouchableOpacity
                  key={name}
                  style={styles.pickerRow}
                  onPress={() =>
                    setSendSplits((s) => (checked ? s!.filter((n) => n !== name) : [...s!, name]))
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={name}
                >
                  <Text style={styles.sessionTitle}>{`${checked ? "☑" : "☐"} ${name}`}</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.primary, styles.sendSplits, sendSplits.length === 0 && { opacity: 0.5 }]}
              disabled={sendSplits.length === 0}
              onPress={() => {
                onSendProgram(client, splitChoices.filter((n) => sendSplits.includes(n)));
                setSendSplits(null);
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled: sendSplits.length === 0 }}
              accessibilityLabel={`Send ${sendSplits.length} split${sendSplits.length === 1 ? "" : "s"} to ${client.username}`}
            >
              <Text style={styles.primaryText}>
                {`Send ${sendSplits.length} split${sendSplits.length === 1 ? "" : "s"}`}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.section}>Schedule</Text>
        <ScheduleWidget client={client} />

        <Text style={styles.section}>Recent sessions</Text>
        {sessions === null && <ActivityIndicator color={colors.accent} accessibilityLabel="Loading sessions" />}
        {sessions?.length === 0 && <Text style={styles.line}>No sessions yet</Text>}
        {sessions !== null && sessions.length > 0 && (
          <UniversalCalendar
            hasDataOnDate={(date) => sessionsOn(toDateString(date)).length > 0}
            onDatePress={onDatePress}
            legendText="Workout day"
          />
        )}
        {selectedDate !== null && sessionsOn(selectedDate).map((s) => {
          const tag = sessionOrigin(s, trainerId) === "with_you" ? "with you" : "on their own";
          const title = sessionTitle(s) || dayLabel(s.dayNumber);
          return (
            <TouchableOpacity
              key={String(s.id)}
              style={styles.session}
              onPress={() => void openSession(s)}
              accessibilityRole="button"
              accessibilityLabel={`${title}, ${tag}. Open details`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.sessionTitle}>{title}</Text>
                {s.startTime !== undefined && (
                  <Text style={styles.line}>{formatDate(new Date(s.startTime))}</Text>
                )}
              </View>
              <Text style={styles.tag}>{tag}</Text>
            </TouchableOpacity>
          );
        })}

        <Text style={styles.section}>Permissions</Text>
        {granted === null ? (
          <ActivityIndicator color={colors.accent} accessibilityLabel="Loading permissions" />
        ) : (
          PERMISSION_GROUPS.map(({ label, types }) => (
            <React.Fragment key={label}>
              <Text style={styles.groupLabel}>{label}</Text>
              {PERMISSION_TYPES.filter((p) => types.includes(p.type)).map(({ type, icon, title, receivedTitle }) => (
                <View
                  key={type}
                  accessible
                  accessibilityLabel={`${receivedTitle ?? title}, ${isGranted(type) ? "granted" : "not granted"}`}
                >
                  <PermissionRow
                    icon={icon}
                    title={receivedTitle ?? title}
                    description={
                      isGranted(type)
                        ? `${client.username} has granted you this.`
                        : `${client.username} hasn't granted you this.`
                    }
                    granted={isGranted(type)}
                    readOnly
                  />
                </View>
              ))}
            </React.Fragment>
          ))
        )}

        {!client.hasTrackingAccess ? (
          <TouchableOpacity
            style={styles.session}
            onPress={() => onAskTracking(client)}
            accessibilityRole="button"
            accessibilityLabel={`Ask ${client.username} for Tracking Access`}
          >
            <Text style={styles.link}>Ask for Tracking Access</Text>
          </TouchableOpacity>
        ) : (
          ownCode && (
            <Text style={[styles.line, styles.legend]}>
              {`Safety code ${ownCode}. ${client.username} sees it under your Tracking Access in Friends. If it matches, only this phone can read their data. Their tracking is in the Track tab.`}
            </Text>
          )
        )}

        <TouchableOpacity
          style={styles.remove}
          onPress={() => onRemoveClient(client)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${client.username} as a client`}
        >
          <Text style={styles.removeText}>Remove client</Text>
        </TouchableOpacity>
      </ModalSheet>
      <SessionDetailsSheet
        session={selected}
        visible={selected !== null}
        onClose={() => setSelected(null)}
      />
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    avatar: { backgroundColor: colors.accentLight },
    initial: { color: colors.accentDark },
    line: { color: colors.textSecondary, fontSize: 13 },
    actions: { flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 16 },
    primary: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      backgroundColor: colors.accent,
    },
    primaryText: { color: colors.textOnAccent, fontWeight: "600" },
    secondary: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    sendSplits: { margin: 12 },
    picker: {
      marginTop: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.accent,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: colors.surface,
    },
    pickerTitle: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      color: colors.accentDark,
      backgroundColor: colors.accentLight,
      fontSize: 13,
      fontWeight: "700",
    },
    pickerRow: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
    pickerBack: { minHeight: 48, justifyContent: "center", backgroundColor: colors.accentLight },
    chevron: { color: colors.accent, fontSize: 22, fontWeight: "600" },
    secondaryText: { color: colors.accent, fontWeight: "600" },
    section: {
      color: colors.textPrimary,
      fontSize: 15,
      fontWeight: "700",
      marginTop: 12,
      marginBottom: 8,
    },
    legend: { marginTop: 6 },
    link: { color: colors.accent, fontWeight: "600" },
    groupLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "600", marginTop: 6, marginBottom: 8 },
    remove: { minHeight: 48, alignItems: "center", justifyContent: "center", marginTop: 24 },
    removeText: { color: colors.error, fontWeight: "600" },
    session: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    sessionTitle: { color: colors.textPrimary, fontSize: 15 },
    tag: { color: colors.textMuted, fontSize: 12 },
  });
