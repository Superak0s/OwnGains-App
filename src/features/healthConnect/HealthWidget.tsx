import React, { useCallback, useState } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { aggregateRecord, readRecords } from "react-native-health-connect";
import ProgressChart from "@shared/components/ProgressChart";
import { useAuth } from "@shared/context/AuthContext";
import { Metric, Placeholder } from "@features/tracking/ui";
import { toTrendPoints } from "@features/tracking/utils";
import type { ChartPoint } from "@shared/components/ProgressChart";
import { captureException } from "@shared/services/crashReporting";
import { loadHealthHistory, mergeHistory, readRecentDays, type DailyHealth } from "./dailyHealth";
import { getGrantedTypes, type HealthType } from "./healthConnect";
import type { HealthWidgetType } from "./widgets";

interface Reading {
  value: string;
  unit?: string;
  meta: string;
}

type Result = { kind: "metric"; reading: Reading } | { kind: "chart"; points: ChartPoint[] };

interface Reader {
  label: string;
  recordType: HealthType;
  empty: string;
  suffix?: string;
  read: (userId: string | null) => Promise<Result | null>;
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

const metric = (reading: Reading): Result => ({ kind: "metric", reading });

const trend = (
  recordType: HealthType,
  pick: (day: DailyHealth) => number | undefined,
) => async (userId: string | null): Promise<Result | null> => {
  const stored = userId ? await loadHealthHistory(userId) : {};
  const history = mergeHistory(stored, await readRecentDays([recordType]));
  const points = Object.entries(history).flatMap(([date, day]) => {
    const value = pick(day);
    return value == null ? [] : [{ at: `${date}T12:00:00`, value }];
  });
  return points.length ? { kind: "chart", points: toTrendPoints(points) } : null;
};

const READERS: Record<HealthWidgetType, Reader> = {
  health_steps: {
    label: "Steps",
    recordType: "Steps",
    empty: "No steps today",
    read: async () => {
      const result = await aggregateRecord({ recordType: "Steps", timeRangeFilter: today() });
      return metric({ value: result.COUNT_TOTAL.toLocaleString(), unit: "steps", meta: "Today" });
    },
  },
  health_heart_rate: {
    label: "Heart rate",
    recordType: "HeartRate",
    empty: "No heart rate data today",
    read: async () => {
      const result = await aggregateRecord({ recordType: "HeartRate", timeRangeFilter: today() });
      if (result.MEASUREMENTS_COUNT === 0) return null;
      return metric({
        value: String(Math.round(result.BPM_AVG)),
        unit: "bpm",
        meta: `Today · ${result.BPM_MIN} to ${result.BPM_MAX} bpm`,
      });
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
      return metric({ value: `${Math.floor(minutes / 60)}h ${minutes % 60}m`, meta: "Last night" });
    },
  },
  health_steps_trend: {
    label: "Steps",
    recordType: "Steps",
    empty: "No steps recorded yet",
    read: trend("Steps", (day) => day.steps),
  },
  health_heart_rate_trend: {
    label: "Heart rate",
    recordType: "HeartRate",
    empty: "No heart rate data yet",
    suffix: " bpm",
    read: trend("HeartRate", (day) => day.heartAvg),
  },
  health_sleep_trend: {
    label: "Sleep",
    recordType: "SleepSession",
    empty: "No sleep recorded yet",
    suffix: "h",
    read: trend("SleepSession", (day) =>
      day.sleepMinutes == null ? undefined : Math.round(day.sleepMinutes / 6) / 10,
    ),
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
  const userId = useAuth().user?.id ?? null;
  const [state, setState] = useState<"loading" | "denied" | "error" | Result | null>("loading");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async () => {
        try {
          const granted = await getGrantedTypes();
          const next = granted.includes(reader.recordType) ? await reader.read(userId) : "denied";
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
    }, [reader, userId]),
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
  if (state.kind === "chart") return (
      <ProgressChart chartId={type} defaultRange="3M" points={state.points} yAxisSuffix={reader.suffix} />
    );
  const { reading } = state;
  return <Metric label={reader.label} value={reading.value} unit={reading.unit} meta={reading.meta} />;
}
