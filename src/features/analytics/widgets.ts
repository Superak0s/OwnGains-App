import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type AnalyticsWidgetType =
  | "select_exercise"
  | "workout_history"
  | "weekly_volume"
  | "group_exercises"
  | "one_rep_max"
  | "personal_records"
  | "progress_rate"
  | "rep_distribution"
  | "training_frequency"
  | "set_efficiency"
  | "weight_progress"
  | "reps_progress"
  | "set_data"
  | "last_workout";

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
  workout_history: {
    type: "workout_history",
    title: "Workout History",
    description: "Calendar view of past sets for this exercise",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  weekly_volume: {
    type: "weekly_volume",
    title: "Weekly Sets",
    description:
      "Working sets this week and the 4-week average, against the 10 to 20 sets a muscle needs to grow",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  group_exercises: {
    type: "group_exercises",
    title: "Exercises",
    description:
      "Every exercise in the muscle group with its own estimated 1RM and 30-day trend",
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
      "Heaviest set, most reps, best estimated 1RM and your best weight at each rep count",
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
    description: "The most recent date you trained this exercise or muscle group",
    availableSizes: ["small", "medium", "large"],
    defaultSize: "medium",
  },
};

/** Pooled weight from different exercises can't be compared, so these only
 * make sense for one exercise. */
const EXERCISE_ONLY = new Set<AnalyticsWidgetType>([
  "one_rep_max",
  "personal_records",
  "progress_rate",
  "set_efficiency",
  "weight_progress",
  "reps_progress",
  "set_data",
]);

export const fitsFocus = (
  type: AnalyticsWidgetType,
  isGroupFocus: boolean,
): boolean =>
  isGroupFocus ? !EXERCISE_ONLY.has(type) : type !== "group_exercises";

export const DEFAULT_ANALYTICS_WIDGETS = toDefaultWidgets(
  ANALYTICS_WIDGET_REGISTRY,
  [
    "select_exercise",
    "weekly_volume",
    "group_exercises",
    "one_rep_max",
    "progress_rate",
    "personal_records",
    "workout_history",
    "training_frequency",
    "rep_distribution",
    "set_efficiency",
  ],
);
