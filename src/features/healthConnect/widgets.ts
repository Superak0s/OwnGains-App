import type { WidgetDefinition } from "@shared/types";

export type HealthWidgetType =
  | "health_steps"
  | "health_heart_rate"
  | "health_sleep"
  | "health_steps_trend"
  | "health_heart_rate_trend"
  | "health_sleep_trend";

export const HEALTH_WIDGET_REGISTRY: Record<HealthWidgetType, WidgetDefinition<HealthWidgetType>> = {
  health_steps: {
    type: "health_steps",
    title: "Steps",
    description: "Today's steps from Health Connect",
    availableSizes: ["small", "medium"],
    defaultSize: "small",
  },
  health_heart_rate: {
    type: "health_heart_rate",
    title: "Heart Rate",
    description: "Today's average, lowest and highest heart rate from Health Connect",
    availableSizes: ["small", "medium"],
    defaultSize: "small",
  },
  health_sleep: {
    type: "health_sleep",
    title: "Sleep",
    description: "Last night's sleep from Health Connect",
    availableSizes: ["small", "medium"],
    defaultSize: "small",
  },
  health_steps_trend: {
    type: "health_steps_trend",
    title: "Steps Trend",
    description: "Steps each day",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  health_heart_rate_trend: {
    type: "health_heart_rate_trend",
    title: "Heart Rate Trend",
    description: "Average heart rate each day",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  health_sleep_trend: {
    type: "health_sleep_trend",
    title: "Sleep Trend",
    description: "Hours slept each night",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};
