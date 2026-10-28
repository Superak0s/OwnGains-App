import ExactAlarms from "../../../modules/exact-alarms";

export const DEFAULT_SNOOZE_SECONDS = 600;

export const formatSnooze = (seconds: number): string =>
  seconds < 60 ? `${seconds} sec` : `${Math.round(seconds / 60)} min`;

export const ALARM_SCREEN = "AlarmScreen";

export const alarmsAvailable = ExactAlarms != null;

export interface AlarmContent {
  id: string;
  channelId: string;
  title: string;
  body: string;
  snoozeSeconds?: number;
}

export const scheduleAlarm = (
  { id, channelId, title, body, snoozeSeconds = DEFAULT_SNOOZE_SECONDS }: AlarmContent,
  at: Date,
  daily: boolean,
): string => {
  ExactAlarms?.scheduleAlarm(id, at.getTime(), daily, title, body, channelId, snoozeSeconds);
  return id;
};

export const cancelAlarm = (id: string): void => ExactAlarms?.cancelAlarm(id);

export const cancelAlarmsWithPrefix = (prefixes: string[]): void =>
  ExactAlarms?.cancelAlarmsWithPrefix(prefixes);

export const snoozeAlarm = (id: string): void => ExactAlarms?.snoozeAlarm(id);

export const dismissAlarm = (id: string): void => ExactAlarms?.dismissAlarm(id);
