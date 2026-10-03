import React, { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@shared/context/ThemeContext";
import type { AnchorRect } from "./anchors";
import type { Gesture } from "./chapters";

function useLoop(duration: number) {
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withSequence(withTiming(1, { duration }), withTiming(0, { duration: 0 })), -1);
    return () => cancelAnimation(t);
  }, [reduceMotion, t, duration]);
  return { t, reduceMotion };
}

export function Hand({ gesture, x, y }: { readonly gesture: Gesture; readonly x: number; readonly y: number }) {
  const { t, reduceMotion } = useLoop(1000);
  const style = useAnimatedStyle(() => {
    if (gesture === "tap") return { transform: [{ scale: 1 - 0.25 * Math.sin(t.value * Math.PI) }] };
    if (gesture === "swipe") return { transform: [{ translateX: -70 * t.value }] };
    return { transform: [{ translateY: 90 * t.value }] };
  });
  const hidden = { accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" } as const;
  if (reduceMotion) {
    return <Text {...hidden} pointerEvents="none" style={[styles.hand, { left: x - 14, top: y }]}>⬆️</Text>;
  }
  return (
    <Animated.Text {...hidden} pointerEvents="none" style={[styles.hand, { left: x - 16, top: y }, style]}>
      {gesture === "twoFinger" ? "✌️" : "👆"}
    </Animated.Text>
  );
}

export function PulseRing({ rect }: { readonly rect: AnchorRect }) {
  const { colors } = useTheme();
  const { t, reduceMotion } = useLoop(1400);
  const style = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : 1 - t.value,
    transform: [{ scale: reduceMotion ? 1 : 1 + 0.15 * t.value }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, { left: rect.x, top: rect.y, width: rect.width, height: rect.height, borderColor: colors.accent }, style]}
    />
  );
}

const styles = StyleSheet.create({
  hand: { position: "absolute", fontSize: 34 },
  ring: { position: "absolute", borderWidth: 3, borderRadius: 14 },
});
