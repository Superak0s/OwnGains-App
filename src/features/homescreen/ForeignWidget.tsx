// Widgets owned by another screen can be placed on the home board. Rather
// than duplicating each screen's data loading, modals and handlers here, the
// owning screen is mounted in "embed" mode: it renders only the requested
// widget plus the modals that widget opens.

import React from "react";
import { Text } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import PlanScreen from "@features/plan/PlanScreen";
import AnalyticsScreen from "@features/analytics/AnalyticsScreen";
import FriendsScreen from "@features/friends/FriendsScreen";
import TrackingScreen from "@features/tracking/TrackingScreen";
import { PLAN_WIDGET_REGISTRY } from "@features/plan/widgets";
import { ANALYTICS_WIDGET_REGISTRY } from "@features/analytics/widgets";
import {
  FRIENDS_WIDGET_REGISTRY,
  REQUESTS_WIDGET_REGISTRY,
} from "@features/friends/widgets";
import { WEIGHT_WIDGET_REGISTRY } from "@features/tracking/tabs/WeightTab";
import { PHOTOS_WIDGET_REGISTRY } from "@features/tracking/tabs/PhotosTab";
import { MACROS_WIDGET_REGISTRY } from "@features/tracking/tabs/MacrosTab";
import { BODYFAT_WIDGET_REGISTRY } from "@features/tracking/tabs/BodyFatTab";
import { MEASUREMENTS_WIDGET_REGISTRY } from "@features/tracking/tabs/MeasurementsTab";
import { HYDRATION_WIDGET_REGISTRY } from "@features/tracking/tabs/HydrationTab";
import { SORENESS_WIDGET_REGISTRY } from "@features/tracking/tabs/SorenessTab";
import { MENSTRUAL_WIDGET_REGISTRY } from "@features/tracking/tabs/MenstrualTab";

type EmbedHost = React.ComponentType<{ readonly embedWidget: never }>;

const HOSTS: [EmbedHost, Record<string, unknown>[]][] = [
  [PlanScreen as EmbedHost, [PLAN_WIDGET_REGISTRY]],
  [AnalyticsScreen as EmbedHost, [ANALYTICS_WIDGET_REGISTRY]],
  [
    FriendsScreen as EmbedHost,
    [FRIENDS_WIDGET_REGISTRY, REQUESTS_WIDGET_REGISTRY],
  ],
  [
    TrackingScreen as EmbedHost,
    [
      WEIGHT_WIDGET_REGISTRY,
      PHOTOS_WIDGET_REGISTRY,
      MACROS_WIDGET_REGISTRY,
      BODYFAT_WIDGET_REGISTRY,
      MEASUREMENTS_WIDGET_REGISTRY,
      HYDRATION_WIDGET_REGISTRY,
      SORENESS_WIDGET_REGISTRY,
      MENSTRUAL_WIDGET_REGISTRY,
    ],
  ],
];

const HOST_BY_TYPE: Record<string, EmbedHost> = Object.fromEntries(
  HOSTS.flatMap(([host, registries]) =>
    registries.flatMap((registry) =>
      Object.keys(registry).map((type) => [type, host]),
    ),
  ),
);

export default function ForeignWidget({
  type,
}: {
  readonly type: string;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const Host = HOST_BY_TYPE[type];
  // A widget registered on a board but never wired to a host would otherwise
  // render as a blank card with nothing to act on.
  if (!Host) return (
    <Text
      style={{ color: colors.textSecondary, padding: 16 }}
    >{`Widget "${type}" is unavailable.`}</Text>
  );
  return <Host embedWidget={type as never} />;
}
