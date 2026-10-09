import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { BarChart, LineChart } from "react-native-gifted-charts";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@shared/context/ThemeContext";
import { isDarkColor } from "@utils/color";
import { xLabels, type ChartModel, type ChartSettings } from "./chartMath";

interface ChartViewProps {
  readonly model: ChartModel;
  readonly settings: ChartSettings;
  readonly width: number;
  readonly height: number;
  readonly suffix?: string;
  /** Multiplies the spacing between points. 1 fits every point in the width. */
  readonly zoom?: number;
  readonly selected?: number | null;
  readonly onSelect?: (index: number) => void;
}

const EDGE = 12;
const CHART_PADDING = 8;

const decimalsOf = (value: number) =>
  (String(Number(value.toFixed(2))).split(".")[1] ?? "").length;

export default function ChartView({
  model,
  settings,
  width,
  height,
  suffix = "",
  zoom = 1,
  selected = null,
  onSelect,
}: ChartViewProps) {
  const { colors, resolvedChartColor, resolvedChartColorDark } = useTheme();
  // The gradient is user-configurable, so ink drawn on it can't assume a dark background.
  const onChart = isDarkColor(resolvedChartColor) ? "255, 255, 255" : "0, 0, 0";
  const ink = (alpha: number) => `rgba(${onChart}, ${alpha})`;
  const { fontSize, kind } = settings;
  const { min, step, sections } = model.bounds;
  const count = model.dates.length;

  const yLabels = useMemo(() => {
    const decimals = Math.max(decimalsOf(min), decimalsOf(step));
    return Array.from(
      { length: sections + 1 },
      (_, i) => `${(min + i * step).toFixed(decimals)}${suffix}`,
    );
  }, [min, step, sections, suffix]);
  const yLabelWidth =
    Math.max(...yLabels.map((label) => label.length)) * fontSize * 0.62 + 6;
  const plotWidth = Math.max(40, width - yLabelWidth - CHART_PADDING * 2);
  const xLabelWidth = fontSize * 6;
  const labels = useMemo(
    () => xLabels(model.dates, Math.round(settings.xLabels * zoom)),
    [model.dates, settings.xLabels, zoom],
  );

  const axis = {
    height,
    width: plotWidth,
    yAxisOffset: min,
    maxValue: step * sections,
    stepValue: step,
    noOfSections: sections,
    yAxisLabelTexts: yLabels,
    yAxisLabelWidth: yLabelWidth,
    yAxisTextStyle: { color: ink(0.85), fontSize },
    yAxisColor: ink(0.4),
    xAxisColor: ink(0.4),
    rulesColor: ink(0.12),
    rulesType: "solid" as const,
    disableScroll: zoom <= 1,
    scrollToEnd: zoom > 1,
    isAnimated: false,
    showReferenceLine1: settings.goal != null,
    referenceLine1Position: settings.goal ?? 0,
    referenceLine1Config: {
      color: colors.success,
      dashWidth: 6,
      dashGap: 4,
      thickness: 2,
    },
  };

  const chart = (() => {
    if (kind === "bar") {
      const slot = (plotWidth / Math.max(count, 1)) * zoom;
      const barWidth = Math.max(2, slot * 0.6);
      const spacing = slot - barWidth;
      const labelStyle = {
        color: ink(0.85),
        fontSize,
        width: xLabelWidth,
        marginLeft: (barWidth + spacing - xLabelWidth) / 2,
      };
      return (
        <BarChart
          {...axis}
          data={model.main.map((value, i) => ({
            value: value ?? 0,
            label: labels[i],
            labelTextStyle: labelStyle,
            frontColor:
              i === selected
                ? colors.accent
                : (model.pointAt[i]?.color ?? ink(0.85)),
            onPress: () => onSelect?.(i),
          }))}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={spacing / 2}
          endSpacing={spacing / 2}
          barBorderRadius={Math.min(4, barWidth / 3)}
          labelWidth={barWidth + spacing}
          showLine={!!model.trend}
          lineData={model.trend?.map((value) => ({ value: value ?? undefined }))}
          lineConfig={{
            color: colors.accent,
            thickness: 2,
            hideDataPoints: true,
            curved: true,
            initialSpacing: spacing / 2 + barWidth / 2,
          }}
        />
      );
    }

    const spacing =
      count > 1 ? ((plotWidth - EDGE * 2) / (count - 1)) * zoom : plotWidth / 2;
    const labelStyle = {
      color: ink(0.85),
      fontSize,
      width: xLabelWidth,
      marginLeft: (spacing - xLabelWidth) / 2,
    };
    const rawColor = settings.showRaw ? ink(0.95) : "transparent";
    return (
      <LineChart
        {...axis}
        data={model.main.map((value, i) => {
          const record = model.records.has(i);
          const shown = value != null && (settings.showDots || record);
          return {
            value: value ?? undefined,
            label: labels[i],
            labelTextStyle: labelStyle,
            hideDataPoint: !shown || (!settings.showRaw && !record),
            dataPointColor: record ? colors.warning : ink(0.95),
            dataPointRadius: record ? 6 : 4,
          };
        })}
        data2={model.trend?.map((value) => ({ value: value ?? undefined }))}
        data3={model.compare?.map((value) => ({ value: value ?? undefined }))}
        spacing={spacing}
        initialSpacing={count > 1 ? EDGE : plotWidth / 2}
        endSpacing={EDGE}
        curved
        color1={rawColor}
        thickness1={2}
        color2={colors.accent}
        thickness2={3}
        hideDataPoints2
        color3={ink(0.45)}
        thickness3={2}
        strokeDashArray3={[6, 4]}
        hideDataPoints3
        areaChart1={kind === "area" && settings.showRaw}
        startFillColor1={ink(0.9)}
        endFillColor1={ink(0.1)}
        startOpacity={0.35}
        endOpacity={0.02}
        focusEnabled={!!onSelect}
        showStripOnFocus
        stripColor={ink(0.4)}
        stripWidth={1}
        focusedDataPointColor={colors.accent}
        focusedDataPointIndex={selected ?? -1}
        onFocus={(_item: unknown, index: number) => onSelect?.(index)}
      />
    );
  })();

  return (
    <LinearGradient
      colors={[resolvedChartColor, resolvedChartColorDark]}
      style={[styles.card, { paddingHorizontal: CHART_PADDING }]}
    >
      <View style={{ height: height + 40 }}>{chart}</View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, paddingTop: 16, overflow: "hidden" },
});
