import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type AnalyticsWidgetType =
  | "select_exercise"
  | "set_data"
  | "last_workout"
  | "workout_history"
  | "weight_progress"
  | "reps_progress"
  | "one_rep_max"
  | "personal_records"
  | "rep_max_table"
  | "progress_rate"
  | "rep_distribution"
  | "training_frequency"
  | "set_efficiency";

export const ANALYTICS_WIDGET_REGISTRY: Record<
  AnalyticsWidgetType,
  WidgetDefinition<AnalyticsWidgetType>
> = {
  select_exercise: {
    type: "select_exercise",
    title: "Select Exercise / Muscle Group",
    description:
      "Pick an exercise or a muscle group to analyze, with search and filters",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  set_data: {
    type: "set_data",
    title: "All Set Data",
    description:
      "Total sets, workouts, max weight/reps, and averages for the selected exercise",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  last_workout: {
    type: "last_workout",
    title: "Last Workout",
    description: "The most recent date you trained this exercise",
    availableSizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
  workout_history: {
    type: "workout_history",
    title: "Workout History",
    description: "Calendar view of past sets for this exercise",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  weight_progress: {
    type: "weight_progress",
    description: "Weight trend over time for the selected exercise",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  reps_progress: {
    type: "reps_progress",
    description: "Average reps per session trend over time",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  one_rep_max: {
    type: "one_rep_max",
    title: "Estimated 1RM",
    description:
      "Estimated one-rep max, its all-time best, and the trend across sessions",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  personal_records: {
    type: "personal_records",
    title: "Personal Records",
    description:
      "Heaviest set, most reps and best estimated 1RM, each with the date you hit it",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  rep_max_table: {
    type: "rep_max_table",
    title: "Rep Max Table",
    description: "Your actual best weight at each rep count from 1 to 12",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  progress_rate: {
    type: "progress_rate",
    title: "Progress Rate",
    description:
      "How fast your estimated 1RM is moving, in kg per week, with a stall warning",
    availableSizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
  rep_distribution: {
    type: "rep_distribution",
    title: "Rep Range Split",
    description:
      "Share of working sets trained in the strength, hypertrophy and endurance rep ranges",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  training_frequency: {
    type: "training_frequency",
    title: "Training Frequency",
    description:
      "Sessions per week, typical days between sessions, and days since the last one",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  set_efficiency: {
    type: "set_efficiency",
    title: "Rest & Fatigue",
    description:
      "Average rest between sets and how far reps fall from the first set to the last",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
};

export const DEFAULT_ANALYTICS_WIDGETS = toDefaultWidgets(
  ANALYTICS_WIDGET_REGISTRY,
  [
    "select_exercise",
    "set_data",
    "last_workout",
    "workout_history",
    "one_rep_max",
    "progress_rate",
    "personal_records",
    "rep_max_table",
    "weight_progress",
    "reps_progress",
    "rep_distribution",
    "training_frequency",
    "set_efficiency",
  ],
);
