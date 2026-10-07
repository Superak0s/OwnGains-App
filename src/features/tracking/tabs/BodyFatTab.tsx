import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type BodyFatWidgetType =
  | "bodyfat_height"
  | "bodyfat_calendar"
  | "bodyfat_latest"
  | "bodyfat_chart"
  | "bodyfat_history";

export const BODYFAT_WIDGET_REGISTRY: Record<
  BodyFatWidgetType,
  WidgetDefinition<BodyFatWidgetType>
> = {
  bodyfat_height: {
    type: "bodyfat_height",
    title: "Height",
    description: "Your height, used for the body fat calculation",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  bodyfat_calendar: {
    type: "bodyfat_calendar",
    title: "Body Fat Calendar",
    description: "Calendar view of days you've taken a body fat measurement",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  bodyfat_latest: {
    type: "bodyfat_latest",
    title: "Body Fat %",
    description: "Your latest body fat measurement, with quick calculate",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  bodyfat_chart: {
    type: "bodyfat_chart",
    title: "Body Fat Trend Chart",
    description: "Line chart of your body fat percentage over time",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  bodyfat_history: {
    type: "bodyfat_history",
    title: "Body Fat History",
    description: "Your past body fat readings",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_BODYFAT_WIDGETS = toDefaultWidgets(
  BODYFAT_WIDGET_REGISTRY,
  [
    "bodyfat_latest",
    "bodyfat_chart",
    "bodyfat_calendar",
    "bodyfat_history",
    "bodyfat_height",
  ],
);

export const BODYFAT_TAB_CONFIG = {
  key: "bodyfat",
  label: "Body Fat",
};
