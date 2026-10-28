import { useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import * as ScreenOrientation from "expo-screen-orientation";
import { captureRef } from "react-native-view-shot";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { captureException } from "@shared/services/crashReporting";
import { showToast } from "@shared/components/toast";
import { Button, Chip, Stepper } from "@shared/components/ui";
import { formatDate } from "@utils/format";
import {
  DESTINATION_TEXT,
  writeBinaryExport,
  writeTextExport,
} from "@utils/writeJsonExport";
import ChartView from "./ChartView";
import {
  CHART_RANGES,
  chartModel,
  chartStats,
  decimalsFor,
  goalMessage,
  toCsv,
  type ChartPoint,
  type ChartSettings,
} from "./chartMath";

interface ExpandedChartProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly points: ChartPoint[];
  readonly suffix: string;
  readonly settings: ChartSettings;
  readonly update: (patch: Partial<ChartSettings>) => void;
  readonly reset: () => void;
  readonly metrics?: { key: string; label: string }[];
  readonly onPointPress?: (point: ChartPoint) => void;
  readonly focusGoal?: boolean;
}

const RANGE_LABELS: Record<(typeof CHART_RANGES)[number], string> = {
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  all: "All",
  custom: "Custom",
};
const MAX_ZOOM = 8;

const parseNumber = (text: string): number | undefined => {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : undefined;
};

export default function ExpandedChart({
  visible,
  onClose,
  title,
  points,
  suffix,
  settings,
  update,
  reset,
  metrics,
  onPointPress,
  focusGoal = false,
}: ExpandedChartProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const pinchStart = useRef(1);
  const chartRef = useRef<ViewInstance>(null);

  const model = useMemo(() => chartModel(points, settings), [points, settings]);
  const stats = chartStats(model.visible);
  const selectedPoint = selected == null ? undefined : model.pointAt[selected];
  const decimals = decimalsFor(model.visible.map((p) => p.value));
  const fmt = (v: number) => `${v.toFixed(decimals)}${suffix}`;
  const unit = suffix ? ` (${suffix.trim()})` : "";

  useEffect(() => {
    setSelected(null);
    setZoom(1);
  }, [settings.range, settings.customFrom, settings.customTo, settings.metric, settings.kind, settings.projection]);

  useEffect(
    () => () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    },
    [],
  );

  const rotate = () => {
    ScreenOrientation.lockAsync(
      landscape
        ? ScreenOrientation.OrientationLock.PORTRAIT_UP
        : ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => showToast("This device can't rotate the chart"));
  };

  const gesture = Gesture.Simultaneous(
    Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        pinchStart.current = zoom;
      })
      .onUpdate((e) =>
        setZoom(Math.min(MAX_ZOOM, Math.max(1, pinchStart.current * e.scale))),
      ),
    Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(() => setZoom(1)),
  );

  const slug = title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  const exportFile = async (format: "png" | "csv") => {
    try {
      const result =
        format === "png"
          ? await writeBinaryExport(
              `chart-${slug}`,
              "png",
              await captureRef(chartRef, { format: "png", result: "base64" }),
              "image/png",
            )
          : await writeTextExport(
              `chart-${slug}`,
              "csv",
              toCsv(model.visible, `${title}${unit}`),
              "text/csv",
            );
      showToast(`Chart ${DESTINATION_TEXT[result.destination]}`);
    } catch (error) {
      captureException(error, { op: "chartExport", format });
      showToast("Couldn't export the chart");
    }
  };

  const chips = <T extends string>(
    options: readonly T[],
    current: T | undefined,
    onPick: (value: T) => void,
    label: (value: T) => string = (v) => v,
  ) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => (
        <Chip key={option} label={label(option)} selected={option === current} onPress={() => onPick(option)} />
      ))}
    </ScrollView>
  );

  const stepper = (
    label: string,
    value: number,
    onChange: (next: number) => void,
    min: number,
    max: number,
  ) => (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Stepper label={label} value={value} onChange={onChange} min={min} max={max} />
    </View>
  );

  const toggle = (label: string, value: boolean, key: keyof ChartSettings) => (
    <Chip label={label} selected={value} onPress={() => update({ [key]: !value })} accessibilityRole='switch' />
  );

  const field = (
    label: string,
    value: string | number | undefined,
    onCommit: (text: string) => void,
    placeholder: string,
    numeric = true,
    autoFocus = false,
  ) => (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        key={String(value ?? "")}
        style={styles.input}
        defaultValue={value == null ? "" : String(value)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={numeric ? "decimal-pad" : "numbers-and-punctuation"}
        onEndEditing={(e) => onCommit(e.nativeEvent.text)}
        autoFocus={autoFocus}
        accessibilityLabel={label}
      />
    </View>
  );

  const chartHeight = landscape ? Math.max(140, height * 0.55) : 300;
  const chartWidth = width - insets.left - insets.right - 24;

  return (
    <Modal
      visible={visible}
      onRequestClose={onClose}
      animationType='slide'
      supportedOrientations={["portrait", "landscape"]}
    >
      <GestureHandlerRootView
        style={[
          styles.screen,
          {
            paddingTop: insets.top + 8,
            paddingLeft: insets.left + 12,
            paddingRight: insets.right + 12,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={rotate}
            accessibilityLabel={landscape ? "Rotate to portrait" : "Rotate to landscape"}
          >
            <Text style={styles.iconText}>⟳</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            accessibilityLabel='Close chart'
          >
            <Text style={styles.iconText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          keyboardShouldPersistTaps='handled'
        >
          {chips(CHART_RANGES, settings.range, (range) => update({ range }), (r) => RANGE_LABELS[r])}
          {settings.range === "custom" && (
            <View style={styles.row}>
              {field("From", settings.customFrom, (t) => update({ customFrom: t.trim() || undefined }), "YYYY-MM-DD", false)}
              {field("To", settings.customTo, (t) => update({ customTo: t.trim() || undefined }), "YYYY-MM-DD", false)}
            </View>
          )}

          <GestureDetector gesture={gesture}>
            <View ref={chartRef} collapsable={false} style={styles.chartWrap}>
              {model.visible.length === 0 ? (
                <View style={[styles.empty, { height: chartHeight }]}>
                  <Text style={styles.emptyText}>No data in this range</Text>
                </View>
              ) : (
                <ChartView
                  model={model}
                  settings={settings}
                  width={chartWidth}
                  height={chartHeight}
                  suffix={suffix}
                  zoom={zoom}
                  selected={selected}
                  onSelect={setSelected}
                />
              )}
            </View>
          </GestureDetector>
          <Text style={styles.hint}>
            Pinch to zoom, double tap to reset. Tap a point for details.
          </Text>

          {selectedPoint && (
            <View style={styles.selection}>
              <Text style={styles.selectionText}>
                {formatDate(selectedPoint.date)}: {fmt(selectedPoint.value)}
              </Text>
              {onPointPress && !model.projected && (
                <Button
                  label='Open'
                  variant='quiet'
                  size='sm'
                  onPress={() => {
                    onClose();
                    onPointPress(selectedPoint);
                  }}
                />
              )}
            </View>
          )}

          {stats && (
            <View style={styles.stats}>
              {[
                ["Min", fmt(stats.min)],
                ["Max", fmt(stats.max)],
                ["Average", fmt(stats.average)],
                ["Change", `${stats.change > 0 ? "+" : ""}${fmt(stats.change)}`],
              ].map(([label, value]) => (
                <View key={label} style={styles.stat}>
                  <Text style={styles.statLabel}>{label}</Text>
                  <Text style={styles.statValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.section}>Goal</Text>
          <View style={styles.row}>
            {field(`Goal${unit}`, settings.goal, (t) => update({ goal: parseNumber(t) }), "None", true, focusGoal)}
          </View>
          <Text style={styles.hint}>
            {settings.goal == null
              ? "Set a goal to see when you'll reach it at your current rate."
              : goalMessage(model.eta, settings.goal, fmt)}
          </Text>
          {model.eta && settings.kind !== "bar" && (
            <View style={styles.wrapRow}>{toggle("Show projection", model.projected, "projection")}</View>
          )}

          {metrics && metrics.length > 1 && (
            <>
              <Text style={styles.section}>Metric</Text>
              {chips(
                metrics.map((m) => m.key),
                settings.metric ?? metrics[0].key,
                (metric) => update({ metric }),
                (key) => metrics.find((m) => m.key === key)?.label ?? key,
              )}
            </>
          )}

          <Text style={styles.section}>Chart type</Text>
          {chips(["line", "area", "bar"] as const, settings.kind, (kind) => update({ kind }), (k) => k[0].toUpperCase() + k.slice(1))}
          <View style={styles.wrapRow}>
            {toggle("Dots", settings.showDots, "showDots")}
            {toggle("Raw points", settings.showRaw, "showRaw")}
            {toggle("Records", settings.showPRs, "showPRs")}
          </View>

          <Text style={styles.section}>Y axis</Text>
          {chips(
            ["auto", "zero", "manual"] as const,
            settings.yAxis,
            (yAxis) => update({ yAxis }),
            (m) => ({ auto: "Fit data", zero: "From zero", manual: "Manual" })[m],
          )}
          {settings.yAxis === "manual" && (
            <View style={styles.row}>
              {field("Min", settings.yMin, (t) => update({ yMin: parseNumber(t) }), "0")}
              {field("Max", settings.yMax, (t) => update({ yMax: parseNumber(t) }), "100")}
            </View>
          )}

          <Text style={styles.section}>Labels</Text>
          {stepper("X labels", settings.xLabels, (xLabels) => update({ xLabels }), 2, 20)}
          {stepper("Font size", settings.fontSize, (fontSize) => update({ fontSize }), 8, 18)}

          <Text style={styles.section}>Trend</Text>
          {chips(
            ["off", "ma7", "ema"] as const,
            settings.trend,
            (trend) => update({ trend }),
            (t) => ({ off: "Off", ma7: "7 day average", ema: "Smoothed" })[t],
          )}

          {settings.kind !== "bar" && (
            <>
              <Text style={styles.section}>Compare</Text>
              {chips(
                ["off", "previous", "lastYear"] as const,
                settings.compare,
                (compare) => update({ compare }),
                (c) => ({ off: "Off", previous: "Previous period", lastYear: "Last year" })[c],
              )}
            </>
          )}

          <View style={styles.wrapRow}>
            <Button label='Save image' variant='quiet' size='sm' onPress={() => exportFile("png")} />
            <Button label='Export CSV' variant='quiet' size='sm' onPress={() => exportFile("csv")} />
            <Button
              label='Reset'
              variant='quiet'
              size='sm'
              onPress={() => {
                reset();
                setZoom(1);
              }}
            />
          </View>
        </ScrollView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    title: { flex: 1, fontSize: 20, fontWeight: "bold", color: colors.textPrimary },
    iconButton: { padding: 10, marginLeft: 4 },
    iconText: { fontSize: 22, color: colors.textPrimary },
    chartWrap: { marginTop: 12, backgroundColor: colors.background },
    empty: {
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surfaceElevated,
    },
    emptyText: { color: colors.textSecondary },
    hint: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
    selection: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
      padding: 10,
      borderRadius: 12,
      backgroundColor: colors.surfaceElevated,
    },
    selectionText: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    stats: { flexDirection: "row", marginTop: 12 },
    stat: { flex: 1, alignItems: "center" },
    statLabel: { color: colors.textSecondary, fontSize: 12 },
    statValue: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
    section: {
      color: colors.textPrimary,
      fontWeight: "bold",
      marginTop: 18,
      marginBottom: 8,
    },
    row: { flexDirection: "row", alignItems: "center", marginTop: 6 },
    wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    chipRow: { gap: 8 },
    label: { flex: 1, color: colors.textPrimary },
    field: { flex: 1, marginRight: 8 },
    fieldLabel: { color: colors.textSecondary, fontSize: 12, marginBottom: 4 },
    input: {
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
      color: colors.textPrimary,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
  });
