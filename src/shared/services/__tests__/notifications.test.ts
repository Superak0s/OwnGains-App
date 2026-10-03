import type * as NotificationsService from "@shared/services/notifications";

let service: typeof NotificationsService;

// Expo Go is detected once at import time, so each environment needs its own
// instance of the module. The non-Expo-Go path is not covered here: it reaches
// expo-notifications through a native dynamic import() that Jest's runtime
// cannot execute.
const loadInExpoGo = () => {
  jest.resetModules();
  jest.doMock("expo-constants", () => ({
    __esModule: true,
    ExecutionEnvironment: { StoreClient: "storeClient", Bare: "bare" },
    default: { executionEnvironment: "storeClient" },
  }));
  service = require("@shared/services/notifications");
};

beforeEach(loadInExpoGo);

it("has no notifications module inside Expo Go", async () => {
  expect(await service.getNotifications()).toBeNull();
});

it("refuses to schedule inside Expo Go", async () => {
  await expect(
    service.scheduleNotification({ content: {} } as never),
  ).rejects.toThrow("Notifications unavailable");
});

it("silently skips cancelling inside Expo Go", async () => {
  await expect(service.cancelNotification("x")).resolves.toBeUndefined();
});

describe("canScheduleExactAlarms without the native module", () => {
  const loadOnAndroid = (version: number) => {
    jest.resetModules();
    jest.doMock("../../../../modules/exact-alarms", () => ({ __esModule: true, default: null }));
    const { Platform } = require("react-native");
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
    Object.defineProperty(Platform, "Version", { get: () => version, configurable: true });
    return require("@shared/services/notifications") as typeof NotificationsService;
  };

  it("reports the grant as missing on Android 14+, where it is denied by default", () => {
    expect(loadOnAndroid(34).canScheduleExactAlarms()).toBe(false);
  });

  it("assumes the install-time grant below Android 14", () => {
    expect(loadOnAndroid(33).canScheduleExactAlarms()).toBe(true);
  });
});
