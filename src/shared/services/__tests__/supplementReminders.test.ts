jest.mock("../sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);
jest.mock("../notifications", () => {
  const getNotifications = jest.fn();
  return {
    getNotifications,
    // The real wrapper strips `sound` from the content before delegating.
    scheduleNotification: jest.fn(
      async (options: { content: Record<string, unknown> }) => {
        const mod = await getNotifications();
        const { sound: _sound, ...content } = options.content;
        return mod.scheduleNotificationAsync({ ...options, content });
      },
    ),
  };
});

import { Platform } from "react-native";
import { kv, resetMemorySqlite } from "test-utils/memorySqlite";
import { getNotifications } from "../notifications";
import {
  cancelAllSupplementReminders,
  cancelTimeReminder,
  initializeSupplementNotifications,
  pruneOrphanedSupplementReminders,
  removeSupplementReminderConfig,
  saveSupplementReminderConfig,
  scheduleTimeReminder,
  type SupplementReminderConfig,
} from "../supplementReminders";

const makeNotifications = () => ({
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  setNotificationChannelAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async (_request: unknown) => "notif-1"),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  AndroidNotificationPriority: { HIGH: "high" },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
});

type Notifications = ReturnType<typeof makeNotifications>;

type ScheduledRequest = {
  identifier: string;
  trigger: unknown;
  content: { channelId?: string; title: string };
};

const scheduledRequest = () =>
  notifications.scheduleNotificationAsync.mock.calls[0][0] as ScheduledRequest;

let notifications: Notifications;

const setPlatform = (os: string) =>
  Object.defineProperty(Platform, "OS", { value: os, configurable: true });

const originalOS = Platform.OS;

const config = (supplementId: number, extra = {}): SupplementReminderConfig =>
  ({
    supplementId,
    name: `S${supplementId}`,
    unit: "g",
    defaultAmount: 5,
    timeBasedEnabled: true,
    reminderTime: "08:00",
    enabled: true,
    ...extra,
  });

const storedConfigs = () =>
  JSON.parse(kv.supplementReminderConfigs_user_42 ?? "[]");

beforeEach(() => {
  resetMemorySqlite();
  jest.clearAllMocks();
  notifications = makeNotifications();
  (getNotifications as jest.Mock).mockResolvedValue(notifications);
});

afterEach(() => setPlatform(originalOS));

describe("saveSupplementReminderConfig", () => {
  it("appends a new config and replaces one with the same id", async () => {
    await saveSupplementReminderConfig("42", config(1));
    await saveSupplementReminderConfig("42", config(2));
    expect(storedConfigs()).toHaveLength(2);

    await saveSupplementReminderConfig("42", config(1, { reminderTime: "20:00" }));
    expect(storedConfigs()).toHaveLength(2);
    expect(storedConfigs()[0].reminderTime).toBe("20:00");
  });

  it("keeps each user's configs apart", async () => {
    await saveSupplementReminderConfig("42", config(1));
    await saveSupplementReminderConfig("7", config(1));
    expect(storedConfigs()).toHaveLength(1);
    expect(JSON.parse(kv.supplementReminderConfigs_user_7)).toHaveLength(1);
  });
});

describe("removeSupplementReminderConfig", () => {
  it("drops just that supplement", async () => {
    await saveSupplementReminderConfig("42", config(1));
    await saveSupplementReminderConfig("42", config(2));

    await removeSupplementReminderConfig("42", 1);
    expect(storedConfigs().map((c: SupplementReminderConfig) => c.supplementId)).toEqual([2]);
  });

  it("writes an empty list when the user has no configs stored", async () => {
    await removeSupplementReminderConfig("42", 1);
    expect(kv.supplementReminderConfigs_user_42).toBe("[]");
  });
});

describe("pruneOrphanedSupplementReminders", () => {
  it("drops and cancels reminders for supplements the store no longer lists", async () => {
    await saveSupplementReminderConfig("42", config(1));
    await saveSupplementReminderConfig("42", config(2));
    await saveSupplementReminderConfig("42", config(3));
    notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: "supplement-time-42-1" },
      { identifier: "supplement-time-42-2" },
    ] as never);

    expect(await pruneOrphanedSupplementReminders("42", [1, 3])).toEqual([2]);

    expect(storedConfigs().map((c: SupplementReminderConfig) => c.supplementId)).toEqual([1, 3]);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "supplement-time-42-2",
    );
  });

  it("leaves everything alone when every reminder still has its supplement", async () => {
    await saveSupplementReminderConfig("42", config(1));

    expect(await pruneOrphanedSupplementReminders("42", [1, 2])).toEqual([]);
    expect(storedConfigs()).toHaveLength(1);
    expect(notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
  });
});

describe("initializeSupplementNotifications", () => {
  it("creates every Android channel when permission is already granted", async () => {
    setPlatform("android");
    expect(await initializeSupplementNotifications()).toBe(true);

    expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(3);
    expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
      "supplement-alarms",
      expect.objectContaining({ importance: 5 }),
    );
  });

  it("skips channel creation off Android", async () => {
    setPlatform("ios");
    expect(await initializeSupplementNotifications()).toBe(true);
    expect(notifications.setNotificationChannelAsync).not.toHaveBeenCalled();
  });

  it("asks for permission when it has not been granted yet", async () => {
    notifications.getPermissionsAsync.mockResolvedValueOnce({
      status: "undetermined",
    });
    expect(await initializeSupplementNotifications()).toBe(true);
    expect(notifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it("gives up when permission is denied", async () => {
    notifications.getPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
    });
    notifications.requestPermissionsAsync.mockResolvedValueOnce({
      status: "denied",
    });
    expect(await initializeSupplementNotifications()).toBe(false);
  });

  it("succeeds even if the channels already exist", async () => {
    setPlatform("android");
    notifications.setNotificationChannelAsync.mockRejectedValueOnce(
      new Error("exists"),
    );
    expect(await initializeSupplementNotifications()).toBe(true);
  });

  it("is false when the permission check throws or notifications are unavailable", async () => {
    notifications.getPermissionsAsync.mockRejectedValueOnce(new Error("nope"));
    expect(await initializeSupplementNotifications()).toBe(false);

    (getNotifications as jest.Mock).mockResolvedValueOnce(null);
    expect(await initializeSupplementNotifications()).toBe(false);
  });
});

describe("scheduleTimeReminder", () => {
  it("arms a repeating daily trigger and remembers the identifier", async () => {
    setPlatform("android");
    const id = await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30");

    expect(id).toBe("notif-1");
    expect(kv.supplementTimeNotifId_1_user_42).toBe("notif-1");

    const arg = scheduledRequest();
    expect(arg.identifier).toBe("supplement-time-42-1");
    expect(arg.trigger).toEqual({ type: "daily", hour: 8, minute: 30 });
    expect(arg.content.channelId).toBe("supplement-reminders");
    expect(arg.content.title).toBe("💊 Time for Creatine!");
  });

  it("routes an alarm to its own MAX-importance channel", async () => {
    setPlatform("android");
    await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30", "alarm");

    const arg = scheduledRequest();
    expect(arg.content.channelId).toBe("supplement-alarms");
  });

  it("falls back to the default channel for an unknown type", async () => {
    setPlatform("android");
    await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30", "siren");

    const arg = scheduledRequest();
    expect(arg.content.channelId).toBe("supplement-reminders");
  });

  it("sets no channel off Android", async () => {
    setPlatform("ios");
    await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30");

    const arg = scheduledRequest();
    expect(arg.content.channelId).toBeUndefined();
  });

  it("refuses a malformed or out-of-range time rather than defaulting to midnight", async () => {
    for (const bad of ["nonsense", "25:00", "12:99", ""]) {
      expect(
        await scheduleTimeReminder("42", 1, "Creatine", 5, "g", bad),
      ).toBeNull();
    }
    expect(notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("is null when notifications are unavailable or scheduling throws", async () => {
    (getNotifications as jest.Mock).mockResolvedValueOnce(null);
    expect(
      await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30"),
    ).toBeNull();

    notifications.scheduleNotificationAsync.mockRejectedValueOnce(
      new Error("nope"),
    );
    expect(
      await scheduleTimeReminder("42", 1, "Creatine", 5, "g", "08:30"),
    ).toBeNull();
    expect(kv.supplementTimeNotifId_1_user_42).toBeUndefined();
  });
});

describe("cancelTimeReminder", () => {
  it("cancels only this supplement's scheduled notification", async () => {
    notifications.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "supplement-time-42-1" },
      { identifier: "supplement-time-42-2" },
      { identifier: "supplement-time-7-1" },
    ] as never);

    await cancelTimeReminder("42", 1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "supplement-time-42-1",
    );
  });

  it("resolves without throwing when notifications are unavailable or the lookup throws", async () => {
    (getNotifications as jest.Mock).mockResolvedValueOnce(null);
    await expect(cancelTimeReminder("42", 1)).resolves.toBeUndefined();

    notifications.getAllScheduledNotificationsAsync.mockRejectedValueOnce(
      new Error("nope"),
    );
    await expect(cancelTimeReminder("42", 1)).resolves.toBeUndefined();
  });
});

describe("cancelAllSupplementReminders", () => {
  it("cancels every time and dose reminder of that user and no one else's", async () => {
    notifications.getAllScheduledNotificationsAsync.mockResolvedValueOnce([
      { identifier: "supplement-time-4-1" },
      { identifier: "supplement-dose-4-2" },
      { identifier: "supplement-time-42-1" },
      { identifier: "rest-reminder" },
    ] as never);

    await cancelAllSupplementReminders("4");
    expect(
      notifications.cancelScheduledNotificationAsync.mock.calls.map((c: unknown[]) => c[0]),
    ).toEqual(["supplement-time-4-1", "supplement-dose-4-2"]);
  });
});

// A truncated row must not throw: the caller has already deleted the supplement,
// and an exception here leaves its reminder firing daily forever.
describe("corrupt config storage", () => {
  it("is treated as empty rather than throwing", async () => {
    kv.supplementReminderConfigs_user_42 = "{not json";
    await expect(removeSupplementReminderConfig("42", 1)).resolves.toBeUndefined();

    kv.supplementReminderConfigs_user_42 = "{not json";
    await saveSupplementReminderConfig("42", config(1));
    expect(storedConfigs()).toHaveLength(1);
  });
});
