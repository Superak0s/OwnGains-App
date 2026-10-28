import { requireOptionalNativeModule } from "expo";

interface ExactAlarmsModule {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
  canDrawOverlays(): boolean;
  openOverlaySettings(): void;
  scheduleAlarm(id: string, at: number, daily: boolean, title: string, body: string, channelId: string, snoozeSeconds: number): void;
  cancelAlarm(id: string): void;
  cancelAlarmsWithPrefix(prefixes: string[]): void;
  snoozeAlarm(id: string): void;
  dismissAlarm(id: string): void;
}

export default requireOptionalNativeModule<ExactAlarmsModule>("ExactAlarms");
