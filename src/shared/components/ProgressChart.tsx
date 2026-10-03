import { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { LineChart, BarChart } from "react-native-chart-kit";
import { useTheme } from "../context/ThemeContext";
import { isDarkColor } from "@utils/color";
import { useWidgetSize } from "./widgets/widgetSize";
import type { ThemeColors } from "@shared/context/ThemeContext"

interface ChartData {
  labels: string[];
  datasets: { data: number[] }[];
}

interface ProgressChartProps {
  readonly title?: string;
  readonly icon?: string;
  readonly data: ChartData;
  readonly yAxisSuffix?: string;
  readonly chartWidth?: number;
  readonly chartType?: "line" | "bar";
  /** Per-bar color override, only used when chartType is "bar". */
  readonly barColors?: string[];
  readonly showValuesOnTopOfBars?: boolean;
}

const CHART_HEIGHT = 220;
const LARGE_CHART_HEIGHT = 320;

export default function ProgressChart({
  title,
  icon,
  data,
  yAxisSuffix = "",
  chartWidth,
  chartType = "line",
  barColors,
  showValuesOnTopOfBars,
}: ProgressChartProps) {
  const { colors, resolvedChartColor, resolvedChartColorDark } = useTheme();
  const { width } = useWindowDimensions();
  const widgetSize = useWidgetSize();
  const resolvedHeight =
    widgetSize === "large" ? LARGE_CHART_HEIGHT : CHART_HEIGHT;
  const resolvedWidth = chartWidth ?? width - 40;
  const safeData = useMemo<ChartData>(
    () => ({
      ...data,
      datasets: data.datasets.map((d) => ({
        ...d,
        data: d.data.map((v) => (Number.isFinite(v) ? v : 0)),
      })),
    }),
    [data],
  );
  const values = safeData.datasets.flatMap((d) => d.data);
  const hasData = values.length > 0;
  // The gradient behind the chart is user-configurable, so the labels drawn on
  // top of it can't assume a dark background.
  const onChartRgb = isDarkColor(resolvedChartColor) ? "255, 255, 255" : "0, 0, 0";
  // Whole-number series (volume, reps) read as "12500.0" with a fixed scale.
  const decimalPlaces = values.every((v) => Math.abs(v) >= 10) ? 0 : 1;
  const chartConfig = {
    backgroundColor: resolvedChartColor,
    backgroundGradientFrom: resolvedChartColor,
    backgroundGradientTo: resolvedChartColorDark,
    decimalPlaces,
    color: (opacity = 1) => `rgba(${onChartRgb}, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(${onChartRgb}, ${opacity})`,
    style: { borderRadius: 16 },
    propsForDots: { r: "6", strokeWidth: "2", stroke: resolvedChartColorDark },
  };
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const barData = useMemo(() => {
    if (chartType !== "bar" || !barColors) return safeData;
    const colorFns = barColors.map((barColor) => () => barColor);
    return {
      ...safeData,
      datasets: safeData.datasets.map((dataset) => ({
        ...dataset,
        colors: colorFns,
      })),
    };
  }, [chartType, barColors, safeData]);

  const summary = useMemo(() => {
    if (values.length === 0) return `${title ?? "Chart"}: no data yet`;
    const first = values[0];
    const last = values[values.length - 1];
    const round = (v: number) => v.toFixed(decimalPlaces);
    return [
      `${title ?? "Chart"}: ${values.length} points`,
      `from ${round(first)}${yAxisSuffix} to ${round(last)}${yAxisSuffix}`,
      `low ${round(Math.min(...values))}${yAxisSuffix}`,
      `high ${round(Math.max(...values))}${yAxisSuffix}`,
    ].join(", ");
  }, [values, title, yAxisSuffix, decimalPlaces]);

  return (
    <View
      style={styles.chartSection}
      accessible
      accessibilityRole='image'
      accessibilityLabel={summary}
    >
      {title && (
        <Text style={styles.chartTitle} accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
          {icon ? `${icon} ` : ""}
          {title}
        </Text>
      )}
      {!hasData && (
        <View style={[styles.empty, { height: resolvedHeight }]}>
          <Text style={styles.emptyText}>No data yet</Text>
        </View>
      )}
      {hasData && (chartType === "bar" ? (
        <BarChart
          data={barData}
          width={resolvedWidth}
          height={resolvedHeight}
          chartConfig={chartConfig}
          style={styles.chart}
          yAxisLabel=""
          yAxisSuffix={yAxisSuffix}
          withInnerLines={false}
          fromZero
          withCustomBarColorFromData={!!barColors}
          flatColor={!!barColors}
          showValuesOnTopOfBars={showValuesOnTopOfBars}
        />
      ) : (
        <LineChart
          data={safeData}
          width={resolvedWidth}
          height={resolvedHeight}
          chartConfig={chartConfig}
          bezier
          style={styles.chart}
          yAxisSuffix={yAxisSuffix}
          withInnerLines={false}
          withOuterLines
          withVerticalLines={false}
          withHorizontalLines
          fromZero
        />
      ))}
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
    chart: { marginVertical: 8, borderRadius: 16 },
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
