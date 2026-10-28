import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import { createEmitter } from "@utils/emitter";
import type { AppMode } from "./appMode";
import type { AppRole } from "./appRole";

export const DEFAULT_TAB_ORDER = [
  "Home",
  "Workout",
  "Analytics",
  "Tracking",
  "Supplements",
  "Friends",
  "Plan",
  "Settings",
] as const;

export type TabName = (typeof DEFAULT_TAB_ORDER)[number];

export const TAB_META: Record<TabName, { icon: string; label: string }> = {
  Home: { icon: "🏠", label: "Home" },
  Workout: { icon: "💪", label: "Workout" },
  Plan: { icon: "📋", label: "Plan" },
  Analytics: { icon: "📊", label: "Progress" },
  Tracking: { icon: "📈", label: "Track" },
  Supplements: { icon: "💊", label: "Supps" },
  Friends: { icon: "👥", label: "Friends" },
  Settings: { icon: "⚙️", label: "Settings" },
};

export const TRAINER_TABS = ["Clients", "Workout", "Plan", "Analytics", "Tracking", "Supplements", "Settings"] as const;

export type MainTabName = TabName | "Clients";

export const TRAINER_TAB_META: Record<(typeof TRAINER_TABS)[number], { icon: string; label: string }> = {
  Clients: { icon: "👥", label: "Clients" },
  Workout: { icon: "🏋️", label: "Session" },
  Plan: { icon: "📋", label: "Programs" },
  Analytics: { icon: "📊", label: "Progress" },
  Tracking: { icon: "📈", label: "Track" },
  Supplements: { icon: "💊", label: "Supps" },
  Settings: { icon: "⚙️", label: "Settings" },
};

export const tabMeta = (name: MainTabName, trainer: boolean): { icon: string; label: string } =>
  trainer && name in TRAINER_TAB_META
    ? TRAINER_TAB_META[name as keyof typeof TRAINER_TAB_META]
    : TAB_META[name as TabName];

export const tabLabel = (name: MainTabName, trainer: boolean): string =>
  tabMeta(name, trainer)?.label ?? name;

export const visibleTabs = (appMode: AppMode, order: MainTabName[]): MainTabName[] =>
  appMode === "offline" ? order.filter((name) => name !== "Friends") : order;

const TAB_ORDER_KEYS: Record<AppRole, string> = {
  personal: "@tab_order",
  trainer: "@trainer_tab_order",
};

const DEFAULT_ORDERS: Record<AppRole, readonly MainTabName[]> = {
  personal: DEFAULT_TAB_ORDER,
  trainer: TRAINER_TABS,
};

export const onTabOrderChange = createEmitter<{ role: AppRole; order: MainTabName[] }>();

// A stored order can predate a tab being added or removed, so unknown names
// are dropped and any missing tab is appended rather than disappearing.
export const normalizeTabOrder = (
  stored: unknown,
  defaults: readonly MainTabName[] = DEFAULT_TAB_ORDER,
): MainTabName[] => {
  const known = new Set<string>(defaults);
  const order: MainTabName[] = [];
  if (Array.isArray(stored)) {
    for (const name of stored) {
      if (typeof name === "string" && known.has(name) && !order.includes(name as MainTabName)) {
        order.push(name as MainTabName);
      }
    }
  }
  for (const name of defaults) {
    if (!order.includes(name)) order.push(name);
  }
  return order;
};

export const loadTabOrder = async (role: AppRole = "personal"): Promise<MainTabName[]> => {
  try {
    const raw = await getStorageItem(TAB_ORDER_KEYS[role]);
    return normalizeTabOrder(raw ? JSON.parse(raw) : null, DEFAULT_ORDERS[role]);
  } catch {
    return [...DEFAULT_ORDERS[role]];
  }
};

export const saveTabOrder = async (
  order: MainTabName[],
  role: AppRole = "personal",
): Promise<void> => {
  const normalized = normalizeTabOrder(order, DEFAULT_ORDERS[role]);
  onTabOrderChange.trigger({ role, order: normalized });
  await setStorageItem(TAB_ORDER_KEYS[role], JSON.stringify(normalized));
};

export const moveTab = <T>(order: T[], index: number, direction: -1 | 1): T[] => {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return order;
  }
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
