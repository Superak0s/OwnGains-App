import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type WeightWidgetType =
  | "weight_overview"
  | "weight_calendar"
  | "weight_history"
  | "weight_chart";

export const WEIGHT_WIDGET_REGISTRY: Record<
  WeightWidgetType,
  WidgetDefinition<WeightWidgetType>
> = {
  weight_overview: {
    type: "weight_overview",
    title: "Current Weight",
    description: "Latest weigh-in, trend vs. average, and a quick log button",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  weight_calendar: {
    type: "weight_calendar",
    title: "Weight Calendar",
    description: "Calendar view of days you've logged weight",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  weight_history: {
    type: "weight_history",
    title: "Weight History",
    description: "Your recent weight entries, with delete and load-more",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  weight_chart: {
    type: "weight_chart",
    title: "Weight Trend Chart",
    description: "Line chart of your weight over time",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_WEIGHT_WIDGETS = toDefaultWidgets(WEIGHT_WIDGET_REGISTRY, [
  "weight_overview",
  "weight_calendar",
  "weight_history",
  "weight_chart",
]);

export const WEIGHT_TAB_CONFIG = {
  key: "weight",
  label: "Weight",
};
