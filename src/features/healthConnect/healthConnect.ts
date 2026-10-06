import { Linking, Platform } from "react-native";
import {
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings,
  requestPermission,
  SdkAvailabilityStatus,
} from "react-native-health-connect";

export const IMPORT_TYPES = ["Weight", "BodyFat", "Hydration", "Nutrition"] as const;
export const LIVE_TYPES = ["Steps", "HeartRate", "SleepSession"] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];
export type HealthType = ImportType | (typeof LIVE_TYPES)[number];
export type Availability = "available" | "needs_install" | "needs_update" | "unsupported";

const PROVIDER = "com.google.android.apps.healthdata";
// A Play Store app on Android 9 to 13, part of the OS from Android 14.
const FIRST_SUPPORTED_SDK = 28;
const FIRST_BUILT_IN_SDK = 34;

let client: Promise<boolean> | null = null;

export async function getAvailability(): Promise<Availability> {
  if (Platform.OS !== "android") return "unsupported";
  const status = await getSdkStatus();
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return "needs_update";
  const sdk = Number(Platform.Version);
  return sdk >= FIRST_SUPPORTED_SDK && sdk < FIRST_BUILT_IN_SDK ? "needs_install" : "unsupported";
}

async function ensureClient(): Promise<boolean> {
  if ((await getAvailability()) !== "available") return false;
  client ??= initialize().catch((error: unknown) => {
    client = null;
    throw error;
  });
  return client;
}

export async function getGrantedTypes(): Promise<HealthType[]> {
  if (!(await ensureClient())) return [];
  const granted = await getGrantedPermissions();
  return granted
    .filter((permission) => permission.accessType === "read")
    .map((permission) => permission.recordType as HealthType);
}

export async function connect(): Promise<HealthType[]> {
  if (!(await ensureClient())) return [];
  await requestPermission(
    [...IMPORT_TYPES, ...LIVE_TYPES].map((recordType) => ({ accessType: "read" as const, recordType })),
  );
  return getGrantedTypes();
}

export const openSettings = (): void => openHealthConnectSettings();

export const openInstallPage = (): Promise<unknown> =>
  Linking.openURL(`market://details?id=${PROVIDER}&url=healthconnect%3A%2F%2Fonboarding`).catch(() =>
    Linking.openURL(`https://play.google.com/store/apps/details?id=${PROVIDER}`),
  );
