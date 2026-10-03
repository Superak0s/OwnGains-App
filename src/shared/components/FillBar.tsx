import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

interface FillBarStyles {
  readonly track: StyleProp<ViewStyle>;
  readonly fill: StyleProp<ViewStyle>;
}

interface FillBarProps {
  readonly percentage: number;
  readonly color: string;
  readonly styles: FillBarStyles;
}

export function FillBar({ percentage, color, styles }: FillBarProps): React.JSX.Element {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(percentage) ? percentage : 0));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
    </View>
  );
}
