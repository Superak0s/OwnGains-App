import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useTheme, type ThemeColors } from "../context/ThemeContext";
import { useWidgetSize } from "./widgets/widgetSize";
import ChartView from "./chart/ChartView";
import ExpandedChart from "./chart/ExpandedChart";
import { useChartSettings } from "./chart/useChartSettings";
import {
  chartModel,
  decimalsFor,
  type ChartPoint,
  type ChartRange,
  type ChartSettings,
} from "./chart/chartMath";

export type { ChartPoint } from "./chart/chartMath";

export interface ChartMetric {
  key: string;
  label: string;
  points: ChartPoint[];
  suffix?: string;
}

interface ProgressChartProps {
  readonly title?: string;
  readonly icon?: string;
  readonly points?: ChartPoint[];
  /** Alternative series the expanded view can switch between. The first is the default. */
  readonly metrics?: ChartMetric[];
  /** Keys the saved view settings. Without it, changes last until the screen closes. */
  readonly chartId?: string;
  readonly yAxisSuffix?: string;
  readonly chartWidth?: number;
  readonly chartType?: "line" | "bar";
  /** Line charts only. Off for body metrics, where a 0 baseline flattens a few kg into a straight line. */
  readonly fromZero?: boolean;
  readonly defaultRange?: ChartRange;
  readonly onPointPress?: (point: ChartPoint) => void;
}

const CHART_HEIGHT = 220;
const LARGE_CHART_HEIGHT = 320;
const MAX_SMALL_POINTS = 60;

export default function ProgressChart({
  title,
  icon,
  points = [],
  metrics,
  chartId,
  yAxisSuffix = "",
  chartWidth,
  chartType = "line",
  fromZero = true,
  defaultRange = "all",
  onPointPress,
}: ProgressChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const widgetSize = useWidgetSize();
  const height = widgetSize === "large" ? LARGE_CHART_HEIGHT : CHART_HEIGHT;
  const [expanded, setExpanded] = useState(false);

  const defaults = useMemo<Partial<ChartSettings>>(
    () => ({
      kind: chartType,
      yAxis: chartType === "bar" || fromZero ? "zero" : "auto",
      range: defaultRange,
    }),
    [chartType, fromZero, defaultRange],
  );
  const { settings, update, reset } = useChartSettings(chartId, defaults);

  const metric =
    metrics?.find((m) => m.key === settings.metric) ?? metrics?.[0];
  const series = metric?.points ?? points;
  const suffix = metric?.suffix ?? yAxisSuffix;
  const label = metric && metrics!.length > 1 ? metric.label : title;
  const finite = useMemo(
    () => series.filter((p) => Number.isFinite(p.value)),
    [series],
  );
  const model = useMemo(
    () => chartModel(finite, settings, { maxPoints: MAX_SMALL_POINTS }),
    [finite, settings],
  );

  const summary = useMemo(() => {
    const name = label ?? "Chart";
    const values = model.visible.map((p) => p.value);
    if (values.length === 0) return `${name}: no data yet`;
    const decimals = decimalsFor(values);
    const round = (v: number) => `${v.toFixed(decimals)}${suffix}`;
    return [
      `${name}: ${values.length} points`,
      `from ${round(values[0])} to ${round(values.at(-1)!)}`,
      `low ${round(Math.min(...values))}`,
      `high ${round(Math.max(...values))}`,
    ].join(", ");
  }, [model.visible, label, suffix]);

  return (
    <View style={styles.chartSection}>
      {title && (
        <Text style={styles.chartTitle} accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
          {icon ? `${icon} ` : ""}
          {label}
        </Text>
      )}
      <Pressable
        onPress={() => setExpanded(true)}
        accessibilityRole='button'
        accessibilityLabel={summary}
        accessibilityHint='Opens the chart full screen with more options'
      >
        {model.visible.length === 0 ? (
          <View style={[styles.empty, { height }]}>
            <Text style={styles.emptyText}>
              {finite.length ? "No data in this range" : "No data yet"}
            </Text>
          </View>
        ) : (
          <View pointerEvents='none'>
            <ChartView
              model={model}
              settings={settings}
              width={chartWidth ?? width - 40}
              height={height}
              suffix={suffix}
            />
          </View>
        )}
      </Pressable>
      {expanded && (
        <ExpandedChart
          visible
          onClose={() => setExpanded(false)}
          title={label ?? "Chart"}
          points={finite}
          suffix={suffix}
          settings={settings}
          update={update}
          reset={reset}
          metrics={metrics?.map(({ key, label: name }) => ({ key, label: name }))}
          onPointPress={onPointPress}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    chartSection: { marginBottom: 25 },
    chartTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 15,
    },
    empty: {
      marginVertical: 8,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
    },
    emptyText: { fontSize: 14, color: colors.textSecondary },
  });
