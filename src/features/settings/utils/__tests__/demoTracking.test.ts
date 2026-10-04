const mockState = {
  nextId: 1,
  deleted: [] as string[],
  local: new Set<string>(),
  store: new Map<string, unknown>(),
  kv: new Map<string, string>(),
};
const mockCreated = () => Promise.resolve({ data: { id: mockState.nextId++ } });
const mockDel = (kind: string, id: number) => {
  mockState.deleted.push(`${kind}:${id}`);
  return Promise.resolve({ success: true });
};

jest.mock("@features/tracking/services/index", () => ({
  bodyTrackingApi: { logWeight: () => mockCreated(), deleteWeightEntry: (id: number) => mockDel("weight", id) },
  bodyFatApi: { logBodyFat: () => mockCreated(), deleteBodyFatEntry: (id: number) => mockDel("bodyFat", id) },
  macrosTrackingApi: { logMacros: () => mockCreated(), deleteMacrosEntry: (id: number) => mockDel("macros", id) },
  hydrationApi: { logHydration: () => mockCreated(), deleteHydrationEntry: (id: number) => mockDel("hydration", id) },
  bodyMeasurementsApi: { logMeasurement: () => mockCreated(), deleteMeasurementEntry: (id: number) => mockDel("measurement", id) },
  sorenessApi: { logSoreness: () => mockCreated(), deleteSorenessEntry: (id: number) => mockDel("soreness", id) },
  injuryApi: { logInjury: () => mockCreated(), deleteInjury: (id: number) => mockDel("injury", id) },
  personalNotesApi: { createNote: () => mockCreated(), deleteNote: (id: number) => mockDel("note", id) },
  menstrualApi: { logMenstrualCycle: () => mockCreated(), deleteMenstrualEntry: (id: number) => mockDel("menstrual", id) },
  progressPhotoApi: { uploadPhoto: () => mockCreated(), deletePhoto: (id: number) => mockDel("photo", id) },
}));
jest.mock("expo-asset", () => ({
  Asset: { fromModule: () => ({ downloadAsync: async () => ({ localUri: "file:///demo.jpg" }) }) },
}));
jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: async (key: string) => mockState.kv.get(key) ?? null,
  setStorageItem: async (key: string, value: string) => {
    mockState.kv.set(key, value);
  },
  removeStorageItem: async (key: string) => {
    mockState.deleted.push(`height:${key}`);
    mockState.kv.delete(key);
  },
}));
jest.mock("@features/supplements/services/index", () => ({
  supplementsApi: {
    create: () => Promise.resolve({ supplement: { id: mockState.nextId++ } }),
    log: jest.fn(() => Promise.resolve({ success: true })),
    delete: (id: number) => mockDel("supplement", id),
  },
}));

jest.mock("@shared/services/storage", () => ({
  getUserKey: (key: string, user: string) => `${user}_${key}`,
  saveToStorage: async (key: string, value: unknown, user: string) => {
    mockState.store.set(key + user, value);
  },
  loadFromStorage: async (key: string, user: string) =>
    mockState.store.get(key + user) ?? null,
  removeFromStorage: async (key: string, user: string) => {
    mockState.store.delete(key + user);
  },
}));
jest.mock("@shared/services/appMode", () => ({ isServerless: async () => false }));
jest.mock("@shared/services/localOnlyFeatures", () => ({
  isFeatureLocal: async (f: string) => mockState.local.has(f),
}));

import { clearDemoTracking, fillDemoTracking } from "../demoTracking";

beforeEach(() => {
  mockState.deleted.length = 0;
  mockState.local.clear();
});

describe("demo tracking", () => {
  it("only sets a height when none is known, even when the server stores tracking", async () => {
    expect(await fillDemoTracking("u1", 180)).toBe(0);
    expect(await fillDemoTracking("u1")).toBe(1);
    expect(mockState.kv.get("u1_height_cm")).toBe("178");
    expect(await clearDemoTracking("u1")).toBe(1);
    expect(mockState.kv.has("u1_height_cm")).toBe(false);
    mockState.kv.set("u1_height_cm", "170");
    expect(await fillDemoTracking("u1")).toBe(0);
    mockState.kv.clear();
  });

  it("deletes exactly what it created, and a refill replaces the previous fill", async () => {
    mockState.local.add("tracking");
    mockState.local.add("supplements");
    const first = await fillDemoTracking("u1");
    expect(first).toBeGreaterThan(50);
    const second = await fillDemoTracking("u1");
    expect(mockState.deleted).toHaveLength(first);
    mockState.deleted.length = 0;
    expect(await clearDemoTracking("u1")).toBe(second);
    expect(mockState.deleted.filter((d) => d.startsWith("supplement"))).toHaveLength(3);
    expect(mockState.deleted.filter((d) => d.startsWith("photo"))).toHaveLength(30);
    expect(await clearDemoTracking("u1")).toBe(0);
  });
});
