import React, { useMemo } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import type { ClientSummary } from "../types";
import { weeklyTarget } from "../utils/roster";
import { daysSinceLocal } from "@utils/format";

export const daysAgoText = (iso: string, now: Date): string => {
  const days = daysSinceLocal(new Date(iso), now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
};

const lastWorkoutText = (lastWorkoutAt: string | null, now: Date): string =>
  lastWorkoutAt ? `Last workout ${daysAgoText(lastWorkoutAt, now)}` : "No workouts yet";

export const clientStatusLine = (client: ClientSummary, now: Date): string => {
  const target = weeklyTarget(client.activeProgramDayCount);
  const week = target === null ? "" : ` · ${client.sessionsThisWeek} of ${target} this week`;
  return lastWorkoutText(client.lastWorkoutAt, now) + week;
};

interface ClientRowProps {
  readonly client: ClientSummary;
  readonly now: Date;
  readonly onPress: (client: ClientSummary) => void;
}

export default function ClientRow({ client, now, onPress }: ClientRowProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const line = clientStatusLine(client, now);
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={() => onPress(client)}
      accessibilityRole="button"
      accessibilityLabel={`${client.username}. ${line}. Open client`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{client.username}</Text>
        <Text style={styles.line}>{line}</Text>
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      minHeight: 56,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 12,
      marginBottom: 8,
      backgroundColor: colors.surface,
    },
    name: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
    line: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  });
