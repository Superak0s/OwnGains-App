const mockStored: Record<string, string> = {};
let mockMode = "online";

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: (key: string) => mockStored[key] ?? null,
  setStorageItem: jest.fn(async (key: string, value: string) => {
    mockStored[key] = value;
  }),
}));
jest.mock("@shared/services/appMode", () => ({
  getAppModeSync: () => mockMode,
}));
let mockServerStores: string[] | null = [];
jest.mock("@shared/services/localOnlyFeatures", () => ({
  getServerStoredFeatures: () => mockServerStores,
}));

import {
  TERMS_VERSION,
  hasAcceptedCurrentTerms,
  hasAcceptedEarlierTerms,
  recordTermsAcceptance,
} from "../termsAcceptance";

beforeEach(() => {
  for (const key of Object.keys(mockStored)) delete mockStored[key];
  mockMode = "online";
  mockServerStores = [];
});

describe("termsAcceptance", () => {
  it("requires health consent in online mode only", async () => {
    await recordTermsAcceptance("1", false);
    expect(hasAcceptedCurrentTerms("1")).toBe(false);
    mockMode = "offline";
    expect(hasAcceptedCurrentTerms("1")).toBe(true);
  });

  it("is per account", async () => {
    await recordTermsAcceptance("1", true);
    expect(hasAcceptedCurrentTerms("1")).toBe(true);
    expect(hasAcceptedCurrentTerms("2")).toBe(false);
    expect(hasAcceptedEarlierTerms("2")).toBe(false);
  });

  it("asks again when the terms version changes", () => {
    mockStored["@terms_acceptance_user_1"] = JSON.stringify({
      version: `before ${TERMS_VERSION}`,
      acceptedAt: "2026-01-01T00:00:00.000Z",
      healthConsent: true,
    });
    expect(hasAcceptedCurrentTerms("1")).toBe(false);
    expect(hasAcceptedEarlierTerms("1")).toBe(true);
  });

  it("asks again online when the server has no acceptance on record", async () => {
    await recordTermsAcceptance("1", true);
    expect(hasAcceptedCurrentTerms("1", null)).toBe(false);
    expect(hasAcceptedCurrentTerms("1", TERMS_VERSION)).toBe(true);
    expect(hasAcceptedCurrentTerms("1", undefined)).toBe(true);
    mockMode = "offline";
    expect(hasAcceptedCurrentTerms("1", null)).toBe(true);
  });

  it("asks again online when the server has no health consent on record", async () => {
    await recordTermsAcceptance("1", true);
    expect(hasAcceptedCurrentTerms("1", TERMS_VERSION, null)).toBe(false);
    expect(hasAcceptedCurrentTerms("1", TERMS_VERSION, "2026-09-01")).toBe(true);
    mockMode = "offline";
    expect(hasAcceptedCurrentTerms("1", TERMS_VERSION, null)).toBe(true);
  });

  it("asks again when the server starts storing more health data", async () => {
    await recordTermsAcceptance("1", true);
    mockServerStores = ["tracking"];
    expect(hasAcceptedCurrentTerms("1")).toBe(false);
    await recordTermsAcceptance("1", true);
    expect(hasAcceptedCurrentTerms("1")).toBe(true);
    mockServerStores = null;
    expect(hasAcceptedCurrentTerms("1")).toBe(true);
  });

  it("treats a corrupt record as not accepted", () => {
    mockStored["@terms_acceptance_user_1"] = "{";
    expect(hasAcceptedCurrentTerms("1")).toBe(false);
  });
});
