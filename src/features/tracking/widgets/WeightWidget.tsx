import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { View } from "react-native";
import ProgressChart from "@shared/components/ProgressChart";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { WeightEntry } from "@shared/types";
import {
  Button,
  Chip,
  IconButton,
  Metric,
  Note,
  Placeholder,
  Row,
  space,
  useUi,
} from "../ui";

interface WeightRenderCtx {
  history: WeightEntry[];
  weightUnit: string;
  entriesShown: number;
  trendAverageDays: number;
  setTrendAverageDays: (d: number) => void;
  trend: {
    direction: string;
    diff: number;
    percentChange: number;
  } | null;
  chartData: { labels: string[]; datasets: { data: number[] }[] };
  loadMoreEntries: () => void;
  deleteWeightEntry: (entry: WeightEntry) => void;
  openWeightModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

function toDisplayWeight(
  weightKg: WeightEntry["weightKg"],
  unit: string,
): string {
  const kg = Number(weightKg);
  return unit === "kg" ? kg.toFixed(1) : (kg * 2.20462).toFixed(1);
}

const TREND_WINDOWS = [3, 7, 14, 30];

function WeightOverview({
  ctx,
}: {
  readonly ctx: WeightRenderCtx;
}): React.ReactElement {
  const {
    history,
    weightUnit,
    trend,
    trendAverageDays,
    setTrendAverageDays,
    openWeightModal,
    setSelectedLogDate,
  } = ctx;
  const { ui } = useUi();

  const openLog = () => {
    setSelectedLogDate(null);
    openWeightModal();
  };

  if (history.length === 0)
    return (
      <Placeholder
        text='Log your first weigh-in to start tracking the trend.'
        action={{ label: "Log weight", onPress: openLog }}
      />
    );

  const direction =
    trend?.direction === "up" || trend?.direction === "down"
      ? trend.direction
      : "flat";

  return (
    <View style={{ gap: space.md }}>
      <Metric
        label='Current weight'
        value={toDisplayWeight(history[0].weightKg, weightUnit)}
        unit={weightUnit}
        meta={new Date(history[0].recordedAt).toLocaleDateString()}
        delta={
          trend
            ? {
                direction,
                text: `${Math.abs(trend.diff).toFixed(1)} ${weightUnit} (${trend.percentChange > 0 ? "+" : ""}${trend.percentChange.toFixed(1)}%) vs ${trendAverageDays}-day average`,
              }
            : undefined
        }
      />
      {trend && (
        <View style={ui.chipRow}>
          {TREND_WINDOWS.map((days) => (
            <Chip
              key={days}
              label={`${days}d`}
              selected={trendAverageDays === days}
              onPress={() => setTrendAverageDays(days)}
            />
          ))}
        </View>
      )}
      <Button label='Log weight' onPress={openLog} />
    </View>
  );
}

function renderWeightHistory(ctx: WeightRenderCtx): React.ReactNode {
  const {
    history,
    weightUnit,
    entriesShown,
    loadMoreEntries,
    deleteWeightEntry,
  } = ctx;

  if (history.length === 0)
    return <Note>Log two weigh-ins and your history shows up here.</Note>;

  const shown = history.slice(0, entriesShown);
  return (
    <View>
      {shown.map((entry, index) => {
        const recordedAt = new Date(entry.recordedAt);
        return (
          <Row
            key={entry.id ?? index}
            title={recordedAt.toLocaleDateString([], {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
            meta={
              index === 0
                ? `Latest · ${recordedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : recordedAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
            }
            value={`${toDisplayWeight(entry.weightKg, weightUnit)} ${weightUnit}`}
            last={index === shown.length - 1 && entriesShown >= history.length}
            right={
              <IconButton
                glyph='🗑'
                label='Delete weight entry'
                tone='danger'
                onPress={() => deleteWeightEntry(entry)}
              />
            }
          />
        );
      })}
      {entriesShown < history.length && (
        <Button
          label={`Show ${history.length - entriesShown} older`}
          onPress={loadMoreEntries}
          variant='quiet'
          size='sm'
          style={{ marginTop: space.md }}
        />
      )}
    </View>
  );
}

export function renderWeightWidget(
  type: string,
  ctx: WeightRenderCtx,
): React.ReactNode {
  const {
    history,
    weightUnit,
    chartData,
    hasDataOnDate,
    colors,
    handleCalendarDatePress,
  } = ctx;

  switch (type) {
    case "weight_overview":
      return <WeightOverview ctx={ctx} />;

    case "weight_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) => handleCalendarDatePress(date, "weight")}
          initialView='month'
          legendText='Weight logged · tap any day to view or add'
          dotColor={colors.accent}
        />
      );

    case "weight_history":
      return renderWeightHistory(ctx);

    case "weight_chart":
      if (history.length <= 1)
        return (
          <Note>
            Two weigh-ins are enough to draw a trend. You have {history.length}.
          </Note>
        );
      return <ProgressChart data={chartData} yAxisSuffix={weightUnit} />;

    default:
      return <Note>Coming soon</Note>;
  }
}
