import { Dimensions } from "react-native";
import type { TabName } from "@shared/services/tabOrder";

export const ANCHOR_IDS = [
  "tabbar.toggle",
  "widgets.edit",
  "scrollTabs",
  "home.changeDay",
  "plan.import",
  "plan.export",
  "workout.addExercise",
  "workout.complete",
  "settings.sync",
  "settings.exportData",
  "settings.tutorial",
] as const;

export type AnchorId = (typeof ANCHOR_IDS)[number] | `tab.${TabName}`;

export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Measurable {
  measureInWindow: (
    cb: (x: number, y: number, width: number, height: number) => void,
  ) => void;
}

// A Set per id: shared components (WidgetEditButton, ScrollTabBar) mount once
// per screen, and only the copy on the visible screen measures on-screen.
const nodes = new Map<string, Set<Measurable>>();
const callbacks = new Map<string, (node: unknown) => (() => void) | undefined>();

export function tutorialAnchor(id: AnchorId) {
  let cb = callbacks.get(id);
  if (!cb) {
    cb = (raw) => {
      if (!raw || typeof (raw as Measurable).measureInWindow !== "function") return undefined;
      const node = raw as Measurable;
      const set = nodes.get(id) ?? new Set<Measurable>();
      nodes.set(id, set);
      set.add(node);
      return () => {
        set.delete(node);
      };
    };
    callbacks.set(id, cb);
  }
  return cb;
}

const measure = (node: Measurable): Promise<AnchorRect | null> =>
  new Promise((resolve) =>
    node.measureInWindow((x, y, width, height) =>
      resolve(width > 0 && height > 0 ? { x, y, width, height } : null),
    ),
  );

const centreOnScreen = (r: AnchorRect, win: { width: number; height: number }) => {
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return cx >= 0 && cx <= win.width && cy >= 0 && cy <= win.height;
};

export async function measureAnchor(
  id: AnchorId,
  win: { width: number; height: number } = Dimensions.get("window"),
): Promise<AnchorRect | null> {
  for (const node of nodes.get(id) ?? []) {
    const rect = await measure(node);
    if (rect && centreOnScreen(rect, win)) return rect;
  }
  return null;
}

export async function waitForAnchor(
  id: AnchorId,
  timeoutMs = 800,
  pollMs = 100,
): Promise<AnchorRect | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const rect = await measureAnchor(id);
    if (rect) return rect;
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}
