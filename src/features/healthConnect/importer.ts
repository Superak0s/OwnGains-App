import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import type { RecordResult } from "react-native-health-connect";
import {
  bodyFatApi,
  bodyTrackingApi,
  hydrationApi,
  macrosTrackingApi,
} from "@features/tracking/services";
import type { BodyFatEntryWithFields } from "@features/tracking/types";
import { ApiError } from "@shared/services/apiError";
import {
  captureException,
  metric,
  trackFeature,
  trackSpan,
} from "@shared/services/crashReporting";
import { getRecordStoreUser } from "@shared/services/offlineHelpers";
import { loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { toDateString } from "@utils/format";
import { isKeepingHealthData, readRecentDays, storeRecentDays } from "./dailyHealth";
import { getGrantedTypes, IMPORT_TYPES, readAll, type ImportType } from "./healthConnect";

// Health Connect only serves the last 30 days without READ_HEALTH_DATA_HISTORY.
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const THROTTLE_MS = 15 * 60 * 1000;
const NOTE = "Health Connect";

export interface ImportSummary {
  imported: number;
  failed: ImportType[];
}

interface Entry {
  at: string;
  value: number | null;
  name?: string;
  protein?: number;
  carbs?: number;
  fat?: number;
}

interface TypeSpec<T extends ImportType> {
  toEntry: (record: RecordResult<T>) => Entry | null;
  loadExisting: () => Promise<Entry[]>;
  matches: (existing: Entry, incoming: Entry) => boolean;
  write: (entry: Entry) => Promise<unknown>;
}

type ImportedIds = Record<string, string>;

const round1 = (n: number) => Math.round(n * 10) / 10;
const grams = (mass?: { inGrams: number }) => (mass ? round1(mass.inGrams) : undefined);
const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);
const sameDayWithinTenth = (a: Entry, b: Entry) =>
  toDateString(a.at) === toDateString(b.at) &&
  Math.round(Math.abs(Number(a.value) - Number(b.value)) * 100) <= 10;
const localTime = (iso: string) => {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const SPECS: { [T in ImportType]: TypeSpec<T> } = {
  Weight: {
    toEntry: (r) => ({ at: r.time, value: round1(r.weight.inKilograms) }),
    loadExisting: async () =>
      (await bodyTrackingApi.getWeightHistory(365)).entries.map((e) => ({
        at: e.recordedAt,
        value: Number(e.weightKg),
      })),
    matches: sameDayWithinTenth,
    write: (e) => bodyTrackingApi.logWeight(e.value as number, "kg", NOTE, e.at),
  },
  BodyFat: {
    toEntry: (r) => ({ at: r.time, value: round1(r.percentage) }),
    loadExisting: async () =>
      ((await bodyFatApi.getBodyFatHistory(365)).entries as BodyFatEntryWithFields[]).map((e) => ({
        at: e.date ?? e.recordedAt ?? e.calculatedAt ?? "",
        value: Number(e.percentage ?? e.bodyFatPercentage),
      })),
    matches: sameDayWithinTenth,
    write: (e) => bodyFatApi.logBodyFat(e.value as number, null, null, e.at),
  },
  Hydration: {
    toEntry: (r) => {
      const ml = Math.round(r.volume.inMilliliters);
      return ml > 0 ? { at: r.startTime, value: ml } : null;
    },
    loadExisting: async () =>
      ((await hydrationApi.getHydrationHistory(365)).data ?? []).map((e) => ({
        at: e.loggedAt,
        value: e.amountMl,
      })),
    matches: (a, b) => minute(a.at) === minute(b.at) && a.value === b.value,
    write: (e) => hydrationApi.logHydration(e.value as number, NOTE, e.at),
  },
  Nutrition: {
    toEntry: (r) => {
      const entry: Entry = {
        at: r.startTime,
        value: r.energy ? Math.round(r.energy.inKilocalories) : null,
        name: r.name || undefined,
        protein: grams(r.protein),
        carbs: grams(r.totalCarbohydrate),
        fat: grams(r.totalFat),
      };
      const empty = [entry.value, entry.protein, entry.carbs, entry.fat].every((v) => v == null);
      return empty ? null : entry;
    },
    loadExisting: async () =>
      (await macrosTrackingApi.getMacrosHistory(30)).entries.map((e) => ({
        at: (e as { takenAt?: string }).takenAt ?? e.loggedAt ?? "",
        value: e.calories ?? null,
        name: e.name,
      })),
    matches: (a, b) =>
      minute(a.at) === minute(b.at) &&
      (a.value == null && b.value == null ? a.name === b.name : a.value === b.value),
    write: (e) =>
      macrosTrackingApi.logMacros({
        name: e.name ?? NOTE,
        calories: e.value ?? undefined,
        protein: e.protein,
        carbs: e.carbs,
        fat: e.fat,
        date: toDateString(e.at),
        time: localTime(e.at),
      }),
  },
};

// Writes stop at the first failure so an unreachable server costs one
// request and one report, and the unmarked records are retried next sync.
// The tracking APIs write as whoever is signed in now, so a run also stops
// once that is no longer the user it started for.
async function importType<T extends ImportType>(
  userId: string,
  type: T,
  ids: ImportedIds,
  since: string,
  now: string,
  summary: ImportSummary,
): Promise<void> {
  const spec: TypeSpec<T> = SPECS[type];
  const fresh = (await readAll(type, since, now)).filter(
    (r) => !r.metadata?.id || !(r.metadata.id in ids),
  );
  if (fresh.length === 0) return;
  const existing = await spec.loadExisting();
  for (const record of fresh) {
    const entry = spec.toEntry(record);
    if (!entry) continue;
    if (getRecordStoreUser() !== userId) return;
    if (!existing.some((e) => spec.matches(e, entry))) {
      await spec.write(entry);
      existing.push(entry);
      summary.imported++;
    }
    if (record.metadata?.id) ids[record.metadata.id] = entry.at;
  }
}

async function importFromHealthConnect(userId: string): Promise<ImportSummary> {
  const summary: ImportSummary = { imported: 0, failed: [] };
  if (!(await isKeepingHealthData(userId))) return summary;
  const granted = await getGrantedTypes();
  const now = Date.now();
  try {
    await storeRecentDays(userId, await readRecentDays(granted, new Date(now)));
  } catch (error) {
    captureException(error, { feature: "healthConnect", stage: "dailyHealth" });
  }
  const since = new Date(now - WINDOW_MS).toISOString();
  const stored = await loadFromStorage<ImportedIds>(STORAGE_KEYS.HEALTH_CONNECT_IMPORTED, userId);
  const ids: ImportedIds = Object.fromEntries(
    Object.entries(stored ?? {}).filter(([, at]) => Date.parse(at) >= now - WINDOW_MS),
  );
  for (const type of IMPORT_TYPES.filter((t) => granted.includes(t))) {
    if (getRecordStoreUser() !== userId) break;
    try {
      await importType(userId, type, ids, since, new Date(now).toISOString(), summary);
    } catch (error) {
      summary.failed.push(type);
      const rejected = error instanceof ApiError && error.status >= 400 && error.status < 500;
      if (rejected) {
        metric.count("healthConnect.import_rejected", 1, {
          attributes: { recordType: type, status: error.status },
        });
      } else {
        captureException(error, { feature: "healthConnect", recordType: type });
      }
    }
    await saveToStorage(STORAGE_KEYS.HEALTH_CONNECT_IMPORTED, ids, userId);
  }
  await saveToStorage(STORAGE_KEYS.HEALTH_CONNECT_LAST_SYNC, now, userId);
  return summary;
}

const running = new Map<string, Promise<ImportSummary>>();

export async function syncHealthConnect(
  userId: string,
  force = false,
): Promise<ImportSummary | null> {
  if (!force && !running.has(userId)) {
    const last = await loadFromStorage<number>(STORAGE_KEYS.HEALTH_CONNECT_LAST_SYNC, userId);
    if (last && Date.now() - last < THROTTLE_MS) return null;
  }
  let run = running.get(userId);
  if (!run) {
    const trigger = force ? "manual" : "auto";
    run = trackSpan("healthConnect.sync", "sync", () => importFromHealthConnect(userId), { trigger })
      .then((summary) => {
        trackFeature("healthConnect", "sync", {
          trigger,
          imported: summary.imported,
          failed: summary.failed.length,
        });
        return summary;
      })
      .finally(() => running.delete(userId));
    running.set(userId, run);
  }
  return run;
}

export function useHealthConnectSync(userId: string | null): void {
  useEffect(() => {
    if (Platform.OS !== "android" || !userId) return;
    const sync = () => {
      syncHealthConnect(userId).catch((error: unknown) =>
        captureException(error, { feature: "healthConnect" }),
      );
    };
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => subscription.remove();
  }, [userId]);
}
