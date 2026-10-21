import React from "react";
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { useTheme } from "@shared/context/ThemeContext";
import { useFriendPhoto } from "@features/friends/friendPhoto";

interface AvatarProps {
  readonly name?: string | null;
  readonly size: number;
  readonly photo?: string | null;
  readonly userId?: string | number | null;
  readonly photoHash?: string | null;
  readonly style?: StyleProp<ViewStyle>;
  readonly textStyle?: StyleProp<TextStyle>;
  readonly children?: React.ReactNode;
}

/**
 * A profile photo in a circle, or the name's initial until there is one.
 *
 * @param photo - A local photo URI, used before any friend photo.
 * @param userId - Downloads this friend's photo. Pass it only for friends.
 */
export function Avatar({
  name,
  size,
  photo,
  userId,
  photoHash,
  style,
  textStyle,
  children,
}: AvatarProps): React.JSX.Element {
  const { colors } = useTheme();
  const friendPhoto = useFriendPhoto(userId, photoHash);
  const uri = photo ?? friendPhoto;
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.accent,
        },
        style,
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { borderRadius: size / 2 }]}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[
            styles.initial,
            { fontSize: size * 0.42, color: colors.textOnAccent },
            textStyle,
          ]}
        >
          {name?.charAt(0).toUpperCase() || "?"}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: "center", justifyContent: "center" },
  initial: { fontWeight: "700" },
});
