import React, { useEffect, useRef } from "react";
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";

interface PrCelebrationProps {
  exerciseName: string;
  detail: string;
  onDone: () => void;
}

export function PrCelebration({
  exerciseName,
  detail,
  onDone,
}: Readonly<PrCelebrationProps>): React.JSX.Element {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const anim = useRef(new Animated.Value(0)).current;
  // Callers pass an inline onDone. Without this ref every parent re-render
  // (a partner's WebSocket message, say) would restart the animation.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const announcement = `New personal record on ${exerciseName}. ${detail}`;
  const announcementRef = useRef(announcement);
  announcementRef.current = announcement;

  useEffect(() => {
    // The card unmounts after ~2s, too soon for the role="alert" label to be
    // read reliably, so announce it directly so the timing doesn't matter.
    AccessibilityInfo.announceForAccessibility(announcementRef.current);
    const animation = Animated.sequence([
      Animated.spring(anim, {
        toValue: 1,
        friction: 5,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.delay(1700),
      Animated.timing(anim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onDoneRef.current();
    });
    return () => animation.stop();
  }, [anim]);

  return (
    <View style={styles.overlay} pointerEvents="none">
      <Animated.View
        accessibilityRole="alert"
        accessibilityLabel={announcement}
        style={[
          styles.card,
          {
            opacity: anim,
            transform: [
              { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            ],
          },
        ]}
      >
        <Text style={styles.trophy}>🏆</Text>
        <Text style={styles.title}>New PR!</Text>
        <Text style={styles.exercise} numberOfLines={1}>
          {exerciseName}
        </Text>
        <Text style={styles.detail}>{detail}</Text>
      </Animated.View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      position: "absolute",
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    card: {
      backgroundColor: colors.successLight,
      borderColor: colors.success,
      borderWidth: 2,
      borderRadius: 20,
      paddingVertical: 24,
      paddingHorizontal: 32,
      alignItems: "center",
      elevation: 8,
    },
    trophy: { fontSize: 48 },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      color: colors.success,
      marginTop: 4,
    },
    exercise: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.success,
      marginTop: 6,
      maxWidth: 240,
    },
    detail: { fontSize: 14, color: colors.success, marginTop: 2 },
  });
