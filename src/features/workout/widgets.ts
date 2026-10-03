import type { WidgetDefinition } from "@shared/types"
import { toDefaultWidgets } from "@shared/types"

export type WorkoutWidgetType =
  | "day_number"
  | "total_sets"
  | "progress"
  | "session_stats"

export const WORKOUT_WIDGET_REGISTRY: Record<
  WorkoutWidgetType,
  WidgetDefinition<WorkoutWidgetType>
> = {
  day_number: {
    type: "day_number",
    title: "Day",
    description: "Current day number and lock status",
    icon: "📅",
    availableSizes: ["small"],
    defaultSize: "small",
  },
  total_sets: {
    type: "total_sets",
    title: "Total Sets",
    description: "Total sets scheduled for the day",
    icon: "🔢",
    availableSizes: ["small"],
    defaultSize: "small",
  },
  progress: {
    type: "progress",
    title: "Progress",
    description:
      "Sets completed, progress bar, estimated time remaining, and estimated finish time",
    icon: "📊",
    availableSizes: ["large"],
    defaultSize: "large",
  },
  session_stats: {
    type: "session_stats",
    title: "Session Stats",
    description:
      "Total session time, average rest per set, rest reminder, and current rest timer",
    icon: "⏱️",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
}

export const DEFAULT_WORKOUT_WIDGETS = toDefaultWidgets(WORKOUT_WIDGET_REGISTRY, [
  "day_number",
  "total_sets",
  "progress",
  "session_stats",
]);

