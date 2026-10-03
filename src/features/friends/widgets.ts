import type { WidgetDefinition } from "@shared/types";
import { toDefaultWidgets } from "@shared/types";

export const FRIENDS_TABS = [
  { key: "friends", label: "Friends" },
  { key: "requests", label: "Requests" },
  { key: "search", label: "Search" },
];

export type FriendsWidgetType = "friends_list";

export const FRIENDS_WIDGET_REGISTRY: Record<
  FriendsWidgetType,
  WidgetDefinition<FriendsWidgetType>
> = {
  friends_list: {
    type: "friends_list",
    title: "Your Friends",
    description:
      "Everyone you're connected with, and who's working out right now",
    availableSizes: ["large"],
    defaultSize: "large",
  },
};

export const DEFAULT_FRIENDS_WIDGETS = toDefaultWidgets(
  FRIENDS_WIDGET_REGISTRY,
  ["friends_list"],
);

export type RequestsWidgetType = "requests_pending" | "requests_sent";

export const REQUESTS_WIDGET_REGISTRY: Record<
  RequestsWidgetType,
  WidgetDefinition<RequestsWidgetType>
> = {
  requests_pending: {
    type: "requests_pending",
    title: "Pending Requests",
    description: "Friend requests waiting on your response",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
  requests_sent: {
    type: "requests_sent",
    title: "Sent Requests",
    description: "Friend requests you've sent that are still pending",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
};

export const DEFAULT_REQUESTS_WIDGETS = toDefaultWidgets(
  REQUESTS_WIDGET_REGISTRY,
  ["requests_pending", "requests_sent"],
);

export type SearchWidgetType = "search_qr" | "search_users";

export const SEARCH_WIDGET_REGISTRY: Record<
  SearchWidgetType,
  WidgetDefinition<SearchWidgetType>
> = {
  search_qr: {
    type: "search_qr",
    title: "Add via QR Code",
    description: "Show your code or scan a friend's to add them instantly",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
  search_users: {
    type: "search_users",
    title: "Search by Username",
    description: "Look up a user by username and send a friend request",
    availableSizes: ["medium", "large"],
    defaultSize: "large",
  },
};

export const DEFAULT_SEARCH_WIDGETS = toDefaultWidgets(SEARCH_WIDGET_REGISTRY, [
  "search_qr",
  "search_users",
]);
