jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"));
jest.mock("react-native-health-connect", () => ({ aggregateRecord: jest.fn(), readRecords: jest.fn() }));

import { aggregateRecord, readRecords } from "react-native-health-connect";
import { resetMemorySqlite } from "test-utils/memorySqlite";
import {
  isKeepingHealthData,
  loadHealthHistory,
  readRecentDays,
  storeRecentDays,
} from "../dailyHealth";

const local = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
const NOW = new Date(2026, 9, 7, 15);

beforeEach(() => {
  resetMemorySqlite();
  jest.mocked(aggregateRecord).mockReset();
  jest.mocked(readRecords).mockReset();
});

it("totals each day and counts a night's sleep on the morning it ends", async () => {
  jest.mocked(aggregateRecord).mockImplementation(async ({ recordType, timeRangeFilter }) => {
    const start = (timeRangeFilter as { startTime: string }).startTime;
    if (recordType === "Steps") return { COUNT_TOTAL: start === local(7, 0) ? 1234 : 0 } as never;
    return start === local(6, 0)
      ? ({ MEASUREMENTS_COUNT: 3, BPM_AVG: 61.6, BPM_MIN: 50, BPM_MAX: 90 } as never)
      : ({ MEASUREMENTS_COUNT: 0 } as never);
  });
  jest.mocked(readRecords).mockResolvedValue({
    records: [
      { startTime: local(5, 23), endTime: local(6, 6) },
      { startTime: local(6, 14), endTime: local(6, 15) },
    ],
  } as never);

  const history = await readRecentDays(["Steps", "HeartRate", "SleepSession"], NOW);

  expect(jest.mocked(aggregateRecord).mock.calls.at(-1)?.[0].timeRangeFilter).toMatchObject({
    startTime: local(7, 0),
    endTime: NOW.toISOString(),
  });
  expect(history).toEqual({
    "2026-10-06": { heartAvg: 62, heartMin: 50, heartMax: 90, sleepMinutes: 480 },
    "2026-10-07": { steps: 1234 },
  });
});

it("reads only the granted types", async () => {
  jest.mocked(aggregateRecord).mockResolvedValue({ COUNT_TOTAL: 0 } as never);
  await readRecentDays(["Steps"], NOW);
  expect(aggregateRecord).toHaveBeenCalledTimes(30);
  expect(readRecords).not.toHaveBeenCalled();
});

it("keeps stored days and fields that a later read no longer returns", async () => {
  await storeRecentDays("u1", { "2026-06-01": { steps: 9000 }, "2026-10-06": { steps: 100, sleepMinutes: 400 } });
  await storeRecentDays("u1", { "2026-10-06": { steps: 200 } });
  expect(await loadHealthHistory("u1")).toEqual({
    "2026-06-01": { steps: 9000 },
    "2026-10-06": { steps: 200, sleepMinutes: 400 },
  });
  expect(await loadHealthHistory("u2")).toEqual({});
});

it("keeps data by default", async () => {
  await expect(isKeepingHealthData("u1")).resolves.toBe(true);
});
