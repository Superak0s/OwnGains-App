import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React, { useState } from "react";
import { Text, View } from "react-native";
import ProgressChart from "@shared/components/ProgressChart";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import { CycleSettingsWidget } from "../tabs/MenstrualTab";
import {
  getCycleDuration,
  getCyclePhaseLabel,
  computeUpcomingPredictedDays,
  cycleLengthPoints,
  formatDateLabel,
  toTrendPoints,
} from "../utils";
import { toDateString } from "@utils/format";
import type { MenstrualEntry } from "../services/types";
import { Button, Metric, Note, Placeholder, Row, space, useUi } from "../ui";

interface MenstrualRenderCtx {
  entries: MenstrualEntry[];
  prefs: { periodLengthDays: number; cycleLengthDays: number };
  setPrefs: (p: { periodLengthDays: number; cycleLengthDays: number }) => void;
  actualDays: Set<string>;
  predictedDays: Set<string>;
  setPredictedDays: (s: Set<string>) => void;
  openCycleModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  hasDataOnDate: (date: Date) => boolean;
  isOnPeriod: boolean;
  markPeriodOver: () => void;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

function MenstrualHistoryList({
  entries,
  prefs,
  isOnPeriod,
}: {
  readonly entries: MenstrualEntry[];
  readonly prefs: MenstrualRenderCtx["prefs"];
  readonly isOnPeriod: boolean;
}) {
  const [expandedCycleIds, setExpandedCycleIds] = useState<Set<string>>(
    new Set(),
  );
  const { ui, colors } = useUi();

  function toggleExpandedCycle(id: string) {
    setExpandedCycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (entries.length === 0)
    return <Placeholder text='No cycles recorded yet.' />;

  return (
    <View>
      {entries.map((c, i) => {
        const entryKey = String(c.id ?? i);
        const isExpanded = expandedCycleIds.has(entryKey);
        const startIso = c.cycleStart;
        const startDateLabel = formatDateLabel(startIso);
        const stillOngoing = i === 0 && isOnPeriod;
        const durationLabel = `${getCycleDuration(c)} days`;
        const phase =
          i === 0
            ? getCyclePhaseLabel(
                startIso,
                prefs.periodLengthDays,
                prefs.cycleLengthDays,
              )
            : null;
        return (
          <View key={entryKey}>
            <Row
              title={startDateLabel}
              meta={stillOngoing ? "Ongoing" : durationLabel}
              dot={colors.error}
              last={i === entries.length - 1 && !isExpanded}
              onPress={() => toggleExpandedCycle(entryKey)}
              right={
                <Text
                  style={[
                    ui.rowMeta,
                    { color: colors.accent, fontWeight: "600" },
                  ]}
                >
                  {isExpanded ? "Hide" : "Details"}
                </Text>
              }
            />
            {isExpanded && (
              <View
                style={{
                  paddingBottom: space.md,
                  paddingLeft: space.lg,
                  gap: 4,
                }}
              >
                {phase ? <Text style={ui.rowMeta}>Phase: {phase}</Text> : null}
                <Text style={ui.rowMeta}>Started {startDateLabel}</Text>
                {!stillOngoing && (
                  <Text style={ui.rowMeta}>Period length {durationLabel}</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function renderMenstrualWidget(
  type: string,
  ctx: MenstrualRenderCtx,
): React.ReactNode {
  const {
    entries,
    prefs,
    setPrefs,
    actualDays,
    predictedDays,
    setPredictedDays,
    openCycleModal,
    setSelectedLogDate,
    hasDataOnDate,
    isOnPeriod,
    markPeriodOver,
    colors,
    handleCalendarDatePress,
  } = ctx;
  const tone = colors.error;
  const openLog = () => {
    setSelectedLogDate(null);
    openCycleModal();
  };

  switch (type) {
    case "menstrual_overview": {
      if (entries.length === 0)
        return (
          <Placeholder
            text="Log a period start and we'll estimate the next one."
            action={{ label: "Log cycle", onPress: openLog, tone }}
          />
        );
      const lastStartIso = entries[0].cycleStart;
      const lastPhase =
        getCyclePhaseLabel(
          lastStartIso,
          prefs.periodLengthDays,
          prefs.cycleLengthDays,
        ) ?? "—";
      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Current phase'
            value={lastPhase}
            tone={tone}
            meta={`Started ${formatDateLabel(lastStartIso)}`}
          />
          <View
            style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}
          >
            <Button label='Log cycle' onPress={openLog} tone={tone} />
            {isOnPeriod && (
              <Button
                label='Period is over'
                onPress={markPeriodOver}
                variant='quiet'
                tone={tone}
              />
            )}
          </View>
        </View>
      );
    }

    case "menstrual_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={(date: Date) => {
            const ds = toDateString(date);
            return (
              actualDays.has(ds) || predictedDays.has(ds) || hasDataOnDate(date)
            );
          }}
          onDatePress={(date: Date) =>
            handleCalendarDatePress(date, "menstrual")
          }
          initialView='month'
          legendText={`Solid = logged · Faded = estimated from your ${prefs.cycleLengthDays}-day average, not a confirmed date`}
          dotColor={tone}
          getDayDecoration={(date: Date) => {
            const ds = toDateString(date);
            if (actualDays.has(ds))
              return {
                backgroundColor: tone,
                dotColor: "transparent",
                textColor: colors.textOnAccent,
              };
            if (predictedDays.has(ds))
              return { backgroundColor: `${tone}59`, dotColor: "transparent" };
            return null;
          }}
        />
      );

    case "menstrual_chart": {
      const lengths = cycleLengthPoints(entries);
      if (lengths.length <= 1)
        return (
          <Note>
            Log three period starts to see how your cycle length changes.
          </Note>
        );
      return (
        <ProgressChart
          chartId='cycle_length'
          points={toTrendPoints(lengths)}
          yAxisSuffix='d'
          fromZero={false}
        />
      );
    }

    case "menstrual_cycle":
      return (
        <View style={{ gap: space.md }}>
          <CycleSettingsWidget
            onSettingsUpdate={({ periodDays, cycleLengthDays }) => {
              setPrefs({ periodLengthDays: periodDays, cycleLengthDays });
              const mostRecentStartIso =
                entries.length > 0 ? entries[0].cycleStart : null;
              setPredictedDays(
                computeUpcomingPredictedDays(
                  mostRecentStartIso,
                  cycleLengthDays,
                  periodDays,
                ),
              );
            }}
          />
          <Button
            label='Log cycle today'
            onPress={() => {
              setSelectedLogDate(new Date());
              openCycleModal();
            }}
            tone={tone}
          />
        </View>
      );

    case "menstrual_history":
      return (
        <MenstrualHistoryList
          entries={entries}
          prefs={prefs}
          isOnPeriod={isOnPeriod}
        />
      );

    default:
      return <Note>Coming soon</Note>;
  }
}
