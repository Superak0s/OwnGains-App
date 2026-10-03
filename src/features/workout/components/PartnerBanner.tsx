import React, { useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Animated, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { PartnerProgress } from "@shared/context/hooks/useJointSession";
import { getPartnerStatusText } from "../utils";

interface PartnerBannerProps {
  partnerProgress: PartnerProgress | null;
  isPartnerReady: boolean;
  syncPulse: boolean;
  partnerUsername: string;
  onLeave: () => void;
}

export function PartnerBanner({
  partnerProgress,
  isPartnerReady,
  syncPulse,
  partnerUsername,
  onLeave,
}: Readonly<PartnerBannerProps>): React.JSX.Element {
  const { colors } = useTheme();
  const bannerStyles = makeBannerStyles(colors);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!syncPulse) return;
    const step = (toValue: number) =>
      Animated.timing(pulse, { toValue, duration: 120, useNativeDriver: true });
    Animated.loop(Animated.sequence([step(1.04), step(1)]), {
      iterations: 2,
    }).start();
  }, [syncPulse, pulse]);

  const statusText = getPartnerStatusText(isPartnerReady, partnerProgress);

  return (
    <Animated.View
      style={[bannerStyles.container, { transform: [{ scale: pulse }] }]}
    >
      <View style={bannerStyles.liveDot} />
      <View style={bannerStyles.avatarRing}>
        <Text style={bannerStyles.avatarText}>
          {partnerUsername?.charAt(0).toUpperCase() || "?"}
        </Text>
      </View>
      <Text style={bannerStyles.label} numberOfLines={1}>
        <Text style={bannerStyles.name}>{partnerUsername}</Text>
        {"  "}
        <Text style={bannerStyles.status}>{statusText}</Text>
      </Text>
      <TouchableOpacity
        style={bannerStyles.leaveBtn}
        accessibilityRole='button'
        accessibilityLabel='Leave joint session'
        onPress={onLeave}
      >
        <Text style={bannerStyles.leaveBtnText}>Leave</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeBannerStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 7,
      gap: 8,
    },
    liveDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: colors.success,
    },
    avatarRing: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.accentDark,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1.5,
      borderColor: colors.info,
    },
    avatarText: { color: colors.textOnAccent, fontWeight: "700", fontSize: 12 },
    label: { flex: 1, fontSize: 12 },
    name: { color: colors.textPrimary, fontWeight: "700" },
    status: { color: colors.textSecondary },
    leaveBtn: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    leaveBtnText: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: "600",
    },
  });
