import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { sorenessApi } from "../services";
import { DOMSStats, MUSCLE_GROUP_LABELS } from "../types/muscleRecovery";
import ProgressChart from "@shared/components/ProgressChart";
import { getSeverityColor } from "@utils/severityColor";
import { Bar, Metric, Placeholder, SectionLabel, space } from "../ui";
import { captureException, metric } from "@shared/services/crashReporting";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface DOMSHeatmapProps {
  readonly onSelectMuscle?: (muscle: string) => void;
}

function recoveryTimeLabel(days: number): string {
  const rounded = Math.round(days);
  if (rounded < 1) return "under a day";
  if (rounded === 1) return "1 day";
  return `${rounded} days`;
}

export const DOMSHeatmap: React.FC<DOMSHeatmapProps> = ({ onSelectMuscle }) => {
  const { colors } = useTheme();
  const [stats, setStats] = useState<DOMSStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const response = await sorenessApi.getStats(90);
      const data = response?.data ?? response;
      setStats(data);
    } catch (error) {
      console.error("Failed to load DOMS stats:", error);
      metric.count("tracking.doms_stats_load_failed");
      captureException(error, { stage: "loadDomsStats" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loading} accessibilityRole='progressbar'>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!stats?.muscleRecoveryStats || stats.muscleRecoveryStats.length === 0) {
    return (
      <Placeholder text='Log soreness for a few weeks and your recovery patterns show up here.' />
    );
  }

  const totalEpisodes = stats.muscleRecoveryStats.reduce(
    (sum, m) => sum + m.totalEpisodes,
    0,
  );
  const activeCount = stats.muscleRecoveryStats.filter(
    (m) => m.isCurrentlySore,
  ).length;
  const avgRecovery =
    stats.muscleRecoveryStats.reduce(
      (sum, m) => sum + (m.averageRecoveryDays || 0),
      0,
    ) / (stats.muscleRecoveryStats.length || 1);
  const topSoreMuscles = stats.muscleRecoveryStats
    .filter((m) => m.totalEpisodes > 0)
    .sort((a, b) => b.totalEpisodes - a.totalEpisodes)
    .slice(0, 5);
  const recentTrend = stats.severityTrend?.slice(-7) ?? [];

  return (
    <View style={{ gap: space.lg }}>
      <Metric
        label='Sore episodes'
        value={String(totalEpisodes)}
        unit='in 90 days'
        meta={`${activeCount} sore right now · typically clears in ${recoveryTimeLabel(avgRecovery)}`}
      />

      {topSoreMuscles.length > 0 && (
        <View>
          <SectionLabel>Most often sore</SectionLabel>
          {topSoreMuscles.map((muscle, index) => {
            const label =
              MUSCLE_GROUP_LABELS[muscle.muscleGroup] || muscle.muscleGroup;
            const percentage = totalEpisodes
              ? Math.round((muscle.totalEpisodes / totalEpisodes) * 100)
              : 0;

            return (
              <TouchableOpacity
                accessibilityRole='button'
                accessibilityLabel={`${label}, ${muscle.totalEpisodes} episodes`}
                key={muscle.muscleGroup}
                style={[
                  styles.muscleRow,
                  index < topSoreMuscles.length - 1 && {
                    borderBottomWidth: StyleSheet.hairlineWidth,
                    borderBottomColor: colors.separator,
                  },
                ]}
                onPress={() => onSelectMuscle?.(muscle.muscleGroup)}
              >
                <View style={styles.muscleInfo}>
                  <Text
                    style={[styles.muscleLabel, { color: colors.textPrimary }]}
                  >
                    {label}
                  </Text>
                  <Bar pct={percentage} tone={colors.accent} />
                </View>
                <View style={styles.muscleStats}>
                  <Text
                    style={[styles.muscleCount, { color: colors.textPrimary }]}
                  >
                    {muscle.totalEpisodes}×
                  </Text>
                  {muscle.averageRecoveryDays != null && (
                    <Text
                      style={[styles.muscleMeta, { color: colors.textMuted }]}
                    >
                      {recoveryTimeLabel(muscle.averageRecoveryDays)}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {recentTrend.length > 0 && (
        <ProgressChart
          title='Severity, last 7 logs'
          chartType='bar'
          chartWidth={SCREEN_WIDTH - 96}
          showValuesOnTopOfBars
          barColors={recentTrend.map((point) =>
            getSeverityColor(point.averageIntensity, 3),
          )}
          data={{
            labels: recentTrend.map((point) =>
              String(new Date(point.date).getDate()),
            ),
            datasets: [
              { data: recentTrend.map((point) => point.averageIntensity) },
            ],
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  loading: { paddingVertical: space.xl, alignItems: "center" },
  muscleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    paddingVertical: space.md,
  },
  muscleInfo: { flex: 1, gap: 6 },
  muscleLabel: { fontSize: 15, fontWeight: "500" },
  muscleStats: { alignItems: "flex-end", minWidth: 64 },
  muscleCount: { fontSize: 15, fontWeight: "600" },
  muscleMeta: { fontSize: 12, marginTop: 2 },
});

export default DOMSHeatmap;
