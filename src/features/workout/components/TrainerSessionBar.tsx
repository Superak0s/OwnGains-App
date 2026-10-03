import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { visibleDaysForSplit } from "@utils/programDays";
import ModalSheet from "@shared/components/ModalSheet";
import { makeTrainerBannerStyles } from "./TrainerBanner";

interface TrainerSessionBarProps {
  readonly username: string;
  readonly onStop: () => void;
}

export function TrainerSessionBar({
  username,
  onStop,
}: TrainerSessionBarProps): React.JSX.Element {
  const { colors } = useTheme();
  const banner = makeTrainerBannerStyles(colors);
  const styles = makeStopStyles(colors);

  // Rendered inside the trainee's WorkoutProvider, so this is the trainee's
  // program and day, not the trainer's own.
  const {
    workoutData,
    selectedSplit,
    currentDay,
    saveCurrentDay,
    isDayLocked,
    hasActiveSession,
  } = useWorkoutPick(
    "workoutData",
    "selectedSplit",
    "currentDay",
    "saveCurrentDay",
    "isDayLocked",
    "hasActiveSession",
  );
  const [showDays, setShowDays] = useState(false);

  const days = useMemo(
    () => visibleDaysForSplit(workoutData?.days ?? [], selectedSplit),
    [workoutData, selectedSplit],
  );
  const displayDay =
    days.find(({ day }) => day.dayNumber === currentDay)?.displayNumber ??
    currentDay;
  const dayLocked = hasActiveSession();

  return (
    <View style={banner.container}>
      <Text style={banner.label} numberOfLines={1}>
        🧑‍🏫 Logging for <Text style={banner.name}>{username}</Text>
      </Text>
      {days.length > 0 && (
        <TouchableOpacity
          style={[styles.dayBtn, dayLocked && styles.dayBtnDisabled]}
          onPress={() => setShowDays(true)}
          disabled={dayLocked}
          accessibilityRole='button'
          accessibilityLabel={`Day ${displayDay}, change trainee workout day`}
        >
          <Text style={styles.dayBtnText}>Day {displayDay} ▾</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.stopBtn}
        onPress={onStop}
        accessibilityRole='button'
        accessibilityLabel='Stop trainer session'
      >
        <Text style={styles.stopBtnText}>Stop</Text>
      </TouchableOpacity>

      <ModalSheet
        visible={showDays}
        onClose={() => setShowDays(false)}
        title={`${username}'s Workout Day`}
        showCancelButton={false}
        showConfirmButton={false}
        scrollable
      >
        {days.map(({ day, displayNumber }) => {
          const locked = isDayLocked(day.dayNumber);
          const current = day.dayNumber === currentDay;
          return (
            <TouchableOpacity
              key={day.dayNumber}
              style={[styles.dayRow, current && styles.dayRowCurrent]}
              accessibilityRole='button'
              accessibilityLabel={`Day ${displayNumber}${locked ? ", locked" : ""}`}
              accessibilityState={{ selected: current }}
              onPress={() => {
                void saveCurrentDay(day.dayNumber);
                setShowDays(false);
              }}
            >
              <Text style={styles.dayRowTitle}>
                {`Day ${displayNumber}${locked ? " 🔒" : ""}`}
              </Text>
              <Text style={styles.dayRowMuscles} numberOfLines={1}>
                {(day.primaryMuscles ?? []).join(", ")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ModalSheet>
    </View>
  );
}

const makeStopStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    stopBtn: {
      backgroundColor: colors.errorLight,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    stopBtnText: { color: colors.error, fontSize: 13, fontWeight: "600" },
    dayBtn: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
    },
    dayBtnDisabled: { opacity: 0.45 },
    dayBtnText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontWeight: "600",
    },
    dayRow: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    dayRowCurrent: { borderColor: colors.accent },
    dayRowTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    dayRowMuscles: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  });
