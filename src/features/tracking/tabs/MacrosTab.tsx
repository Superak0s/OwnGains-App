import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type MacrosWidgetType = "macros_calendar" | "macros_today";

export const MACROS_WIDGET_REGISTRY: Record<
  MacrosWidgetType,
  WidgetDefinition<MacrosWidgetType>
> = {
  macros_calendar: {
    type: "macros_calendar",
    title: "Macros Calendar",
    description: "Calendar view of days you've logged macros",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  macros_today: {
    type: "macros_today",
    title: "Today's Macros",
    description: "Today's nutrition intake vs. your goals, with quick log",
    availableSizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_MACROS_WIDGETS = toDefaultWidgets(MACROS_WIDGET_REGISTRY, [
  "macros_today",
  "macros_calendar",
]);

export const MACROS_TAB_CONFIG = {
  key: "macros",
  label: "Macros",
};
