import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type MeasurementsWidgetType =
  | "measurements_overview"
  | "measurements_calendar"
  | "measurements_history"
  | "measurements_chart";

export const MEASUREMENTS_WIDGET_REGISTRY: Record<
  MeasurementsWidgetType,
  WidgetDefinition<MeasurementsWidgetType>
> = {
  measurements_overview: {
    type: "measurements_overview",
    title: "Latest Measurements",
    description: "Your latest body measurements (waist, arms, chest)",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  measurements_calendar: {
    type: "measurements_calendar",
    title: "Measurements Calendar",
    description: "Calendar view of days you've logged measurements",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  measurements_history: {
    type: "measurements_history",
    title: "Measurements History",
    description: "Your recent measurement entries",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  measurements_chart: {
    type: "measurements_chart",
    title: "Measurements Trend Chart",
    description: "Line chart of one body measurement over time",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_MEASUREMENTS_WIDGETS = toDefaultWidgets(
  MEASUREMENTS_WIDGET_REGISTRY,
  [
    "measurements_overview",
    "measurements_chart",
    "measurements_calendar",
    "measurements_history",
  ],
);

export const MEASUREMENTS_TAB_CONFIG = {
  key: "measurements",
  label: "Measurements",
};
