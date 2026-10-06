import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { View } from "react-native";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { MeasurementEntry } from "../services/types";
import {
  Button,
  IconButton,
  Note,
  Placeholder,
  Row,
  ShowMoreList,
  SectionLabel,
  space,
} from "../ui";

interface MeasurementRenderCtx {
  history: MeasurementEntry[];
  openMeasurementModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  deleteMeasurementEntry: (entry: MeasurementEntry) => void;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

const SITES = [
  { key: "chestCm", label: "Chest" },
  { key: "waistCm", label: "Waist" },
  { key: "armLeftCm", label: "Left arm" },
  { key: "armRightCm", label: "Right arm" },
] as const;

export function renderMeasurementWidget(
  type: string,
  ctx: MeasurementRenderCtx,
): React.ReactNode {
  const {
    history,
    openMeasurementModal,
    setSelectedLogDate,
    deleteMeasurementEntry,
    hasDataOnDate,
    colors,
    handleCalendarDatePress,
  } = ctx;
  const tone = colors.success;
  const openLog = () => {
    setSelectedLogDate(null);
    openMeasurementModal();
  };

  switch (type) {
    case "measurements_overview": {
      if (history.length === 0)
        return (
          <Placeholder
            text='Tape measurements catch progress the scale misses.'
            action={{ label: "Log measurements", onPress: openLog, tone }}
          />
        );
      const latest = history[0];
      return (
        <View style={{ gap: space.md }}>
          <SectionLabel>
            Latest · {new Date(latest.measuredAt).toLocaleDateString()}
          </SectionLabel>
          <View>
            {SITES.map((site, i) => (
              <Row
                key={site.key}
                title={site.label}
                value={
                  latest[site.key] == null ? "—" : `${latest[site.key]} cm`
                }
                dot={tone}
                last={i === SITES.length - 1}
              />
            ))}
          </View>
          <Button label='Log measurements' onPress={openLog} tone={tone} />
        </View>
      );
    }

    case "measurements_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) =>
            handleCalendarDatePress(date, "measurements")
          }
          initialView='month'
          legendText='Measurements logged · tap any day to view or add'
          dotColor={tone}
        />
      );

    case "measurements_history": {
      if (history.length === 0)
        return (
          <Placeholder
            text='No measurements recorded yet.'
            action={{ label: "Log measurements", onPress: openLog, tone }}
          />
        );
      return (
        <ShowMoreList
          items={history}
          renderItem={(entry, index, isLast) => (
            <Row
              key={entry.id ?? index}
              title={new Date(entry.measuredAt).toLocaleDateString([], {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
              meta={`Waist ${Number(entry.waistCm ?? 0).toFixed(1)} cm · Chest ${Number(entry.chestCm ?? 0).toFixed(1)} cm`}
              dot={tone}
              last={isLast}
              right={
                <IconButton
                  glyph='🗑'
                  label='Delete measurement entry'
                  tone='danger'
                  onPress={() => deleteMeasurementEntry(entry)}
                />
              }
            />
          )}
        />
      );
    }

    default:
      return <Note>Coming soon</Note>;
  }
}
