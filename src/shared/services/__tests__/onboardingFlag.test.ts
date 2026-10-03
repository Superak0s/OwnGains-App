const store: Record<string, string> = {};

jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItem: jest.fn(async (k: string) => store[k] ?? null),
  getStorageItemSync: jest.fn((k: string) => store[k] ?? null),
  setStorageItem: jest.fn(async (k: string, v: string) => {
    store[k] = v;
  }),
}));

import {
  isOnboardingComplete,
  setOnboardingComplete,
  restartOnboarding,
  onOnboardingChange,
} from "@shared/services/appMode";

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

it("treats a fresh install as needing onboarding", () => {
  expect(isOnboardingComplete()).toBe(false);
});

it("reads back as complete once a mode has been chosen", async () => {
  await setOnboardingComplete(true);
  expect(isOnboardingComplete()).toBe(true);
});

// The login screen and Settings change nothing themselves. They clear this
// flag, and AppNavigator swaps to the onboarding gate off the subscription.
it("re-opens the gate and notifies subscribers", async () => {
  await setOnboardingComplete(true);
  const seen: boolean[] = [];
  const unsubscribe = onOnboardingChange.subscribe((done) => seen.push(done));

  await restartOnboarding();

  expect(isOnboardingComplete()).toBe(false);
  expect(seen).toEqual([false]);
  unsubscribe();
});

it("stops notifying after unsubscribe", async () => {
  const seen: boolean[] = [];
  onOnboardingChange.subscribe((done) => seen.push(done))();
  await setOnboardingComplete(true);
  expect(seen).toEqual([]);
});
