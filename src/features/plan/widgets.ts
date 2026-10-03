// Plan-screen-specific widget config. The widget *placement/drag* system
// (WidgetsPanel, WidgetGallery, useWidgets) is shared across every screen
// that hosts widgets, but the actual set of widgets (their type union,
// copy, icons, default sizes, and starting layout) is defined per screen.

import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type PlanWidgetType =
  | "build_plan"
  | "select_split"
  | "muscle_frequency"
  | "view_program";

export const PLAN_WIDGET_REGISTRY: Record<
  PlanWidgetType,
  WidgetDefinition<PlanWidgetType>
> = {
  build_plan: {
    type: "build_plan",
    title: "Build your plan",
    description:
      "Start a split from scratch, import a spreadsheet, or pick a ready-made template",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  select_split: {
    type: "select_split",
    title: "Your splits",
    description:
      "Pick the split you're training, see its weekly volume, and export your program",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  muscle_frequency: {
    type: "muscle_frequency",
    title: "Weekly volume",
    description:
      "Sets each muscle gets per week. A primary muscle counts 1, a secondary one 0.5",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  view_program: {
    type: "view_program",
    title: "Program",
    description: "Every day in your program, exercise by exercise",
    availableSizes: ["large"],
    defaultSize: "large",
  },
};

export const DEFAULT_PLAN_WIDGETS = toDefaultWidgets(PLAN_WIDGET_REGISTRY, [
  "build_plan",
  "select_split",
  "muscle_frequency",
  "view_program",
]);
