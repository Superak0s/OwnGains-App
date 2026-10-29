import type * as NotificationsService from "@shared/services/notifications";
import type { AlertButton } from "@shared/components/CustomAlert";

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

describe("promptForExactAlarms", () => {
  const loadOn = (manufacturer: string, exactGranted = true) => {
    jest.resetModules();
    jest.doMock("../../../../modules/exact-alarms", () => ({
      __esModule: true,
      default: {
        canScheduleExactAlarms: () => exactGranted,
        openExactAlarmSettings: jest.fn(),
      },
    }));
    jest.doMock("../sqliteStorage", () => require("test-utils/memorySqlite"));
    const { Platform } = require("react-native");
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
    Object.defineProperty(Platform, "constants", {
      get: () => ({ Manufacturer: manufacturer }),
      configurable: true,
    });
    return require("@shared/services/notifications") as typeof NotificationsService;
  };

  it("points a Xiaomi user at battery saver and autostart, only once", async () => {
    const svc = loadOn("Xiaomi");
    const alert = jest.fn<void, [string, string, ...unknown[]]>();
    await svc.promptForExactAlarms(alert, "supplement reminders");
    await svc.promptForExactAlarms(alert, "supplement reminders");
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][1]).toContain("Autostart");
  });

  it("says nothing on a phone whose maker does not delay alarms", async () => {
    const alert = jest.fn<void, [string, string, ...unknown[]]>();
    await loadOn("Google").promptForExactAlarms(alert, "rest reminders");
    expect(alert).not.toHaveBeenCalled();
  });

  it("asks for the exact-alarm grant first when it is missing", async () => {
    const alert = jest.fn<void, [string, string, ...unknown[]]>();
    await loadOn("Xiaomi", false).promptForExactAlarms(alert, "rest reminders");
    expect(alert.mock.calls[0][0]).toBe("Allow on-time reminders");
  });
});

describe("promptForAlarmPermissions", () => {
  const loadWith = (exact: boolean, overlay: boolean, fullScreen = true) => {
    jest.resetModules();
    const openOverlaySettings = jest.fn();
    const openFullScreenIntentSettings = jest.fn();
    jest.doMock("../../../../modules/exact-alarms", () => ({
      __esModule: true,
      default: {
        canScheduleExactAlarms: () => exact,
        openExactAlarmSettings: jest.fn(),
        canDrawOverlays: () => overlay,
        openOverlaySettings,
        canUseFullScreenIntent: () => fullScreen,
        openFullScreenIntentSettings,
      },
    }));
    const { Platform } = require("react-native");
    Object.defineProperty(Platform, "OS", { get: () => "android", configurable: true });
    const mod = require("@shared/services/notifications") as typeof NotificationsService;
    return { mod, openOverlaySettings, openFullScreenIntentSettings };
  };

  it("asks for full screen on the lock screen when Android withholds it", async () => {
    const { mod, openFullScreenIntentSettings } = loadWith(true, true, false);
    const pressed: string[] = [];
    const alert = jest.fn(
      (title: string, _message: string, buttons?: AlertButton[]) => {
        pressed.push(title);
        buttons![title === "Ring on the lock screen" ? 1 : 0].onPress?.();
      },
    );
    const { AppState } = require("react-native");
    jest.spyOn(AppState, "addEventListener").mockImplementation((_: unknown, fn: unknown) => {
      queueMicrotask(() => (fn as (state: string) => void)("active"));
      return { remove: jest.fn() };
    });
    await mod.promptForAlarmPermissions(alert);

    expect(pressed[0]).toBe("Ring on the lock screen");
    expect(openFullScreenIntentSettings).toHaveBeenCalled();
  });

  it("asks to ring full screen once exact alarms are allowed", async () => {
    const { mod, openOverlaySettings } = loadWith(true, false);
    const alert = jest.fn(
      (_t: string, _m: string, buttons?: AlertButton[]) => buttons?.[0].onPress?.(),
    );
    await mod.promptForAlarmPermissions(alert);

    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe("Ring full screen");
    const buttons = alert.mock.calls[0][2] as { onPress?: () => void }[];
    buttons[1].onPress?.();
    expect(openOverlaySettings).toHaveBeenCalled();
  });

  it("asks for exact alarms, then full screen, when both are missing", async () => {
    const { mod, openOverlaySettings } = loadWith(false, false);
    const pressed: string[] = [];
    const alert = jest.fn(
      (title: string, _message: string, buttons?: AlertButton[]) => {
        const button = buttons![title === "Allow on-time alarms" ? 0 : 1];
        pressed.push(`${title}: ${button.text}`);
        button.onPress?.();
      },
    );
    await mod.promptForAlarmPermissions(alert);

    expect(pressed).toEqual([
      "Allow on-time alarms: Not now",
      "Ring full screen: Open settings",
    ]);
    expect(openOverlaySettings).toHaveBeenCalled();
  });

  it("waits for the user to come back from settings before the next prompt", async () => {
    const { mod } = loadWith(false, false);
    const { AppState } = require("react-native");
    let onChange: (state: string) => void = () => {};
    jest.spyOn(AppState, "addEventListener").mockImplementation((_: unknown, fn: unknown) => {
      onChange = fn as (state: string) => void;
      return { remove: jest.fn() };
    });
    const alert = jest.fn(
      (_t: string, _m: string, buttons?: AlertButton[]) => buttons?.[1].onPress?.(),
    );
    const done = mod.promptForAlarmPermissions(alert);
    await Promise.resolve();
    expect(alert).toHaveBeenCalledTimes(1);

    onChange("active");
    await done;
    expect(alert).toHaveBeenCalledTimes(2);
  });
});
