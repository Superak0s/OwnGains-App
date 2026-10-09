import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import { createEmitter } from "@utils/emitter";

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

const TAB_ORDER_KEY = "@tab_order";

export const onTabOrderChange = createEmitter<TabName[]>();

// A stored order can predate a tab being added or removed, so unknown names
// are dropped and any missing tab is appended rather than disappearing.
export const normalizeTabOrder = (stored: unknown): TabName[] => {
  const known = new Set<string>(DEFAULT_TAB_ORDER);
  const order: TabName[] = [];
  if (Array.isArray(stored)) {
    for (const name of stored) {
      if (typeof name === "string" && known.has(name) && !order.includes(name as TabName)) {
        order.push(name as TabName);
      }
    }
  }
  for (const name of DEFAULT_TAB_ORDER) {
    if (!order.includes(name)) order.push(name);
  }
  return order;
};

export const loadTabOrder = async (): Promise<TabName[]> => {
  try {
    const raw = await getStorageItem(TAB_ORDER_KEY);
    return normalizeTabOrder(raw ? JSON.parse(raw) : null);
  } catch {
    return [...DEFAULT_TAB_ORDER];
  }
};

export const saveTabOrder = async (order: TabName[]): Promise<void> => {
  const normalized = normalizeTabOrder(order);
  onTabOrderChange.trigger(normalized);
  await setStorageItem(TAB_ORDER_KEY, JSON.stringify(normalized));
};

export const moveTab = (
  order: TabName[],
  index: number,
  direction: -1 | 1,
): TabName[] => {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) {
    return order;
  }
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
};
