import type { ThemeColors } from "@shared/context/ThemeContext";
import type { TrackingStyles } from "../styles";
import React from "react";
import { View } from "react-native";
import UniversalCalendar from "@shared/components/UniversalCalendar";
import type { SorenessEntry } from "../services/types";
import {
  DOMSFollowUpWidget,
  DOMSHeatmapWidget,
  InjuryTrackerWidget,
  MuscleMapWidget,
} from "../tabs/SorenessTab";
import { getSeverityColor } from "@utils/severityColor";
import {
  Button,
  IconButton,
  Metric,
  Note,
  Placeholder,
  Row,
  ShowMoreList,
  space,
} from "../ui";

interface SorenessRenderCtx {
  entries: SorenessEntry[];
  openSorenessModal: () => void;
  setSelectedLogDate: (date: Date | null) => void;
  deleteSorenessEntry: (entry: SorenessEntry) => void;
  hasDataOnDate: (date: Date) => boolean;
  colors: ThemeColors;
  styles: TrackingStyles;
  handleCalendarDatePress: (date: Date, type: string) => void;
}

export function renderSorenessWidget(
  type: string,
  ctx: SorenessRenderCtx,
): React.ReactNode {
  const {
    entries,
    openSorenessModal,
    setSelectedLogDate,
    deleteSorenessEntry,
    hasDataOnDate,
    colors,
    handleCalendarDatePress,
  } = ctx;
  const tone = colors.warning;
  const openLog = () => {
    setSelectedLogDate(null);
    openSorenessModal();
  };

  switch (type) {
    case "soreness_map": {
      if (entries.length === 0)
        return (
          <Placeholder
            text='Log how sore a muscle feels and track how fast it recovers.'
            action={{ label: "Log soreness", onPress: openLog, tone }}
          />
        );
      const last = entries[0];
      const lastIntensity = Number(last.intensity ?? 0);
      return (
        <View style={{ gap: space.md }}>
          <Metric
            label='Most recent'
            value={last.muscleGroup ?? "—"}
            unit={`${lastIntensity}/10`}
            tone={getSeverityColor(lastIntensity, 3)}
            meta={new Date(last.loggedAt).toLocaleDateString()}
          />
          <Button label='Log soreness' onPress={openLog} tone={tone} />
        </View>
      );
    }

    case "soreness_calendar":
      return (
        <UniversalCalendar
          hasDataOnDate={hasDataOnDate}
          onDatePress={(date: Date) =>
            handleCalendarDatePress(date, "soreness")
          }
          initialView='month'
          legendText='Soreness logged · tap any day to view or add'
          dotColor={tone}
        />
      );

    case "soreness_history": {
      if (entries.length === 0)
        return <Placeholder text='No soreness logged yet.' />;
      return (
        <ShowMoreList
          items={entries}
          renderItem={(s, i, isLast) => {
            const val = Number(s.intensity ?? 0);
            return (
              <Row
                key={s.id ?? i}
                title={s.muscleGroup ?? "—"}
                meta={new Date(s.loggedAt).toLocaleDateString()}
                value={`${val}/10`}
                dot={getSeverityColor(val, 3)}
                last={isLast}
                right={
                  <IconButton
                    glyph='🗑'
                    label='Delete soreness entry'
                    tone='danger'
                    onPress={() => deleteSorenessEntry(s)}
                  />
                }
              />
            );
          }}
        />
      );
    }

    case "muscle_map":
      return <MuscleMapWidget />;
    case "doms_followup":
      return <DOMSFollowUpWidget />;
    case "doms_heatmap":
      return <DOMSHeatmapWidget />;
    case "injury_tracker":
      return <InjuryTrackerWidget />;

    default:
      return <Note>Coming soon</Note>;
  }
}
