import { getStorageItemSync, setStorageItem } from "@shared/services/sqliteStorage";
import type { AppMode } from "@shared/services/appMode";
import { trackFeature } from "@shared/services/crashReporting";

export type Role = "user" | "trainer" | "both";
export type PickerMode = "firstRun" | "onlineTour" | "change";

export const ROLE_LABELS: Record<Role, string> = {
  user: "Just me",
  trainer: "Trainer",
  both: "Both",
};

export interface TutorialState {
  role: Role | null;
  completed: string[];
  firstRunDone: boolean;
  firstRunMode: AppMode | null;
  onlineTourOffered: boolean;
}

// No `_user_` suffix on purpose: clearUserData and account, server or mode
// switches must never bring the first-run tutorial back.
export const TUTORIAL_KEY = "@tutorial";

const ROLES: readonly string[] = ["user", "trainer", "both"];

export function parseTutorialState(raw: string | null): TutorialState {
  let value: unknown = null;
  try {
    value = raw ? JSON.parse(raw) : null;
  } catch {
    value = null;
  }
  const o = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    role: ROLES.includes(o.role as string) ? (o.role as Role) : null,
    completed: Array.isArray(o.completed)
      ? o.completed.filter((c): c is string => typeof c === "string")
      : [],
    firstRunDone: o.firstRunDone === true,
    firstRunMode:
      o.firstRunMode === "online" || o.firstRunMode === "offline" ? o.firstRunMode : null,
    onlineTourOffered: o.onlineTourOffered === true,
  };
}

export const readTutorialState = (): TutorialState =>
  parseTutorialState(getStorageItemSync(TUTORIAL_KEY));

const listeners: Array<(s: TutorialState) => void> = [];
export const onTutorialStateChange = {
  subscribe: (fn: (s: TutorialState) => void) => {
    listeners.push(fn);
    return () => {
      const idx = listeners.lastIndexOf(fn);
      if (idx > -1) listeners.splice(idx, 1);
    };
  },
};

// Chained so two updates fired in the same tick each read the other's write.
let chain: Promise<unknown> = Promise.resolve();

export function updateTutorialState(
  fn: (s: TutorialState) => TutorialState,
): Promise<TutorialState> {
  const run = chain.then(async () => {
    const next = fn(readTutorialState());
    await setStorageItem(TUTORIAL_KEY, JSON.stringify(next));
    [...listeners].forEach((l) => l(next));
    return next;
  });
  chain = run.catch(() => undefined);
  return run;
}

export const markChapterCompleted = (id: string) => {
  trackFeature("tutorial", "chapter_completed", { chapter: id });
  return updateTutorialState((s) =>
    s.completed.includes(id) ? s : { ...s, completed: [...s.completed, id] },
  );
};

export const markFirstRunDone = (mode: AppMode) =>
  updateTutorialState((s) => ({
    ...s,
    firstRunDone: true,
    firstRunMode: s.firstRunMode ?? mode,
    onlineTourOffered: s.onlineTourOffered || (s.firstRunMode ?? mode) === "online",
  }));

export const markOnlineTourOffered = () =>
  updateTutorialState((s) => ({ ...s, onlineTourOffered: true }));

export const setTutorialRole = (role: Role) => {
  trackFeature("tutorial", "role", { role });
  return updateTutorialState((s) => ({ ...s, role }));
};

export function gateAction(
  s: TutorialState,
  mode: AppMode,
): "firstRun" | "onlineTour" | null {
  if (!s.firstRunDone) return "firstRun";
  if (s.firstRunMode === "offline" && !s.onlineTourOffered && mode === "online") {
    return "onlineTour";
  }
  return null;
}

export function pickOutcome(
  role: Role,
  mode: AppMode,
  picker: PickerMode,
): "needsOnline" | "setRole" | "start" {
  if (role !== "user" && mode === "offline") return "needsOnline";
  return picker === "change" ? "setRole" : "start";
}
