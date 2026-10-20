import { create, act } from "react-test-renderer";

let mockLastSetEndTime: string | null = null;
const mockScheduleReminder = jest.fn();
const mockCancelReminder = jest.fn(async (_id: string) => {});

jest.mock("@shared/context/WorkoutContext", () => ({
  useWorkoutPick: () => ({ lastSetEndTime: mockLastSetEndTime }),
}));
jest.mock("@shared/services/notifications", () => ({
  scheduleReminder: (id: string, build: unknown) =>
    mockScheduleReminder(id, build),
  cancelReminder: (id: string) => mockCancelReminder(id),
}));
jest.mock("@shared/services/supplementReminders", () => ({
  initializeSupplementNotifications: async () => true,
  WORKOUT_TIMER_CHANNEL: "workout-timers",
  ALARM_CHANNEL: "alarms",
}));
const mockScheduleAlarm = jest.fn();
const mockCancelAlarm = jest.fn();
jest.mock("@shared/services/supplementAlarms", () => ({
  alarmsAvailable: true,
  scheduleAlarm: (...args: unknown[]) => mockScheduleAlarm(...args),
  cancelAlarm: (id: string) => mockCancelAlarm(id),
}));

import { useRestReminder } from "../useRestReminder";

const Notifications = {
  AndroidNotificationPriority: { HIGH: "high" },
  SchedulableTriggerInputTypes: { DATE: "date" },
};

const Harness = (props: { enabled?: boolean; asAlarm?: boolean }) => {
  useRestReminder({
    enabled: props.enabled ?? true,
    workoutStartTime: "2026-10-05T10:00:00.000Z",
    isCurrentDayLocked: false,
    restReminderEnabled: true,
    restReminderSeconds: 90,
    asAlarm: props.asAlarm ?? false,
  });
  return null;
};

const render = async (enabled?: boolean, asAlarm?: boolean) => {
  await act(async () => {
    create(<Harness enabled={enabled} asAlarm={asAlarm} />);
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockScheduleReminder.mockImplementation(async () => {});
});

it("fires 90s after the set ended, not 90s after a relaunch remounts the hook", async () => {
  const setEnded = Date.now() - 30_000;
  mockLastSetEndTime = new Date(setEnded).toISOString();
  await render();

  const [id, build] = mockScheduleReminder.mock.calls[0];
  expect(id).toBe("workout-rest-reminder");
  const options = await build(Notifications);
  expect(options.trigger).toEqual({ type: "date", date: setEnded + 90_000 });
});

it("cancels instead of scheduling once the rest window has passed", async () => {
  mockLastSetEndTime = new Date(Date.now() - 120_000).toISOString();
  await render();

  expect(mockScheduleReminder).not.toHaveBeenCalled();
  expect(mockCancelReminder).toHaveBeenCalledWith("workout-rest-reminder");
});

it("leaves the device's own reminder alone in the trainer's act-as pane", async () => {
  mockLastSetEndTime = null;
  await render(false);

  expect(mockScheduleReminder).not.toHaveBeenCalled();
  expect(mockCancelReminder).not.toHaveBeenCalled();
});

it("rings the native alarm instead of a notification when set to Alarm", async () => {
  const setEnded = Date.now() - 30_000;
  mockLastSetEndTime = new Date(setEnded).toISOString();
  await render(true, true);

  expect(mockScheduleReminder).not.toHaveBeenCalled();
  expect(mockCancelReminder).toHaveBeenCalledWith("workout-rest-reminder");
  const [content, at, daily] = mockScheduleAlarm.mock.calls[0];
  expect(content).toMatchObject({
    id: "workout-rest-reminder",
    channelId: "alarms",
    snoozeSeconds: 30,
  });
  expect((at as Date).getTime()).toBe(setEnded + 90_000);
  expect(daily).toBe(false);
});
