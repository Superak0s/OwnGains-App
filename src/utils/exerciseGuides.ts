import { useEffect, useSyncExternalStore } from "react";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";

export interface Guide {
  readonly id: string;
  readonly axis: "h" | "v";
  /** Position along the cross axis, 0..1 of the image box. */
  readonly pos: number;
  readonly color: string;
  readonly dashed: boolean;
  readonly opacity: number;
  readonly width: number;
  /** "all" mirrors the guide onto every photo of the exercise. */
  readonly scope: "all" | number;
}

const KEY = (exerciseId: string): string => `exercise_guides:${exerciseId}`;
const EMPTY: readonly Guide[] = [];

const sessionGuides = new Map<string, readonly Guide[]>();
const loaded = new Set<string>();
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const isGuide = (value: unknown): value is Guide => {
  const g = value as Guide;
  return (
    !!g &&
    typeof g.id === "string" &&
    (g.axis === "h" || g.axis === "v") &&
    typeof g.pos === "number" &&
    g.pos >= 0 &&
    g.pos <= 1 &&
    typeof g.color === "string" &&
    typeof g.dashed === "boolean" &&
    typeof g.opacity === "number" &&
    typeof g.width === "number" &&
    (g.scope === "all" || typeof g.scope === "number")
  );
};

const withDefaults = (value: unknown): unknown =>
  value && typeof value === "object" && !("width" in value)
    ? { ...value, width: 2 }
    : value;

export const parseGuides = (raw: string | null): readonly Guide[] => {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(withDefaults).filter(isGuide) : EMPTY;
  } catch {
    return EMPTY;
  }
};

export const guidesForImage = (
  guides: readonly Guide[],
  imageIndex: number,
): readonly Guide[] =>
  guides.filter((g) => g.scope === "all" || g.scope === imageIndex);

/** Session-only: kept until the app restarts, never written to storage. */
export const setSessionGuides = (
  exerciseId: string,
  guides: readonly Guide[],
): void => {
  sessionGuides.set(exerciseId, guides);
  emit();
};

export const saveGuides = async (
  exerciseId: string,
  guides: readonly Guide[],
): Promise<void> => {
  setSessionGuides(exerciseId, guides);
  await setStorageItem(KEY(exerciseId), JSON.stringify(guides));
};

const loadGuides = async (exerciseId: string): Promise<void> => {
  if (loaded.has(exerciseId)) return;
  loaded.add(exerciseId);
  const stored = parseGuides(await getStorageItem(KEY(exerciseId)));
  if (stored.length > 0 && !sessionGuides.has(exerciseId))
    setSessionGuides(exerciseId, stored);
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useGuides = (exerciseId?: string | null): readonly Guide[] => {
  useEffect(() => {
    if (exerciseId) void loadGuides(exerciseId);
  }, [exerciseId]);

  const snapshot = (): readonly Guide[] =>
    (exerciseId && sessionGuides.get(exerciseId)) || EMPTY;

  return useSyncExternalStore(subscribe, snapshot, snapshot);
};
