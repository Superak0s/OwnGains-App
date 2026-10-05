import React, { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { aggregateRecord, readRecords } from "react-native-health-connect";
import { Metric, Placeholder } from "@features/tracking/ui";
import { captureException } from "@shared/services/crashReporting";
import { getGrantedTypes, type HealthType } from "./healthConnect";
import type { HealthWidgetType } from "./widgets";

interface Reading {
  value: string;
  unit?: string;
  meta: string;
}

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const today = () => ({
  operator: "between" as const,
  startTime: startOfToday().toISOString(),
  endTime: new Date().toISOString(),
});

const READERS: Record<
  HealthWidgetType,
  { label: string; recordType: HealthType; empty: string; read: () => Promise<Reading | null> }
> = {
  health_steps: {
    label: "Steps",
    recordType: "Steps",
    empty: "No steps today",
    read: async () => {
      const result = await aggregateRecord({ recordType: "Steps", timeRangeFilter: today() });
      return { value: result.COUNT_TOTAL.toLocaleString(), unit: "steps", meta: "Today" };
    },
  },
  health_heart_rate: {
    label: "Heart rate",
    recordType: "HeartRate",
    empty: "No heart rate data today",
    read: async () => {
      const result = await aggregateRecord({ recordType: "HeartRate", timeRangeFilter: today() });
      if (result.MEASUREMENTS_COUNT === 0) return null;
      return {
        value: String(Math.round(result.BPM_AVG)),
        unit: "bpm",
        meta: `Today · ${result.BPM_MIN} to ${result.BPM_MAX} bpm`,
      };
    },
  },
  health_sleep: {
    label: "Sleep",
    recordType: "SleepSession",
    empty: "No sleep recorded",
    read: async () => {
      const evening = startOfToday();
      evening.setHours(-6);
      const { records } = await readRecords("SleepSession", {
        timeRangeFilter: { operator: "between", startTime: evening.toISOString(), endTime: new Date().toISOString() },
      });
      const minutes = Math.round(
        records.reduce((sum, r) => sum + Date.parse(r.endTime) - Date.parse(r.startTime), 0) / 60_000,
      );
      if (minutes === 0) return null;
      return { value: `${Math.floor(minutes / 60)}h ${minutes % 60}m`, meta: "Last night" };
    },
  },
};

export default function HealthWidget({
  type,
  onOpenSettings,
}: {
  readonly type: HealthWidgetType;
  readonly onOpenSettings: () => void;
}): React.JSX.Element {
  const reader = READERS[type];
  const [state, setState] = useState<"loading" | "denied" | "error" | Reading | null>("loading");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const granted = await getGrantedTypes();
          const next = granted.includes(reader.recordType) ? await reader.read() : "denied";
          if (active) setState(next);
        } catch (error) {
          captureException(error, { feature: "healthConnect", recordType: reader.recordType });
          if (active) setState("error");
        }
      };
      void load();
      // Returning from the background, or from revoking access in Health
      // Connect, does not refocus the screen.
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") void load();
      });
      return () => {
        active = false;
        subscription.remove();
      };
    }, [reader]),
  );

  if (state === "loading") return <Placeholder text="Loading…" />;
  if (state === "denied")
    return (
      <Placeholder
        text={`Connect Health Connect in Settings to see ${reader.label.toLowerCase()}.`}
        action={{ label: "Open Settings", onPress: onOpenSettings }}
      />
    );
  if (state === "error") return <Placeholder text="Couldn't read from Health Connect." />;
  if (!state) return <Placeholder text={reader.empty} />;
  return <Metric label={reader.label} value={state.value} unit={state.unit} meta={state.meta} />;
}
