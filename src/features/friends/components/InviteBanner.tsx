import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

interface InviteBannerProps {
  readonly invite: { fromUsername: string } | null;
  readonly onAccept: () => void;
  readonly onDecline: () => void;
}

export function InviteBanner({
  invite,
  onAccept,
  onDecline,
}: InviteBannerProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const bannerStyles = makeBannerStyles(colors);
  if (!invite) return null;
  return (
    <View style={bannerStyles.container}>
      <View style={bannerStyles.left}>
        <Text style={bannerStyles.icon}>🏋️</Text>
        <View>
          <Text style={bannerStyles.title}>Joint Session Invite</Text>
          <Text style={bannerStyles.sub}>
            <Text style={bannerStyles.username}>{invite.fromUsername}</Text>
            {" wants to lift together!"}
          </Text>
        </View>
      </View>
      <View style={bannerStyles.actions}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Decline invite"
          style={bannerStyles.decline}
          onPress={onDecline}
        >
          <Text style={bannerStyles.declineText}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity style={bannerStyles.accept} onPress={onAccept}>
          <Text style={bannerStyles.acceptText}>Join</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeBannerStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.background,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    left: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
    icon: { fontSize: 28 },
    title: {
      color: colors.surface,
      fontWeight: "700",
      fontSize: 14,
      marginBottom: 2,
    },
    sub: { color: "rgba(255,255,255,0.7)", fontSize: 13 },
    username: { color: colors.info, fontWeight: "600" },
    actions: { flexDirection: "row", gap: 8, alignItems: "center" },
    decline: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: "rgba(255,255,255,0.12)",
      alignItems: "center",
      justifyContent: "center",
    },
    declineText: { color: colors.surface, fontSize: 14, fontWeight: "bold" },
    accept: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
      backgroundColor: colors.accentDark,
    },
    acceptText: { color: colors.surface, fontSize: 14, fontWeight: "700" },
  });
