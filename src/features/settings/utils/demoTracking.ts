import { Asset } from "expo-asset";
import {
  bodyFatApi,
  bodyMeasurementsApi,
  bodyTrackingApi,
  hydrationApi,
  injuryApi,
  macrosTrackingApi,
  menstrualApi,
  personalNotesApi,
  progressPhotoApi,
  sorenessApi,
} from "@features/tracking/services/index";
import { supplementsApi } from "@features/supplements/services/index";
import { DEMO_PHOTOS } from "./demoPhotos";
import { isServerless } from "@shared/services/appMode";
import { isFeatureLocal } from "@shared/services/localOnlyFeatures";
import {
  getStorageItem,
  removeStorageItem,
  setStorageItem,
} from "@shared/services/sqliteStorage";
import {
  getUserKey,
  loadFromStorage,
  removeFromStorage,
  saveToStorage,
} from "@shared/services/storage";

const DEMO_RECORDS_KEY = "@demo_records";
const DAY_MS = 86_400_000;
const DAYS = 35;
const DEMO_HEIGHT_CM = 178;

const DEMO_PHOTO_DAYS_AGO = [28, 14, 0];

type Kind =
  | "weight"
  | "bodyFat"
  | "macros"
  | "hydration"
  | "measurement"
  | "soreness"
  | "injury"
  | "note"
  | "menstrual"
  | "photo"
  | "height"
  | "supplement";
type DemoRecord = [Kind, number | string];

const DELETE: Record<Kind, (id: never) => Promise<unknown>> = {
  weight: bodyTrackingApi.deleteWeightEntry,
  bodyFat: bodyFatApi.deleteBodyFatEntry,
  macros: macrosTrackingApi.deleteMacrosEntry,
  hydration: hydrationApi.deleteHydrationEntry,
  measurement: bodyMeasurementsApi.deleteMeasurementEntry,
  soreness: sorenessApi.deleteSorenessEntry,
  injury: injuryApi.deleteInjury,
  note: personalNotesApi.deleteNote,
  menstrual: menstrualApi.deleteMenstrualEntry,
  photo: progressPhotoApi.deletePhoto,
  height: removeStorageItem,
  supplement: supplementsApi.delete,
};

const idOf = (res: unknown): number | string | undefined => {
  const r = res as {
    entry?: { id?: number | string };
    data?: { id?: number | string } | null;
    supplement?: { id?: number };
  } | null;
  return r?.entry?.id ?? r?.data?.id ?? r?.supplement?.id;
};

const isLocal = async (feature: string) =>
  (await isServerless()) || (await isFeatureLocal(feature));

type Add = (kind: Kind, call: Promise<unknown>) => Promise<void>;
type At = (daysAgo: number, hour?: number) => string;

async function fillTracking(add: Add, at: At): Promise<void> {
  for (let d = DAYS; d >= 0; d--) {
    const progress = (DAYS - d) / DAYS;
    if (d % 2 === 0)
      await add("weight", bodyTrackingApi.logWeight(82 - 2.5 * progress, "kg", null, at(d, 7)));
    await add(
      "macros",
      macrosTrackingApi.logMacros({
        name: "Daily intake",
        protein: 150 + (d % 4) * 10,
        carbs: 230 + (d % 5) * 15,
        fat: 65 + (d % 3) * 5,
        calories: 2300 + (d % 5) * 80,
        date: at(d, 13),
      }),
    );
    await add("hydration", hydrationApi.logHydration(500, undefined, at(d, 8)));
    await add("hydration", hydrationApi.logHydration(750 + (d % 3) * 250, undefined, at(d, 15)));
    if (d % 7 === 0) {
      await add(
        "bodyFat",
        bodyFatApi.logBodyFat(18 - 2 * progress, { waist: 86 - 3 * progress, neck: 38, unit: "cm" }, "male", at(d)),
      );
      await add(
        "measurement",
        bodyMeasurementsApi.logMeasurement(86 - 3 * progress, 36 + progress, 36 + progress, 102 + progress, at(d)),
      );
    }
  }
  await add("soreness", sorenessApi.logSoreness({ muscleGroup: "quads", intensity: 6, loggedAt: at(1, 18) }));
  await add("soreness", sorenessApi.logSoreness({ muscleGroup: "chest_upper", intensity: 4, loggedAt: at(2, 18) }));
  await add(
    "injury",
    injuryApi.logInjury({ muscleGroup: "lower_back", injuryType: "strain", painLevel: 3, startDate: at(10), note: "Demo injury" }),
  );
  await add("note", personalNotesApi.createNote({ muscleGroup: "shoulders_front", content: "Warm up with band pull-aparts." }));
  for (const daysAgo of [56, 28, 0])
    await add("menstrual", menstrualApi.logMenstrualCycle(at(daysAgo), ["cramps"]));
  for (const { muscle, angle, images } of DEMO_PHOTOS)
    for (const [i, image] of images.entries()) {
      const asset = await Asset.fromModule(image).downloadAsync();
      await add(
        "photo",
        progressPhotoApi.uploadPhoto({
          uri: asset.localUri ?? asset.uri,
          muscleGroups: [muscle],
          note: "Demo photo",
          angle,
          takenAt: at(DEMO_PHOTO_DAYS_AGO[i], 8),
        }),
      );
    }
}

async function fillSupplements(records: DemoRecord[], at: At): Promise<void> {
  const supplements = [
    { name: "Creatine (demo)", unit: "g", defaultAmount: 5 },
    { name: "Vitamin D (demo)", unit: "IU", defaultAmount: 2000 },
    { name: "Omega-3 (demo)", unit: "caps", defaultAmount: 2 },
  ];
  for (const [i, params] of supplements.entries()) {
    const id = idOf(await supplementsApi.create(params)) as number | undefined;
    if (id === undefined) continue;
    records.push(["supplement", id]);
    for (let d = DAYS; d >= 0; d--)
      if ((d + i) % 5 !== 0)
        await supplementsApi.log(id, { amount: params.defaultAmount, takenAt: at(d, 8 + i) });
  }
}

// Only local features: the server's demo fill seeds the ones it stores.
export async function fillDemoTracking(
  userId: string | null,
  knownHeightCm?: number | null,
  now = Date.now(),
): Promise<number> {
  await clearDemoTracking(userId);
  const records: DemoRecord[] = [];
  const add = async (kind: Kind, call: Promise<unknown>) => {
    const id = idOf(await call);
    if (id !== undefined) records.push([kind, id]);
  };
  const at = (daysAgo: number, hour = 9) =>
    new Date(now - daysAgo * DAY_MS).toISOString().slice(0, 11) +
    `${String(hour).padStart(2, "0")}:00:00.000Z`;

  try {
    // Body fat reads this key before the profile, so it applies to server-stored tracking too.
    const heightKey = getUserKey("height_cm", userId);
    if (!knownHeightCm && !(await getStorageItem(heightKey))) {
      await setStorageItem(heightKey, String(DEMO_HEIGHT_CM));
      records.push(["height", heightKey]);
    }

    if (await isLocal("tracking")) await fillTracking(add, at);
    if (await isLocal("supplements")) await fillSupplements(records, at);
  } finally {
    await saveToStorage(DEMO_RECORDS_KEY, records, userId);
  }
  return records.length;
}

export async function clearDemoTracking(userId: string | null): Promise<number> {
  const records = (await loadFromStorage<DemoRecord[]>(DEMO_RECORDS_KEY, userId)) ?? [];
  const failed: DemoRecord[] = [];
  for (const record of records) {
    try {
      await DELETE[record[0]](record[1] as never);
    } catch (error) {
      console.warn(`Could not delete demo ${record[0]}:`, error);
      failed.push(record);
    }
  }
  if (failed.length) await saveToStorage(DEMO_RECORDS_KEY, failed, userId);
  else await removeFromStorage(DEMO_RECORDS_KEY, userId);
  return records.length - failed.length;
}
