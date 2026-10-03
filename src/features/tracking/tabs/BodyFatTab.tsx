import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type BodyFatWidgetType =
  | "bodyfat_height"
  | "bodyfat_calendar"
  | "bodyfat_latest";

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
};

export const DEFAULT_BODYFAT_WIDGETS = toDefaultWidgets(
  BODYFAT_WIDGET_REGISTRY,
  ["bodyfat_height", "bodyfat_calendar", "bodyfat_latest"],
);

export const BODYFAT_TAB_CONFIG = {
  key: "bodyfat",
  label: "Body Fat",
};
