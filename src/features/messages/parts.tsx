import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Avatar as BaseAvatar } from "@shared/components/Avatar";

// Readable with white text in both themes.
const AVATAR_COLORS = ["#E57373", "#F06292", "#BA68C8", "#7986CB", "#4FC3F7", "#4DB6AC", "#81C784", "#FFB74D", "#A1887F"];

const colorFor = (name: string): string => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) % 9973;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

export function Avatar({ name, size }: { readonly name: string; readonly size: number }): React.JSX.Element {
  return (
    <BaseAvatar name={name} size={size} style={{ backgroundColor: colorFor(name) }} textStyle={styles.initial} />
  );
}

export function BackButton({
  color,
  label,
  onPress,
}: {
  readonly color: string;
  readonly label: string;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.back}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
    >
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </TouchableOpacity>
  );
}

export function SendIcon({ color }: { readonly color: string }): React.JSX.Element {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.17L4 12l-1.99 7.23a1 1 0 001.39 1.17z" fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  initial: { color: "#FFFFFF" },
  back: { width: 40, height: 44, alignItems: "flex-start", justifyContent: "center" },
});
