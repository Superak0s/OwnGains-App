import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useWorkoutPick } from "@shared/context/WorkoutContext";
import { formatTime as formatDuration } from "@utils/timeEstimation";
import type { makeStyles } from "../WorkoutScreen";

type ExerciseCardStyles = ReturnType<typeof makeStyles>;

type SessionStatsWidgetProps = {
  workoutStartTime: string | null;
  isCurrentDayLocked: boolean;
  currentDay: number;
  restReminderEnabled: boolean;
  restReminderSeconds: number;
  onOpenReminderModal: () => void;
  paused?: boolean;
  styles: ExerciseCardStyles;
};

export const SessionStatsWidget = React.memo(function SessionStatsWidget({
  workoutStartTime,
  isCurrentDayLocked,
  currentDay,
  restReminderEnabled,
  restReminderSeconds,
  onOpenReminderModal,
  paused = false,
  styles,
}: SessionStatsWidgetProps) {
  const {
    getCurrentRestTime,
    getTotalSessionTime,
    getSessionAverageRestTime,
    getExerciseRestTime,
    getLastSetExercise,
  } = useWorkoutPick(
    "getCurrentRestTime",
    "getTotalSessionTime",
    "getSessionAverageRestTime",
    "getExerciseRestTime",
    "getLastSetExercise",
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!workoutStartTime || isCurrentDayLocked || paused) return;

    setTick((n) => n + 1);
    const interval = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(interval);
  }, [workoutStartTime, isCurrentDayLocked, paused]);

  if (!workoutStartTime || isCurrentDayLocked || tick === 0) {
    return (
      <Text style={styles.widgetLineMuted}>
        Starts once you begin a session.
      </Text>
    );
  }

  const totalSessionTime = getTotalSessionTime();
  const currentRest = getCurrentRestTime();
  const lastExercise = getLastSetExercise(currentDay);
  // The exercise's own rest is the fair baseline. A squat rest measured
  // against a session average dragged down by curls always reads as overtime.
  const exerciseRest = lastExercise
    ? getExerciseRestTime(currentDay, lastExercise.index)
    : null;
  const baselineRest = exerciseRest ?? getSessionAverageRestTime(currentDay);
  // Before the first rest is logged the baseline is 0, which every elapsed
  // second exceeds. There is no baseline to be over yet.
  const isOvertime = baselineRest > 0 && currentRest > baselineRest;
  const overtimeNote = isOvertime
    ? `, over your usual ${lastExercise?.name ?? "session"} rest`
    : "";

  return (
    <View>
      <View style={styles.sessionStatsRow}>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatLabel}>⏱️ Total Time</Text>
          <Text style={styles.sessionStatValue}>
            {formatDuration(totalSessionTime)}
          </Text>
        </View>
        <View style={styles.sessionStat}>
          <Text style={styles.sessionStatLabel} numberOfLines={1}>
            {exerciseRest !== null && lastExercise
              ? `💤 ${lastExercise.name}`
              : "💤 Avg Rest/Set"}
          </Text>
          <Text style={styles.sessionStatValue}>
            {formatDuration(Math.round(baselineRest))}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.sessionStat}
          accessibilityRole='button'
          accessibilityLabel={`Rest reminder, currently ${
            restReminderEnabled && restReminderSeconds > 0
              ? formatDuration(restReminderSeconds)
              : "off"
          }`}
          onPress={onOpenReminderModal}
        >
          <Text style={styles.sessionStatLabel}>⏰ Reminder</Text>
          <Text style={styles.sessionStatValue}>
            {restReminderEnabled && restReminderSeconds > 0
              ? formatDuration(restReminderSeconds)
              : "Off"}
          </Text>
        </TouchableOpacity>
      </View>
      {currentRest > 0 && (
        <View
          style={styles.currentRestContainer}
          accessible={true}
          accessibilityLabel={`Rest since last set ${formatDuration(currentRest)}${overtimeNote}`}
        >
          <Text style={styles.currentRestLabel} numberOfLines={1}>
            {lastExercise
              ? `Resting from ${lastExercise.name}:`
              : "Rest since last set:"}
          </Text>
          <Text
            style={[
              styles.currentRestValue,
              isOvertime && styles.currentRestOvertime,
            ]}
          >
            {formatDuration(currentRest)}
            {isOvertime && (
              <Text style={styles.overtimeText}>
                {" "}
                (+{formatDuration(Math.round(currentRest - baselineRest))})
              </Text>
            )}
          </Text>
        </View>
      )}
    </View>
  );
});
