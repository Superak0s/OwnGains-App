import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import { generateId } from "@utils/format";
import { userFacingError } from "@shared/services/apiError";
import { reportAndReturn } from "@shared/services/crashReporting";
import { messagesApi } from "./services";
import { canEdit, clockLabel, dayLabel, markMineRead, mergeMessages, sameRun } from "./utils/conversation";
import { Avatar, BackButton, SendIcon } from "./parts";
import { relationLabel } from "./MessagesListScreen";
import { threadEvents } from "./threadEvents";
import type { Message, Peer, Relation } from "./types";

/** Longest message the server accepts. */
export const MAX_MESSAGE_LENGTH = 2000;

interface ConversationScreenProps {
  readonly peer: Peer;
  readonly relation: Relation;
  readonly onBack: () => void;
  readonly onRead: (userUuid: string) => void;
  readonly onSent: (peer: Peer, message: Message) => void;
  /** A sent message was edited or deleted, so the conversation list may show a stale last message. */
  readonly onChanged: () => void;
}

export default function ConversationScreen({
  peer,
  relation,
  onBack,
  onRead,
  onSent,
  onChanged,
}: ConversationScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [canSend, setCanSend] = useState(true);
  const [hasOlder, setHasOlder] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [editing, setEditing] = useState<Message | null>(null);
  const { alert, AlertComponent } = useAlert();
  // One key per draft, so a retried send after a dropped response is stored once.
  const sendKeyRef = useRef(generateId("idem"));
  const loadingOlderRef = useRef(false);

  const markRead = useCallback(() => {
    onRead(peer.userUuid);
    void messagesApi.markRead(peer.userUuid).catch(reportAndReturn(undefined, { stage: "messagesMarkRead" }));
  }, [peer.userUuid, onRead]);

  useEffect(() => {
    let current = true;
    setMessages(null);
    setError(null);
    messagesApi
      .getThread(peer.userUuid)
      .then((thread) => {
        if (!current) return;
        setMessages(thread.messages);
        setCanSend(thread.canSend);
        setHasOlder(thread.messages.length > 0);
        markRead();
      })
      .catch((e: unknown) => {
        if (current) {
          setMessages([]);
          setError(userFacingError(e, "Couldn't load the conversation."));
        }
      });
    return () => {
      current = false;
    };
  }, [peer.userUuid, markRead]);

  useEffect(
    () =>
      threadEvents.subscribe((e) => {
        if (e.type === "new" && e.fromUuid === peer.userUuid) {
          setMessages((list) => mergeMessages(list ?? [], [e.message]));
          markRead();
        } else if (e.type === "edited" && e.fromUuid === peer.userUuid) {
          setMessages((list) => list && list.map((m) => (m.id === e.message.id ? e.message : m)));
        } else if (e.type === "deleted" && e.fromUuid === peer.userUuid) {
          setMessages((list) => list && list.filter((m) => m.id !== e.messageId));
        } else if (e.type === "read" && e.byUuid === peer.userUuid) {
          setMessages((list) => list && markMineRead(list, e.readAt));
        }
      }),
    [peer.userUuid, markRead],
  );

  // The sheet's modal draws under a translucent status bar, so Android doesn't resize it for the keyboard.
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const loadOlder = useCallback(async () => {
    const oldest = messages?.at(-1);
    if (!oldest || !hasOlder || loadingOlderRef.current) return;
    loadingOlderRef.current = true;
    try {
      const page = await messagesApi.getThread(peer.userUuid, oldest.id);
      setHasOlder(page.messages.length > 0);
      setMessages((list) => mergeMessages(list ?? [], page.messages));
    } catch (e) {
      // Scrolling to the top again retries.
      reportAndReturn(undefined, { stage: "messagesLoadOlder" })(e);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [messages, hasOlder, peer.userUuid]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      if (editing) {
        const edited = await messagesApi.editMessage(peer.userUuid, editing.id, body);
        setEditing(null);
        setDraft("");
        setMessages((list) => list && list.map((m) => (m.id === edited.id ? edited : m)));
        onChanged();
        return;
      }
      const message = await messagesApi.sendMessage(peer.userUuid, body, sendKeyRef.current);
      sendKeyRef.current = generateId("idem");
      setDraft("");
      setMessages((list) => mergeMessages(list ?? [], [message]));
      onSent(peer, message);
    } catch (e) {
      setError(userFacingError(e, editing ? "Couldn't edit the message." : "Couldn't send the message."));
    } finally {
      setSending(false);
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setDraft("");
  };

  const remove = async (message: Message) => {
    setError(null);
    try {
      await messagesApi.deleteMessage(peer.userUuid, message.id);
      setMessages((list) => list && list.filter((m) => m.id !== message.id));
      if (editing?.id === message.id) cancelEdit();
      onChanged();
    } catch (e) {
      setError(userFacingError(e, "Couldn't delete the message."));
    }
  };

  const showOptions = (message: Message) =>
    alert(
      "Message",
      canEdit(message) ? "" : "Messages can be edited for 15 minutes after sending.",
      [
        ...(canEdit(message)
          ? [
              {
                text: "Edit",
                onPress: () => {
                  setEditing(message);
                  setDraft(message.body);
                },
              },
            ]
          : []),
        { text: "Delete", style: "destructive" as const, onPress: () => void remove(message) },
        { text: "Cancel", style: "cancel" as const },
      ],
    );

  const label = relationLabel(relation);

  const renderItem = ({ item, index }: { item: Message; index: number }) => {
    // Newest first, so the older neighbour is the next item and the newer one the previous.
    const older = messages?.[index + 1];
    const newer = messages?.[index - 1];
    const newDay = !older || dayLabel(older.createdAt) !== dayLabel(item.createdAt);
    const runStart = !sameRun(item, older);
    const runEnd = !sameRun(item, newer);
    return (
      <View>
        {newDay && (
          <View style={styles.dayChip}>
            <Text style={styles.dayText}>{dayLabel(item.createdAt)}</Text>
          </View>
        )}
        <View style={[styles.bubbleRow, item.fromMe && styles.bubbleRowMine, runStart && styles.runStart]}>
          <Pressable
            onLongPress={item.fromMe && canSend ? () => showOptions(item) : undefined}
            accessibilityHint={item.fromMe && canSend ? "Long press to edit or delete" : undefined}
            style={[
              styles.bubble,
              item.fromMe ? styles.bubbleMine : styles.bubbleTheirs,
              runEnd && (item.fromMe ? styles.tailMine : styles.tailTheirs),
            ]}
            accessible
            accessibilityLabel={`${item.fromMe ? "You" : peer.username}, ${clockLabel(item.createdAt)}${
              item.fromMe && item.readAt ? ", seen" : ""
            }${item.editedAt ? ", edited" : ""}: ${item.body}`}
          >
            <Text style={item.fromMe ? styles.textMine : styles.textTheirs}>
              {item.body}
            </Text>
            <View style={styles.meta}>
              {item.editedAt && <Text style={[styles.time, item.fromMe && styles.timeMine]}>edited</Text>}
              <Text style={[styles.time, item.fromMe && styles.timeMine]}>{clockLabel(item.createdAt)}</Text>
              {item.fromMe && (
                <Text style={[styles.ticks, item.readAt ? styles.ticksRead : styles.timeMine]}>
                  {item.readAt ? "✓✓" : "✓"}
                </Text>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, Platform.OS === "android" && { paddingBottom: keyboardHeight }]}>
      <View style={styles.header}>
        <BackButton color={colors.textPrimary} label="Back to messages" onPress={onBack} />
        <Avatar name={peer.username} size={40} />
        <View style={styles.titleWrap}>
          <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
            {peer.username}
          </Text>
          {label && <Text style={styles.subtitle}>{label}</Text>}
        </View>
      </View>

      {messages === null ? (
        <ActivityIndicator style={styles.fill} color={colors.accent} accessibilityLabel="Loading messages" />
      ) : messages.length === 0 ? (
        <View style={[styles.fill, styles.empty]}>
          <Avatar name={peer.username} size={72} />
          <Text style={styles.emptyTitle}>{peer.username}</Text>
          <Text style={styles.emptyText}>No messages yet. Say hi 👋</Text>
        </View>
      ) : (
        <FlatList
          style={styles.fill}
          inverted
          data={messages}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.list}
        />
      )}

      {error && <Text style={styles.error}>{error}</Text>}
      {canSend && editing && (
        <View style={styles.editBar}>
          <Text style={styles.editText}>Editing message</Text>
          <TouchableOpacity onPress={cancelEdit} accessibilityRole="button" accessibilityLabel="Cancel editing">
            <Text style={styles.editCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}
      {canSend ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Message"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            accessibilityLabel={`Message ${peer.username}`}
          />
          <TouchableOpacity
            style={[styles.send, !draft.trim() && styles.sendDisabled]}
            onPress={() => void send()}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel={editing ? "Save edited message" : "Send message"}
            accessibilityState={{ disabled: !draft.trim() || sending, busy: sending }}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.textOnAccent} />
            ) : (
              <SendIcon color={colors.textOnAccent} />
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.closed}>
          You can read this conversation, but you are no longer friends or trainer and client, so you can't reply.
        </Text>
      )}
      {AlertComponent}
    </SafeAreaView>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.separator,
    },
    titleWrap: { flex: 1 },
    title: { color: colors.textPrimary, fontSize: 17, fontWeight: "700" },
    subtitle: { color: colors.info, fontSize: 12, fontWeight: "600" },
    fill: { flex: 1 },
    list: { paddingHorizontal: 10, paddingVertical: 8 },
    empty: { alignItems: "center", justifyContent: "center", gap: 8, padding: 32 },
    emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
    emptyText: { color: colors.textMuted, fontSize: 14 },
    dayChip: {
      alignSelf: "center",
      marginVertical: 10,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: colors.surface,
    },
    dayText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
    bubbleRow: { flexDirection: "row", marginTop: 2 },
    bubbleRowMine: { justifyContent: "flex-end" },
    runStart: { marginTop: 8 },
    bubble: {
      maxWidth: "80%",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      columnGap: 8,
      borderRadius: 18,
      paddingLeft: 12,
      paddingRight: 10,
      paddingVertical: 7,
    },
    bubbleMine: { backgroundColor: colors.accent },
    bubbleTheirs: { backgroundColor: colors.surface },
    tailMine: { borderBottomRightRadius: 4 },
    tailTheirs: { borderBottomLeftRadius: 4 },
    textMine: { flexShrink: 1, color: colors.textOnAccent, fontSize: 15, lineHeight: 20 },
    textTheirs: { flexShrink: 1, color: colors.textPrimary, fontSize: 15, lineHeight: 20 },
    meta: { marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 3 },
    time: { fontSize: 11, color: colors.textMuted },
    timeMine: { color: colors.textOnAccent, opacity: 0.75 },
    ticks: { fontSize: 11, fontWeight: "700", letterSpacing: -3, paddingRight: 3 },
    ticksRead: { color: colors.textOnAccent },
    error: { paddingHorizontal: 16, paddingBottom: 4, color: colors.error },
    editBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 6,
    },
    editText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
    editCancel: { color: colors.accent, fontSize: 13, fontWeight: "600" },
    composer: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 8 },
    input: {
      flex: 1,
      maxHeight: 120,
      minHeight: 44,
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 22,
      backgroundColor: colors.surface,
      color: colors.textPrimary,
      fontSize: 15,
    },
    send: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    sendDisabled: { opacity: 0.4 },
    closed: { padding: 16, textAlign: "center", color: colors.textMuted },
  });
