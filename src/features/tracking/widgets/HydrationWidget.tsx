import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { View } from "react-native";
import ProgressChart from "@shared/components/ProgressChart";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import { HydrationSettingsWidget } from "../tabs/HydrationTab";
import {
  formatDateLabel,
  formatRange,
  isoToLocalDateStr,
  toDailyTotalsChartData,
} from "../utils";
import type { HydrationEntry } from "../services/types";
import {
  Bar,
  Button,
  IconButton,
  Metric,
  Note,
  Placeholder,
  Row,
  ShowMoreList,
  space,
} from "../ui";

interface HydrationRenderCtx {
  entries: HydrationEntry[];
  goal: number;
  setGoal: (g: number) => void;
  openHydrationModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  deleteHydrationEntry: (entry: HydrationEntry) => void;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

export function renderHydrationWidget(
  type: string,
  ctx: HydrationRenderCtx,
): React.ReactNode {
  const {
    entries,
    goal,
    setGoal,
    openHydrationModal,
    setSelectedLogDate,
    deleteHydrationEntry,
    hasDataOnDate,
    colors,
    handleCalendarDatePress,
  } = ctx;
  const tone = colors.info;
  const openLog = () => {
    setSelectedLogDate(null);
    openHydrationModal();
  };

  switch (type) {
    case "hydration_overview": {
      const todayStr = isoToLocalDateStr(new Date().toISOString());
      const today = entries.filter(
        (h) => isoToLocalDateStr(h.loggedAt) === todayStr,
      );
      const totalToday = today.reduce(
        (s, e) => s + (Number(e.amountMl) || 0),
        0,
      );
      const errorToday = today.reduce(
        (s, e) =>
          s + ((Number(e.amountMl) || 0) * (Number(e.errorMargin) || 0)) / 100,
        0,
      );
      const pct = goal
        ? Math.min(100, Math.round((totalToday / goal) * 100))
        : 0;
      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Water today'
            value={String(totalToday)}
            unit={`of ${goal} ml`}
            tone={tone}
            range={formatRange(totalToday - errorToday, totalToday + errorToday)}
            meta={`${pct}% of your daily goal`}
          />
          <Bar pct={pct} tone={tone} />
          <Button label='Log water' onPress={openLog} tone={tone} />
        </View>
      );
    }

    case "hydration_chart":
      if (entries.length === 0)
        return <Note>Log some water and your daily totals show up here.</Note>;
      return (
        <ProgressChart
          chartType='bar'
          data={toDailyTotalsChartData(
            entries.map((h) => ({ at: h.loggedAt, value: Number(h.amountMl) })),
          )}
          yAxisSuffix='ml'
        />
      );

    case "hydration_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) =>
            handleCalendarDatePress(date, "hydration")
          }
          initialView='month'
          legendText='Water logged · tap any day to view or add'
          dotColor={tone}
        />
      );

    case "hydration_history": {
      if (entries.length === 0)
        return (
          <Placeholder
            text='Nothing logged yet. Add a glass and it shows up here.'
            action={{ label: "Log water", onPress: openLog, tone }}
          />
        );
      return (
        <ShowMoreList
          items={entries}
          renderItem={(h, i, isLast) => (
            <Row
              key={h.id ?? i}
              title={formatDateLabel(h.loggedAt)}
              value={`${Number(h.amountMl).toFixed(0)} ml`}
              dot={tone}
              last={isLast}
              right={
                <IconButton
                  glyph='🗑'
                  label='Delete water entry'
                  tone='danger'
                  onPress={() => deleteHydrationEntry(h)}
                />
              }
            />
          )}
        />
      );
    }

    case "hydration_goal":
      return (
        <HydrationSettingsWidget
          onSettingsUpdate={({ goalMl }: { goalMl: number }) => setGoal(goalMl)}
        />
      );

    default:
      return <Note>Coming soon</Note>;
  }
}
