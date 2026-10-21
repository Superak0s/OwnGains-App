import React, { useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useAlert } from "@shared/components/CustomAlert";
import { EmptyState } from "@shared/components/ui";
import { userFacingError } from "@shared/services/apiError";
import { friendsApi } from "@features/friends/services";
import ReportUserSheet from "@features/friends/components/ReportUserSheet";
import type { UserRef } from "@features/friends/types";
import { Avatar, BackButton } from "./parts";
import { listTimeLabel } from "./utils/conversation";
import type { Conversation, Relation } from "./types";

interface MessagesListScreenProps {
  readonly conversations: readonly Conversation[];
  readonly onOpen: (conversation: Conversation) => void;
  readonly onClose: () => void;
  readonly onRefresh: () => Promise<void>;
}

export const relationLabel = (relation: Relation): string | null =>
  relation === "trainer" ? "Trainer" : relation === "client" ? "Client" : null;

export default function MessagesListScreen({
  conversations,
  onOpen,
  onClose,
  onRefresh,
}: MessagesListScreenProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [refreshing, setRefreshing] = useState(false);
  const [reportTarget, setReportTarget] = useState<UserRef | null>(null);
  const { alert, AlertComponent } = useAlert();

  const block = (c: Conversation): void =>
    alert(
      "Block User",
      `Block ${c.username}? They can no longer message you, they are removed from your friends and ` +
        `everything you share with each other stops. You can unblock them in Settings.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block",
          style: "destructive",
          onPress: async () => {
            try {
              await friendsApi.blockUser(c.userUuid);
              await onRefresh();
              alert("Blocked", `${c.username} has been blocked.`, [{ text: "OK" }], "success");
            } catch (e) {
              alert("Error", userFacingError(e, "Failed to block user"), [{ text: "OK" }], "error");
            }
          },
        },
      ],
      "warning",
    );

  const showSafetyActions = (c: Conversation): void =>
    alert(
      c.username,
      "Report this account to the server's operator, or block it so it can't contact you.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Report", onPress: () => setReportTarget({ id: c.userUuid, username: c.username }) },
        { text: "Block", style: "destructive", onPress: () => block(c) },
      ],
      "info",
    );

  const renderItem = ({ item }: { item: Conversation }) => {
    const label = relationLabel(item.relation);
    const unread = item.unreadCount > 0;
    const preview = `${item.lastMessage.fromMe ? "You: " : ""}${item.lastMessage.body}`;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => onOpen(item)}
        onLongPress={() => showSafetyActions(item)}
        accessibilityRole="button"
        accessibilityHint="Long press to report or block"
        accessibilityActions={[{ name: "longpress", label: "Report or block" }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === "longpress" && showSafetyActions(item)}
        accessibilityLabel={[
          `Conversation with ${item.username}`,
          label,
          unread ? `${item.unreadCount} unread` : null,
          preview,
        ]
          .filter(Boolean)
          .join(", ")}
      >
        <Avatar name={item.username} size={52} />
        <View style={styles.rowBody}>
          <View style={styles.line}>
            <Text style={styles.name} numberOfLines={1}>
              {item.username}
            </Text>
            {label && <Text style={styles.tag}>{label}</Text>}
            <Text style={[styles.time, unread && styles.timeUnread]}>{listTimeLabel(item.lastMessage.createdAt)}</Text>
          </View>
          <View style={styles.line}>
            <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
              {preview}
            </Text>
            {unread && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <BackButton color={colors.textPrimary} label="Close messages" onPress={onClose} />
        <Text style={styles.title} accessibilityRole="header">
          Messages
        </Text>
      </View>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.userUuid}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={conversations.length === 0 && styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void onRefresh().finally(() => setRefreshing(false));
            }}
            colors={[colors.accent]}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="💬"
            title="No messages yet"
            text="Open a friend or client and tap Message to start a conversation."
            style={styles.empty}
          />
        }
      />
      <ReportUserSheet
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onResult={(title, message, ok) => alert(title, message, [{ text: "OK" }], ok ? "success" : "error")}
      />
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
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    title: { flex: 1, color: colors.textPrimary, fontSize: 26, fontWeight: "800" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    rowBody: { flex: 1, gap: 3 },
    line: { flexDirection: "row", alignItems: "center", gap: 6 },
    name: { flexShrink: 1, color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
    tag: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 8,
      overflow: "hidden",
      fontSize: 11,
      fontWeight: "700",
      color: colors.info,
      backgroundColor: colors.infoLight,
    },
    time: { marginLeft: "auto", color: colors.textMuted, fontSize: 12 },
    timeUnread: { color: colors.accent, fontWeight: "700" },
    preview: { flex: 1, color: colors.textMuted, fontSize: 14 },
    previewUnread: { color: colors.textPrimary, fontWeight: "600" },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.accent,
    },
    badgeText: { color: colors.textOnAccent, fontSize: 12, fontWeight: "700" },
    separator: { height: StyleSheet.hairlineWidth, marginLeft: 82, backgroundColor: colors.separator },
    emptyContainer: { flexGrow: 1 },
    empty: { flex: 1 },
  });
