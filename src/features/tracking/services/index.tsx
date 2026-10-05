import { createDispatchProxy } from "@shared/services/dispatchProxy";
import * as bodyStatsOn from "./on/bodyStats";
import * as bodyStatsOff from "./off/bodyStats";
import * as macrosOn from "./on/macros";
import * as macrosOff from "./off/macros";
import * as hydrationOn from "./on/hydration";
import * as hydrationOff from "./off/hydration";
import * as sorenessOn from "./on/soreness";
import * as sorenessOff from "./off/soreness";
import * as injuryOn from "./on/injury";
import * as injuryOff from "./off/injury";
import * as progressPhotoOn from "./on/progressPhoto";
import * as progressPhotoOff from "./off/progressPhoto";
import * as personalNotesOn from "./on/personalNotes";
import * as personalNotesOff from "./off/personalNotes";
import * as bodyMeasurementsOn from "./on/bodyMeasurements";
import * as bodyMeasurementsOff from "./off/bodyMeasurements";
import * as menstrualOn from "./on/menstrual";
import * as menstrualOff from "./off/menstrual";
import * as customMeasurementsOn from "./on/customMeasurements";
import * as customMeasurementsOff from "./off/customMeasurements";

const dispatch = <T extends Parameters<typeof createDispatchProxy>[0]>(
  name: string,
  on: T,
  off: T,
): T => createDispatchProxy(on, off, "tracking", `tracking.${name}`);

export const bodyTrackingApi = dispatch("body", bodyStatsOn.bodyTrackingApi, bodyStatsOff.bodyTrackingApi);
export const bodyFatApi = dispatch("bodyfat", bodyStatsOn.bodyFatApi, bodyStatsOff.bodyFatApi);
export const macrosTrackingApi = dispatch("macros", macrosOn.macrosTrackingApi, macrosOff.macrosTrackingApi);
export const hydrationApi = dispatch("hydration", hydrationOn.hydrationApi, hydrationOff.hydrationApi);
export const sorenessApi = dispatch("soreness", sorenessOn.sorenessApi, sorenessOff.sorenessApi);
export const injuryApi = dispatch("injury", injuryOn.injuryApi, injuryOff.injuryApi);
export const progressPhotoApi = dispatch("photos", progressPhotoOn.progressPhotoApi, progressPhotoOff.progressPhotoApi);
export const personalNotesApi = dispatch("notes", personalNotesOn.personalNotesApi, personalNotesOff.personalNotesApi);
export const bodyMeasurementsApi = dispatch("measurements", bodyMeasurementsOn.bodyMeasurementsApi, bodyMeasurementsOff.bodyMeasurementsApi);
export const menstrualApi = dispatch("menstrual", menstrualOn.menstrualApi, menstrualOff.menstrualApi);
export const customMeasurementsApi = dispatch("custom_measurements", customMeasurementsOn.customMeasurementsApi, customMeasurementsOff.customMeasurementsApi);

export const { getCurrentBodyWeight } = dispatch(
  "body",
  { getCurrentBodyWeight: bodyStatsOn.getCurrentBodyWeight },
  { getCurrentBodyWeight: bodyStatsOff.getCurrentBodyWeight },
);

export type {
  CustomMeasurementType,
  CustomMeasurementValue,
  WeightUnit,
  Gender,
  BodyFatMeasurements,
  LogMacrosParams,
  MacrosGoals,
} from "../types";
