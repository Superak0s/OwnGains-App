jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"));
jest.mock("react-native-health-connect", () => ({ readRecords: jest.fn() }));
jest.mock("../healthConnect", () => ({
  ...jest.requireActual("../healthConnect"),
  getGrantedTypes: jest.fn(),
}));
jest.mock("@features/tracking/services", () => ({
  bodyTrackingApi: { getWeightHistory: jest.fn(), logWeight: jest.fn() },
  bodyFatApi: { getBodyFatHistory: jest.fn(), logBodyFat: jest.fn() },
  hydrationApi: { getHydrationHistory: jest.fn(), logHydration: jest.fn() },
  macrosTrackingApi: { getMacrosHistory: jest.fn(), logMacros: jest.fn() },
}));
jest.mock("@shared/services/crashReporting", () => ({
  ...jest.requireActual("@shared/services/crashReporting"),
  captureException: jest.fn(),
}));

import { readRecords } from "react-native-health-connect";
import { resetMemorySqlite } from "test-utils/memorySqlite";
import {
  bodyFatApi,
  bodyTrackingApi,
  hydrationApi,
  macrosTrackingApi,
} from "@features/tracking/services";
import { ApiError } from "@shared/services/apiError";
import { captureException } from "@shared/services/crashReporting";
import { setRecordStoreUser } from "@shared/services/offlineHelpers";
import { loadFromStorage, STORAGE_KEYS } from "@shared/services/storage";
import { getGrantedTypes } from "../healthConnect";
import { syncHealthConnect } from "../importer";

const NOW = "2026-10-05T12:00:00.000Z";
const local = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).toISOString();

const weight = (id: string, time: string, kg: number) =>
  ({ metadata: { id }, time, weight: { inKilograms: kg } });
const bodyFat = (id: string, time: string, percentage: number) =>
  ({ metadata: { id }, time, percentage });
const hydration = (id: string, startTime: string, ml: number) =>
  ({ metadata: { id }, startTime, endTime: startTime, volume: { inMilliliters: ml } });
const nutrition = (
  id: string,
  startTime: string,
  { name, kcal, protein }: { name?: string; kcal?: number; protein?: number },
) => ({
  metadata: { id },
  startTime,
  endTime: startTime,
  name,
  energy: kcal == null ? undefined : { inKilocalories: kcal },
  protein: protein == null ? undefined : { inGrams: protein },
});

let records: Record<string, object[]> = {};

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(NOW) });
  resetMemorySqlite();
  jest.clearAllMocks();
  records = {};
  setRecordStoreUser("u1");
  jest.mocked(getGrantedTypes).mockResolvedValue(["Weight", "BodyFat", "Hydration", "Nutrition"]);
  jest.mocked(readRecords).mockImplementation(
    async (type: string) => ({ records: records[type] ?? [] }) as never,
  );
  jest.mocked(bodyTrackingApi.getWeightHistory).mockResolvedValue({ entries: [] });
  jest.mocked(bodyFatApi.getBodyFatHistory).mockResolvedValue({ entries: [] });
  jest.mocked(hydrationApi.getHydrationHistory).mockResolvedValue({ success: true, data: [] });
  jest.mocked(macrosTrackingApi.getMacrosHistory).mockResolvedValue({ entries: [] });
});

afterEach(() => jest.useRealTimers());

it("writes each record type through its tracking API", async () => {
  records.Weight = [weight("w1", local(4, 7), 80.04)];
  records.BodyFat = [bodyFat("b1", local(4, 7), 18.26)];
  records.Hydration = [hydration("h1", local(4, 9), 249.6)];
  records.Nutrition = [nutrition("n1", local(4, 0, 30), { name: "Oats", kcal: 389.4, protein: 16.89 })];

  await expect(syncHealthConnect("u1", true)).resolves.toEqual({ imported: 4, failed: [] });

  expect(bodyTrackingApi.logWeight).toHaveBeenCalledWith(80, "kg", "Health Connect", local(4, 7));
  expect(bodyFatApi.logBodyFat).toHaveBeenCalledWith(18.3, null, null, local(4, 7));
  expect(hydrationApi.logHydration).toHaveBeenCalledWith(250, "Health Connect", local(4, 9));
  expect(macrosTrackingApi.logMacros).toHaveBeenCalledWith({
    name: "Oats",
    calories: 389,
    protein: 16.9,
    date: "2026-10-04",
    time: "00:30",
  });
});

it("reads the last 30 days and follows page tokens", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["Weight"]);
  jest.mocked(readRecords)
    .mockResolvedValueOnce({ records: [weight("w1", local(3, 7), 80)], pageToken: "next" } as never)
    .mockResolvedValueOnce({ records: [weight("w2", local(4, 7), 81)], pageToken: "" } as never);

  await syncHealthConnect("u1", true);

  expect(jest.mocked(readRecords).mock.calls[0][1]).toMatchObject({
    timeRangeFilter: { operator: "between", startTime: "2026-09-05T12:00:00.000Z", endTime: NOW },
  });
  expect(jest.mocked(readRecords).mock.calls[1][1]).toMatchObject({ pageToken: "next" });
  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(2);
});

it("reads only the granted types", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["Hydration", "Steps"]);
  await syncHealthConnect("u1", true);
  expect(jest.mocked(readRecords).mock.calls.map((call) => call[0])).toEqual(["Hydration"]);
});

it("skips records already imported, separately per user", async () => {
  records.Weight = [weight("w1", local(4, 7), 80)];
  await syncHealthConnect("u1", true);
  await syncHealthConnect("u1", true);
  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(1);

  setRecordStoreUser("u2");
  await syncHealthConnect("u2", true);
  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(2);
});

it("skips records that match an existing entry and writes the rest", async () => {
  jest.mocked(bodyTrackingApi.getWeightHistory).mockResolvedValue({
    entries: [{ id: 1, weightKg: "80.1", recordedAt: local(4, 20) }],
  });
  jest.mocked(bodyFatApi.getBodyFatHistory).mockResolvedValue({
    entries: [{ id: 2, percentage: 18, calculatedAt: local(4, 20) }] as never,
  });
  jest.mocked(hydrationApi.getHydrationHistory).mockResolvedValue({
    success: true,
    data: [{ id: 3, amountMl: 250, loggedAt: local(4, 9), createdAt: local(4, 9) }],
  });
  jest.mocked(macrosTrackingApi.getMacrosHistory).mockResolvedValue({
    entries: [
      { id: 4, calories: 400, loggedAt: local(4, 12) },
      { id: 5, calories: null, name: "Coffee", takenAt: local(4, 8) } as never,
    ],
  });
  records.Weight = [weight("w1", local(4, 7), 80), weight("w2", local(4, 7, 5), 80.3)];
  records.BodyFat = [bodyFat("b1", local(4, 7), 18.1), bodyFat("b2", local(3, 7), 18)];
  records.Hydration = [hydration("h1", local(4, 9), 250), hydration("h2", local(4, 9), 500)];
  records.Nutrition = [
    nutrition("n1", local(4, 12), { kcal: 400 }),
    nutrition("n2", local(4, 8), { name: "Coffee", protein: 0.3 }),
    nutrition("n3", local(4, 8), { name: "Tea", protein: 0.1 }),
  ];

  await expect(syncHealthConnect("u1", true)).resolves.toEqual({ imported: 4, failed: [] });

  expect(jest.mocked(bodyTrackingApi.logWeight).mock.calls.map((c) => c[0])).toEqual([80.3]);
  expect(jest.mocked(bodyFatApi.logBodyFat).mock.calls.map((c) => c[3])).toEqual([local(3, 7)]);
  expect(jest.mocked(hydrationApi.logHydration).mock.calls.map((c) => c[0])).toEqual([500]);
  expect(jest.mocked(macrosTrackingApi.logMacros).mock.calls.map((c) => c[0].name)).toEqual(["Tea"]);
});

it("writes two identical records in one batch once", async () => {
  records.Hydration = [hydration("h1", local(4, 9), 250), hydration("h2", local(4, 9), 250)];
  await syncHealthConnect("u1", true);
  expect(hydrationApi.logHydration).toHaveBeenCalledTimes(1);
});

it("stops a type at its first failed write, without reporting a 4xx, and retries it next sync", async () => {
  records.Weight = [weight("w1", local(4, 7), 80), weight("w2", local(3, 7), 81)];
  records.Hydration = [hydration("h1", local(4, 9), 250)];
  jest.mocked(bodyTrackingApi.logWeight).mockRejectedValueOnce(new ApiError("Bad request", 400));

  await expect(syncHealthConnect("u1", true)).resolves.toEqual({ imported: 1, failed: ["Weight"] });
  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(1);
  expect(captureException).not.toHaveBeenCalled();

  await syncHealthConnect("u1", true);
  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(3);
  expect(hydrationApi.logHydration).toHaveBeenCalledTimes(1);
});

it("reports server and read failures without stopping the other types", async () => {
  records.Hydration = [hydration("h1", local(4, 9), 250)];
  records.Nutrition = [nutrition("n1", local(4, 12), { kcal: 300 })];
  jest.mocked(hydrationApi.logHydration).mockRejectedValueOnce(new ApiError("Unavailable", 503));
  jest.mocked(readRecords).mockImplementation(async (type: string) => {
    if (type === "Weight") throw new Error("SecurityException");
    return { records: records[type] ?? [] } as never;
  });

  await expect(syncHealthConnect("u1", true)).resolves.toEqual({
    imported: 1,
    failed: ["Weight", "Hydration"],
  });
  expect(captureException).toHaveBeenCalledTimes(2);
  expect(captureException).toHaveBeenCalledWith(expect.any(Error), {
    feature: "healthConnect",
    recordType: "Weight",
  });
});

it("forgets imported ids once they leave the 30 day window", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["Weight"]);
  records.Weight = [weight("w1", local(4, 7), 80)];
  await syncHealthConnect("u1", true);

  jest.setSystemTime(new Date("2026-11-20T12:00:00.000Z"));
  records.Weight = [];
  await syncHealthConnect("u1", true);

  expect(await loadFromStorage(STORAGE_KEYS.HEALTH_CONNECT_IMPORTED, "u1")).toEqual({});
});

it("stops writing when the signed-in account changes mid-run", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["Weight", "Hydration"]);
  records.Weight = [weight("w1", local(4, 7), 80), weight("w2", local(3, 7), 81)];
  records.Hydration = [hydration("h1", local(4, 9), 250)];
  jest.mocked(bodyTrackingApi.logWeight).mockImplementationOnce(async () => {
    setRecordStoreUser("u2");
    return undefined as never;
  });

  await syncHealthConnect("u1", true);

  expect(bodyTrackingApi.logWeight).toHaveBeenCalledTimes(1);
  expect(hydrationApi.logHydration).not.toHaveBeenCalled();
  expect(await loadFromStorage(STORAGE_KEYS.HEALTH_CONNECT_IMPORTED, "u1")).toEqual({
    w1: local(4, 7),
  });
});

it("throttles automatic syncs to one per 15 minutes and shares a running sync", async () => {
  jest.mocked(getGrantedTypes).mockResolvedValue(["Weight"]);

  const [automatic, manual] = await Promise.all([
    syncHealthConnect("u1"),
    syncHealthConnect("u1", true),
  ]);
  expect(automatic).toBe(manual);
  expect(readRecords).toHaveBeenCalledTimes(1);

  await expect(syncHealthConnect("u1")).resolves.toBeNull();
  jest.setSystemTime(new Date(Date.now() + 15 * 60 * 1000));
  await expect(syncHealthConnect("u1")).resolves.not.toBeNull();
});
