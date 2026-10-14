import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { useFriendPhoto } from "../friendPhoto";

/** A friend's profile photo in a circle, or their initial until there is one. Pass `userId` only for friends. */
export function Avatar({
  username,
  userId,
  photoHash,
  active = false,
  children,
}: {
  readonly username?: string | null;
  readonly userId?: string | number | null;
  readonly photoHash?: string | null;
  readonly active?: boolean;
  readonly children?: React.ReactNode;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const photo = useFriendPhoto(userId, photoHash);
  return (
    <View style={[styles.avatar, active && styles.avatarActive]}>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={styles.photo}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={styles.avatarText}>
          {username?.charAt(0).toUpperCase() || "?"}
        </Text>
      )}
      {children}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.accent,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 12,
      position: "relative",
    },
    avatarActive: { backgroundColor: colors.accentDark },
    avatarText: { color: colors.surface, fontSize: 20, fontWeight: "bold" },
    photo: { width: 48, height: 48, borderRadius: 24 },
  });
