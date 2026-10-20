import { createBodyMeasurementsApi } from "@features/tracking/services/off/bodyMeasurements"
import { createBodyStatsApi } from "@features/tracking/services/off/bodyStats"
import { createCustomMeasurementsApi } from "@features/tracking/services/off/customMeasurements"
import { createHydrationApi } from "@features/tracking/services/off/hydration"
import { createInjuryApi } from "@features/tracking/services/off/injury"
import { createMacrosApi } from "@features/tracking/services/off/macros"
import { createMenstrualApi } from "@features/tracking/services/off/menstrual"
import { createPersonalNotesApi } from "@features/tracking/services/off/personalNotes"
import { createProgressPhotoApi } from "@features/tracking/services/off/progressPhoto"
import { createSorenessApi } from "@features/tracking/services/off/soreness"
import type { TrackingApis } from "@features/tracking/TrackingApisContext"
import { trackingViewUser } from "./trackingInbox"

export const READ_ONLY_MESSAGE = "Only your client can change their tracking."

// Every read method is named get* or list*. Anything else would write.
const isRead = (name: string) => /^(get|list)/.test(name)

function readOnly<T extends object>(api: T): T {
  return new Proxy(api, {
    get(target, prop, receiver) {
      const value: unknown = Reflect.get(target, prop, receiver)
      if (typeof prop !== "string" || typeof value !== "function" || isRead(prop)) return value
      return () => Promise.reject(new Error(READ_ONLY_MESSAGE))
    },
  })
}

/** The tracking APIs over a client's unpacked copy. Reads work and every write is refused. */
export function clientTrackingApis(clientId: string): TrackingApis {
  const user = trackingViewUser(clientId)
  const { bodyTrackingApi, bodyFatApi, getCurrentBodyWeight } = createBodyStatsApi(user)
  return {
    bodyTrackingApi: readOnly(bodyTrackingApi),
    bodyFatApi: readOnly(bodyFatApi),
    getCurrentBodyWeight,
    macrosTrackingApi: readOnly(createMacrosApi(user).macrosTrackingApi),
    hydrationApi: readOnly(createHydrationApi(user).hydrationApi),
    sorenessApi: readOnly(createSorenessApi(user).sorenessApi),
    injuryApi: readOnly(createInjuryApi(user).injuryApi),
    progressPhotoApi: readOnly(createProgressPhotoApi(user).progressPhotoApi),
    personalNotesApi: readOnly(createPersonalNotesApi(user).personalNotesApi),
    bodyMeasurementsApi: readOnly(createBodyMeasurementsApi(user).bodyMeasurementsApi),
    menstrualApi: readOnly(createMenstrualApi(user).menstrualApi),
    customMeasurementsApi: readOnly(createCustomMeasurementsApi(user).customMeasurementsApi),
  }
}
