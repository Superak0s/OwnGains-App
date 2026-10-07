import { aggregateRecord } from "react-native-health-connect";
import { removeStorageItem } from "@shared/services/sqliteStorage";
import { getUserKey, loadFromStorage, saveToStorage, STORAGE_KEYS } from "@shared/services/storage";
import { toDateString } from "@utils/format";
import { readAll, type HealthType } from "./healthConnect";

export interface DailyHealth {
  steps?: number;
  heartAvg?: number;
  heartMin?: number;
  heartMax?: number;
  sleepMinutes?: number;
}

/** Keyed by local date (YYYY-MM-DD). */
export type HealthHistory = Record<string, DailyHealth>;

const WINDOW_DAYS = 30;

const dayStarts = (days: number, now: Date): Date[] =>
  Array.from({ length: days }, (_, i) => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1 - i));
    return start;
  });

const dayRange = (start: Date, now: Date) => {
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    operator: "between" as const,
    startTime: start.toISOString(),
    endTime: (end < now ? end : now).toISOString(),
  };
};

// ponytail: one aggregate call per day per type (about 60 per sync), switch to
// aggregateGroupByPeriod if a sync ever feels slow.
export async function readRecentDays(
  granted: HealthType[],
  now = new Date(),
): Promise<HealthHistory> {
  const days = dayStarts(WINDOW_DAYS, now);
  const history: HealthHistory = {};
  const day = (date: Date | string) => (history[toDateString(date)] ??= {});

  await Promise.all([
    granted.includes("Steps") &&
      Promise.all(
        days.map(async (start) => {
          const { COUNT_TOTAL } = await aggregateRecord({
            recordType: "Steps",
            timeRangeFilter: dayRange(start, now),
          });
          if (COUNT_TOTAL > 0) day(start).steps = COUNT_TOTAL;
        }),
      ),
    granted.includes("HeartRate") &&
      Promise.all(
        days.map(async (start) => {
          const result = await aggregateRecord({
            recordType: "HeartRate",
            timeRangeFilter: dayRange(start, now),
          });
          if (result.MEASUREMENTS_COUNT === 0) return;
          Object.assign(day(start), {
            heartAvg: Math.round(result.BPM_AVG),
            heartMin: result.BPM_MIN,
            heartMax: result.BPM_MAX,
          });
        }),
      ),
    granted.includes("SleepSession") &&
      readAll("SleepSession", days[0].toISOString(), now.toISOString()).then((sessions) => {
        for (const session of sessions) {
          const minutes = (Date.parse(session.endTime) - Date.parse(session.startTime)) / 60_000;
          const night = day(session.endTime);
          night.sleepMinutes = Math.round((night.sleepMinutes ?? 0) + minutes);
        }
      }),
  ]);
  return history;
}

export const loadHealthHistory = async (userId: string): Promise<HealthHistory> =>
  (await loadFromStorage<HealthHistory>(STORAGE_KEYS.HEALTH_CONNECT_HISTORY, userId)) ?? {};

export const mergeHistory = (older: HealthHistory, newer: HealthHistory): HealthHistory => {
  const merged = { ...older };
  for (const [date, values] of Object.entries(newer)) merged[date] = { ...merged[date], ...values };
  return merged;
};

export async function storeRecentDays(userId: string, recent: HealthHistory): Promise<void> {
  await saveToStorage(
    STORAGE_KEYS.HEALTH_CONNECT_HISTORY,
    mergeHistory(await loadHealthHistory(userId), recent),
    userId,
  );
}

export const deleteHealthHistory = (userId: string): Promise<void> =>
  removeStorageItem(getUserKey(STORAGE_KEYS.HEALTH_CONNECT_HISTORY, userId));

export const isKeepingHealthData = async (userId: string): Promise<boolean> =>
  (await loadFromStorage<boolean>(STORAGE_KEYS.HEALTH_CONNECT_KEEP, userId)) ?? true;

export const setKeepingHealthData = (userId: string, keep: boolean): Promise<boolean> =>
  saveToStorage(STORAGE_KEYS.HEALTH_CONNECT_KEEP, keep, userId);
