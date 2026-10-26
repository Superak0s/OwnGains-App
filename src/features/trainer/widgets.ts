import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export type ClientsWidgetType = "attention_list" | "on_track_list" | "sent_requests";

export const CLIENTS_WIDGET_REGISTRY: Record<ClientsWidgetType, WidgetDefinition<ClientsWidgetType>> = {
  attention_list: {
    type: "attention_list",
    title: "Needs attention",
    description: "Clients who haven't trained in a week or are behind this week's target",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
  on_track_list: {
    type: "on_track_list",
    title: "On track",
    description: "Clients keeping up with their plan this week",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
  sent_requests: {
    type: "sent_requests",
    title: "Requests sent",
    description: "Trainer requests waiting for an answer, with a cancel button",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
};

export const DEFAULT_CLIENTS_WIDGETS = toDefaultWidgets(CLIENTS_WIDGET_REGISTRY, [
  "attention_list",
  "on_track_list",
  "sent_requests",
]);

export type ClientPageWidgetType = "client_week" | "progress" | "recent_sessions" | "permissions" | "tracking";

export const CLIENT_PAGE_WIDGET_REGISTRY: Record<ClientPageWidgetType, WidgetDefinition<ClientPageWidgetType>> = {
  client_week: {
    type: "client_week",
    title: "Schedule",
    description: "The client's planned workouts this week, with reminders",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
  progress: {
    type: "progress",
    title: "This week",
    description: "Sessions done this week against the client's weekly target",
    availableSizes: ["small", "medium"],
    defaultSize: "medium",
  },
  recent_sessions: {
    type: "recent_sessions",
    title: "Recent sessions",
    description: "A calendar of the client's sessions, with you or on their own",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
  permissions: {
    type: "permissions",
    title: "Permissions",
    description: "What the client has granted you",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
  tracking: {
    type: "tracking",
    title: "Tracking",
    description: "Ask for Tracking Access, or check the safety code once it's granted",
    availableSizes: ["medium"],
    defaultSize: "medium",
  },
};

export const DEFAULT_CLIENT_PAGE_WIDGETS = toDefaultWidgets(CLIENT_PAGE_WIDGET_REGISTRY, [
  "progress",
  "client_week",
  "recent_sessions",
  "permissions",
  "tracking",
]);
