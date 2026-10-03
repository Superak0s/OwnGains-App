import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";
import {
  PLAN_WIDGET_REGISTRY,
  type PlanWidgetType,
} from "@features/plan/widgets";
import {
  ANALYTICS_WIDGET_REGISTRY,
  type AnalyticsWidgetType,
} from "@features/analytics/widgets";
import {
  FRIENDS_WIDGET_REGISTRY,
  REQUESTS_WIDGET_REGISTRY,
  SEARCH_WIDGET_REGISTRY,
  type FriendsWidgetType,
  type RequestsWidgetType,
  type SearchWidgetType,
} from "@features/friends/widgets";
import {
  WEIGHT_WIDGET_REGISTRY,
  type WeightWidgetType,
} from "@features/tracking/tabs/WeightTab";
import {
  PHOTOS_WIDGET_REGISTRY,
  type PhotosWidgetType,
} from "@features/tracking/tabs/PhotosTab";
import {
  MACROS_WIDGET_REGISTRY,
  type MacrosWidgetType,
} from "@features/tracking/tabs/MacrosTab";
import {
  BODYFAT_WIDGET_REGISTRY,
  type BodyFatWidgetType,
} from "@features/tracking/tabs/BodyFatTab";
import {
  MEASUREMENTS_WIDGET_REGISTRY,
  type MeasurementsWidgetType,
} from "@features/tracking/tabs/MeasurementsTab";
import {
  HYDRATION_WIDGET_REGISTRY,
  type HydrationWidgetType,
} from "@features/tracking/tabs/HydrationTab";
import {
  SORENESS_WIDGET_REGISTRY,
  type SorenessWidgetType,
} from "@features/tracking/tabs/SorenessTab";
import {
  MENSTRUAL_WIDGET_REGISTRY,
  type MenstrualWidgetType,
} from "@features/tracking/tabs/MenstrualTab";

type HomeOwnWidgetType =
  | "next_workout"
  | "weekly_progress"
  | "workout_calendar"
  | "workout_streak";

const HOME_OWN_REGISTRY: Record<
  HomeOwnWidgetType,
  WidgetDefinition<HomeOwnWidgetType>
> = {
  next_workout: {
    type: "next_workout",
    title: "Next Workout",
    description:
      "Today's day, lock status, and quick actions to change day or start",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  weekly_progress: {
    type: "weekly_progress",
    title: "Weekly Progress",
    description: "Days completed and locked this week",
    availableSizes: ["small", "medium"],
    defaultSize: "small",
  },
  workout_calendar: {
    type: "workout_calendar",
    title: "Workout History",
    description:
      "Calendar view of past workout sessions. Tap a day to see details",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  workout_streak: {
    type: "workout_streak",
    title: "Streak",
    description: "Consecutive weeks with a completed day",
    availableSizes: ["small"],
    defaultSize: "small",
  },
};

const HOME_PLAN_KEYS = [
  "select_split",
  "muscle_frequency",
  "view_program",
] as const;

type HomePlanWidgetType = (typeof HOME_PLAN_KEYS)[number];

/** Only the Plan widgets that still make sense outside the Plan screen.
 * The creation/import entry points don't. */
const HOME_PLAN_REGISTRY = Object.fromEntries(
  HOME_PLAN_KEYS.map((key) => [key, PLAN_WIDGET_REGISTRY[key]]),
) as Record<HomePlanWidgetType, WidgetDefinition<PlanWidgetType>>;

/** Every other screen's widgets can also be placed on Home. Workout's are
 * deliberately excluded because they only make sense inside a live session. */
export type HomeWidgetType =
  | HomeOwnWidgetType
  | HomePlanWidgetType
  | AnalyticsWidgetType
  | FriendsWidgetType
  | RequestsWidgetType
  | SearchWidgetType
  | WeightWidgetType
  | PhotosWidgetType
  | MacrosWidgetType
  | BodyFatWidgetType
  | MeasurementsWidgetType
  | HydrationWidgetType
  | SorenessWidgetType
  | MenstrualWidgetType;

const WIDGET_SOURCES: [
  string,
  Record<string, WidgetDefinition<string>>,
  string?,
][] = [
  ["Home", HOME_OWN_REGISTRY],
  ["Plan", HOME_PLAN_REGISTRY],
  ["Analytics", ANALYTICS_WIDGET_REGISTRY],
  ["Friends", FRIENDS_WIDGET_REGISTRY, "Friends"],
  ["Friends", REQUESTS_WIDGET_REGISTRY, "Requests"],
  ["Friends", SEARCH_WIDGET_REGISTRY, "Search"],
  ["Tracking", WEIGHT_WIDGET_REGISTRY, "Weight"],
  ["Tracking", PHOTOS_WIDGET_REGISTRY, "Photos"],
  ["Tracking", MACROS_WIDGET_REGISTRY, "Macros"],
  ["Tracking", BODYFAT_WIDGET_REGISTRY, "Body Fat"],
  ["Tracking", MEASUREMENTS_WIDGET_REGISTRY, "Measurements"],
  ["Tracking", HYDRATION_WIDGET_REGISTRY, "Hydration"],
  ["Tracking", SORENESS_WIDGET_REGISTRY, "Soreness"],
  ["Tracking", MENSTRUAL_WIDGET_REGISTRY, "Menstrual"],
];

export const HOME_WIDGET_REGISTRY = Object.fromEntries(
  WIDGET_SOURCES.flatMap(([, registry]) => Object.entries(registry)),
) as Record<HomeWidgetType, WidgetDefinition<HomeWidgetType>>;

/** Which screen each home-placeable widget comes from, for the gallery filter. */
export const HOME_WIDGET_SOURCE: Record<string, string> = Object.fromEntries(
  WIDGET_SOURCES.flatMap(([label, registry]) =>
    Object.keys(registry).map((type) => [type, label]),
  ),
);

/** Which tab within that screen, for the gallery's secondary filter. */
export const HOME_WIDGET_SUBSOURCE: Record<string, string> = Object.fromEntries(
  WIDGET_SOURCES.flatMap(([, registry, sub]) =>
    sub ? Object.keys(registry).map((type) => [type, sub]) : [],
  ),
);

export const DEFAULT_HOME_WIDGETS = toDefaultWidgets(HOME_WIDGET_REGISTRY, [
  "next_workout",
  "workout_calendar",
  "weekly_progress",
  "workout_streak",
  "training_frequency",
  "macros_today",
  "hydration_overview",
]);
