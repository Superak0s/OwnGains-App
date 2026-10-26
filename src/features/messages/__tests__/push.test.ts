import type { Notification } from "expo-notifications";

const mockNotifications = {
  getDevicePushTokenAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
};
const mockApi = { registerPushToken: jest.fn(), unregisterPushToken: jest.fn() };

jest.mock("@shared/services/notifications", () => ({ getNotifications: async () => mockNotifications }));
jest.mock("../services", () => ({
  get messagesApi() {
    return mockApi;
  },
}));
jest.mock("../services/on/messages", () => ({
  get messagesApi() {
    return mockApi;
  },
}));
jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("@shared/services/crashReporting", () => ({ captureUnreported: jest.fn(), reportAndReturn: jest.fn() }));
const mockStore = new Map<string, unknown>();
const mockServerUrl = { current: "http://srv" };
jest.mock("@shared/services/config", () => ({ getServerUrl: () => mockServerUrl.current }));
jest.mock("@shared/services/storage", () => ({
  loadFromStorage: async (k: string) => mockStore.get(k) ?? null,
  saveToStorage: async (k: string, v: unknown) => mockStore.set(k, v),
  removeFromStorage: async (k: string) => mockStore.delete(k),
}));

import { getApps } from "@react-native-firebase/app";
import { captureUnreported } from "@shared/services/crashReporting";
import { messageSender, registerPushToken, serverPushesMessages, unregisterPushToken } from "../push";

const notification = (content: object, trigger: object | null = null) =>
  ({ request: { content: { data: {}, ...content }, trigger } }) as unknown as Notification;

describe("messageSender", () => {
  it("reads the sender from an FCM push or a local notification", () => {
    expect(messageSender(notification({}, { remoteMessage: { data: { type: "message", fromUuid: "u1" } } }))).toBe("u1");
    expect(messageSender(notification({ data: { type: "message", fromUuid: "u2" } }))).toBe("u2");
  });

  it("ignores other notifications", () => {
    expect(messageSender(notification({ data: { supplementId: 3 } }))).toBeNull();
    expect(messageSender(notification({ data: { type: "message" } }))).toBeNull();
  });
});

describe("push token", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.clear();
    mockServerUrl.current = "http://srv";
  });

  it("registers the device and unregisters it on sign-out", async () => {
    mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: "android", data: "tok" });
    mockApi.registerPushToken.mockResolvedValue(true);
    mockApi.unregisterPushToken.mockResolvedValue(undefined);

    await registerPushToken();
    expect(mockApi.registerPushToken).toHaveBeenCalledWith("tok");
    expect(serverPushesMessages()).toBe(true);

    await unregisterPushToken();
    expect(mockApi.unregisterPushToken).toHaveBeenCalledWith("http://srv", "tok");
    expect(serverPushesMessages()).toBe(false);
    await unregisterPushToken();
    expect(mockApi.unregisterPushToken).toHaveBeenCalledTimes(1);
  });

  it("unregisters from the server it registered with after the server URL changed", async () => {
    mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: "android", data: "tok" });
    mockApi.registerPushToken.mockResolvedValue(true);
    mockApi.unregisterPushToken.mockResolvedValue(undefined);
    await registerPushToken();

    mockServerUrl.current = "http://other";
    await unregisterPushToken();
    expect(mockApi.unregisterPushToken).toHaveBeenCalledWith("http://srv", "tok");
  });

  it("ignores a registration that finishes after sign-out", async () => {
    let finish!: (enabled: boolean) => void;
    mockNotifications.getDevicePushTokenAsync.mockResolvedValue({ type: "android", data: "late" });
    mockApi.registerPushToken.mockReturnValue(new Promise((resolve) => (finish = resolve)));

    const pending = registerPushToken();
    await new Promise(setImmediate);
    await unregisterPushToken();
    finish(true);
    await pending;
    expect(serverPushesMessages()).toBe(false);
  });

  it("skips FCM when the build has no Firebase config", async () => {
    (getApps as jest.Mock).mockReturnValueOnce([]);
    await registerPushToken();
    expect(mockNotifications.getDevicePushTokenAsync).not.toHaveBeenCalled();
    expect(serverPushesMessages()).toBe(false);
  });

  it("falls back to in-app notifications without reporting when FCM registration fails", async () => {
    mockNotifications.getDevicePushTokenAsync.mockRejectedValue(new Error("FCM Registration failed!"));
    await registerPushToken();
    expect(mockApi.registerPushToken).not.toHaveBeenCalled();
    expect(serverPushesMessages()).toBe(false);
    expect(captureUnreported).not.toHaveBeenCalled();
  });
});
