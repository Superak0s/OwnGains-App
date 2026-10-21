import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { View } from "react-native";
import ProgressChart from "@shared/components/ProgressChart";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { BodyFatEntryWithFields } from "../types";
import {
  Button,
  Metric,
  Note,
  Placeholder,
  Row,
  ShowMoreList,
  space,
} from "@shared/components/ui";
import {
  formatDateLabel,
  hasTapeMeasurements,
  monthLabel,
  signedTrend,
  toFeetInches,
  toTrendPoints,
} from "../utils";

interface BodyFatRenderCtx {
  history: BodyFatEntryWithFields[];
  height: { heightCm?: number } | null;
  heightUnit: string;
  openHeightModal: () => void;
  openBodyFatModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  deleteBodyFatEntry: (entry: BodyFatEntryWithFields) => void;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

const readingDate = (entry: BodyFatEntryWithFields) =>
  entry.date ?? entry.recordedAt ?? entry.calculatedAt;

const readingPercent = (entry: BodyFatEntryWithFields) =>
  Number(entry.percentage ?? entry.bodyFatPercentage ?? 0);

function renderHeight({ height, heightUnit, openHeightModal }: BodyFatRenderCtx) {
  const heightCm = height?.heightCm;
  if (!heightCm)
    return (
      <Placeholder
        text="Body fat is calculated from your height. Add it once and you're set."
        action={{ label: "Add height", onPress: openHeightModal }}
      />
    );

  const imperial = toFeetInches(heightCm);
  const metric = heightUnit === "cm";
  return (
    <View style={{ gap: space.md }}>
      <Metric
        label='Height'
        value={metric ? heightCm.toFixed(1) : `${imperial.feet}′ ${imperial.inches}″`}
        unit={metric ? "cm" : undefined}
        meta='Used to calculate your body fat percentage'
      />
      <Button
        label='Change height'
        onPress={openHeightModal}
        variant='quiet'
        size='sm'
      />
    </View>
  );
}

export function renderBodyFatWidget(
  type: string,
  ctx: BodyFatRenderCtx,
): React.ReactNode {
  const {
    history,
    openBodyFatModal,
    setSelectedLogDate,
    deleteBodyFatEntry,
    hasDataOnDate,
    colors,
    handleCalendarDatePress,
  } = ctx;

  switch (type) {
    case "bodyfat_height":
      return renderHeight(ctx);

    case "bodyfat_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) => handleCalendarDatePress(date, "bodyfat")}
          initialView='month'
          legendText='Measurement taken · tap any day to view or add'
          dotColor={colors.accent}
        />
      );

    case "bodyfat_latest": {
      const latest = history[0];
      if (!latest)
        return (
          <Placeholder
            text="Take a few tape measurements and we'll work out your body fat."
            action={{
              label: "Calculate body fat",
              onPress: () => {
                setSelectedLogDate(null);
                openBodyFatModal();
              },
            }}
          />
        );

      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Latest reading'
            value={readingPercent(latest).toFixed(1)}
            unit='%'
            meta={`${hasTapeMeasurements(latest) ? "US Navy method" : "Health Connect"} · ${new Date(
              readingDate(latest) ?? "",
            ).toLocaleDateString()}`}
          />
          <View
            style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}
          >
            <Button
              label='Calculate again'
              onPress={() => {
                setSelectedLogDate(null);
                openBodyFatModal();
              }}
            />
            <Button
              label='Delete reading'
              onPress={() => deleteBodyFatEntry(latest)}
              variant='danger'
            />
          </View>
        </View>
      );
    }

    case "bodyfat_chart":
      if (history.length <= 1)
        return (
          <Note>
            Two readings are enough to draw a trend. You have {history.length}.
          </Note>
        );
      return (
        <ProgressChart
          chartId='bodyfat'
          points={toTrendPoints(
            history.map((e) => ({ at: readingDate(e), value: readingPercent(e) })),
          )}
          yAxisSuffix='%'
          fromZero={false}
        />
      );

    case "bodyfat_history":
      if (history.length === 0)
        return <Note>Your body fat readings show up here.</Note>;
      return (
        <ShowMoreList
          items={history}
          groupBy={(entry) => monthLabel(readingDate(entry))}
          renderItem={(entry, i, isLast) => {
            const older = history[i + 1];
            return (
              <Row
                title={formatDateLabel(readingDate(entry))}
                meta={hasTapeMeasurements(entry) ? "US Navy method" : "Health Connect"}
                value={`${readingPercent(entry).toFixed(1)} %`}
                trend={
                  older
                    ? signedTrend(readingPercent(entry) - readingPercent(older), colors)
                    : undefined
                }
                last={isLast}
                onDelete={() => deleteBodyFatEntry(entry)}
                deleteLabel='Delete body fat reading'
              />
            );
          }}
        />
      );

    default:
      return <Note>Coming soon</Note>;
  }
}
