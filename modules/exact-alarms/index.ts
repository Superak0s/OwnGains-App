import { requireOptionalNativeModule } from "expo";

interface ExactAlarmsModule {
  canScheduleExactAlarms(): boolean;
  openExactAlarmSettings(): void;
}

export default requireOptionalNativeModule<ExactAlarmsModule>("ExactAlarms");
