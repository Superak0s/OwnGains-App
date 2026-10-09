import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { Text, View } from "react-native";
import ProgressChart from "@shared/components/ProgressChart";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { DailyMacrosStats } from "../hooks/useMacrosTab";
import type { MacrosEntryWithFields } from "../types";
import {
  formatDateLabel,
  toDailyTotalPoints,
  formatRange,
} from "../utils";
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

interface MacrosRenderCtx {
  entries: MacrosEntryWithFields[];
  deleteMacroEntry: (entry: MacrosEntryWithFields) => void;
  goals: { calories: number; protein: number; carbs: number; fat: number };
  openMacrosModal: () => void;
  openGoalModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  dailyStats: DailyMacrosStats | null;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

export function renderMacrosWidget(
  type: string,
  ctx: MacrosRenderCtx,
): React.ReactNode {
  const {
    entries,
    deleteMacroEntry,
    goals,
    openMacrosModal,
    openGoalModal,
    setSelectedLogDate,
    dailyStats,
    hasDataOnDate,
    colors,
    styles,
    handleCalendarDatePress,
  } = ctx;
  const tone = colors.warning;
  const openLog = () => {
    setSelectedLogDate(null);
    openMacrosModal();
  };

  switch (type) {
    case "macros_chart":
      if (entries.length === 0)
        return <Note>Log a meal and your daily calories show up here.</Note>;
      return (
        <ProgressChart
          chartType='bar'
          chartId='calories'
          defaultRange='1W'
          points={toDailyTotalPoints(
            entries.map((e) => ({
              at: e.date ?? e.loggedAt,
              value: Number(e.calories ?? 0),
            })),
          )}
          yAxisSuffix='kcal'
        />
      );

    case "macros_history":
      if (entries.length === 0)
        return (
          <Placeholder
            text='Nothing logged yet. Log a meal and it shows up here.'
            action={{ label: "Log macros", onPress: openLog, tone }}
          />
        );
      return (
        <ShowMoreList
          items={entries}
          renderItem={(e, i, isLast) => (
            <Row
              key={e.id ?? i}
              title={e.name || formatDateLabel(e.date ?? e.loggedAt)}
              meta={`${e.name ? `${formatDateLabel(e.date ?? e.loggedAt)} · ` : ""}P ${Number(e.protein ?? 0).toFixed(0)}g · C ${Number(e.carbs ?? 0).toFixed(0)}g · F ${Number(e.fat ?? 0).toFixed(0)}g`}
              value={`${Number(e.calories ?? 0).toFixed(0)} kcal`}
              dot={tone}
              last={isLast}
              right={
                <IconButton
                  glyph='🗑'
                  label='Delete macros entry'
                  tone='danger'
                  onPress={() => deleteMacroEntry(e)}
                />
              }
            />
          )}
        />
      );

    case "macros_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) => handleCalendarDatePress(date, "macros")}
          initialView='month'
          legendText='Macros logged · tap any day to view or add'
          dotColor={tone}
        />
      );

    case "macros_today": {
      const zero = (goal: number) => ({ total: 0, min: 0, max: 0, goal, percentage: 0 });
      const stats: DailyMacrosStats = dailyStats ?? {
        calories: zero(goals.calories),
        protein: zero(goals.protein),
        carbs: zero(goals.carbs),
        fat: zero(goals.fat),
        entries: 0,
        entriesList: [],
      };

      const rows = (
        [
          { key: "calories", label: "Calories", unit: "kcal", color: tone },
          { key: "protein", label: "Protein", unit: "g", color: colors.accent },
          { key: "carbs", label: "Carbs", unit: "g", color: colors.success },
          { key: "fat", label: "Fat", unit: "g", color: colors.error },
        ] as const
      ).filter(({ key }) => stats[key] != null);

      const calories = stats.calories;
      const protein = stats.protein;

      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Eaten today'
            value={calories ? calories.total.toFixed(0) : "0"}
            unit={`of ${goals.calories} kcal`}
            tone={tone}
            meta={`${stats.entries} ${stats.entries === 1 ? "entry" : "entries"}${
              protein && calories && calories.total > 0
                ? ` · ${((protein.total / calories.total) * 100).toFixed(1)}g protein per 100 kcal`
                : ""
            }`}
          />

          <View>
            {rows.map(({ key, label, unit, color }) => {
              const macro = stats[key]!;
              const range = formatRange(macro.min, macro.max);
              return (
                <View key={key} style={styles.macroRow}>
                  <View style={styles.macroLabelRow}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <Text style={styles.macroValue}>
                      {macro.total.toFixed(0)}
                      {unit}
                      {range && (
                        <Text style={styles.macroRange}>
                          {"  "}
                          {range}
                        </Text>
                      )}
                    </Text>
                  </View>
                  <Bar pct={macro.percentage} tone={color} />
                  <Text style={styles.macroProgressText}>
                    {macro.percentage.toFixed(0)}% of {macro.goal}
                    {unit}
                  </Text>
                </View>
              );
            })}
          </View>

          <View
            style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}
          >
            <Button label='Log macros' onPress={openLog} tone={tone} />
            <Button
              label='Change goals'
              onPress={openGoalModal}
              variant='quiet'
              tone={tone}
            />
          </View>
        </View>
      );
    }

    default:
      return <Note>Coming soon</Note>;
  }
}
