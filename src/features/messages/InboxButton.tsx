import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useMessages } from "./MessagesContext";

export default function InboxButton(): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { available, unreadCount, openInbox } = useMessages();
  if (!available) return null;
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={openInbox}
      accessibilityRole="button"
      accessibilityLabel={unreadCount > 0 ? `Messages, ${unreadCount} unread` : "Messages"}
    >
      <Text style={styles.icon}>💬</Text>
      {unreadCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    icon: { fontSize: 20 },
    badge: {
      position: "absolute",
      top: -2,
      right: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.error,
    },
    badgeText: { color: colors.textOnAccent, fontSize: 10, fontWeight: "700" },
  });
