import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { Text, View } from "react-native";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { DailyMacrosStats } from "../hooks/useMacrosTab";
import { Bar, Button, Metric, Note, Placeholder, space } from "../ui";

interface MacrosRenderCtx {
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
      if (!dailyStats)
        return (
          <View style={{ gap: space.md }}>
            <Placeholder
              text={`Nothing logged today. Your goal is ${goals.calories} kcal.`}
              action={{ label: "Log macros", onPress: openLog, tone }}
            />
            <Button
              label='Change goals'
              onPress={openGoalModal}
              variant='quiet'
              size='sm'
              tone={tone}
            />
          </View>
        );

      const rows = (
        [
          { key: "calories", label: "Calories", unit: "kcal", color: tone },
          { key: "protein", label: "Protein", unit: "g", color: colors.accent },
          { key: "carbs", label: "Carbs", unit: "g", color: colors.success },
          { key: "fat", label: "Fat", unit: "g", color: colors.error },
        ] as const
      ).filter(({ key }) => dailyStats[key] != null);

      const calories = dailyStats.calories;
      const protein = dailyStats.protein;

      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Eaten today'
            value={calories ? calories.total.toFixed(0) : "0"}
            unit={`of ${goals.calories} kcal`}
            tone={tone}
            meta={`${dailyStats.entries} ${dailyStats.entries === 1 ? "entry" : "entries"}${
              protein && calories && calories.total > 0
                ? ` · ${((protein.total / calories.total) * 100).toFixed(1)}g protein per 100 kcal`
                : ""
            }`}
          />

          <View>
            {rows.map(({ key, label, unit, color }) => {
              const macro = dailyStats[key]!;
              return (
                <View key={key} style={styles.macroRow}>
                  <View style={styles.macroLabelRow}>
                    <Text style={styles.macroLabel}>{label}</Text>
                    <Text style={styles.macroValue}>
                      {macro.total.toFixed(0)}
                      {unit}
                      <Text style={styles.macroRange}>
                        {"  "}
                        {macro.min.toFixed(0)}-{macro.max.toFixed(0)}
                      </Text>
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
