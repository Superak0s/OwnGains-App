import { getStorageItemSync, setStorageItem } from "@shared/services/sqliteStorage";
import { getAppModeSync } from "@shared/services/appMode";
import { getServerStoredFeatures } from "@shared/services/localOnlyFeatures";

// Shown as the Terms' "last updated" date. Changing it asks every account to accept again.
export const TERMS_VERSION = "October 2026";

type TermsAcceptance = {
  version: string;
  acceptedAt: string;
  healthConsent: boolean;
  /** The health features the server stored when consent was given. */
  serverFeatures?: string[];
};

const key = (userId: string): string => `@terms_acceptance_user_${userId}`;

const read = (userId: string): TermsAcceptance | null => {
  try {
    return JSON.parse(getStorageItemSync(key(userId)) ?? "null") as TermsAcceptance | null;
  } catch {
    return null;
  }
};

// Workouts stored on a server can reveal health information, so online mode
// also needs explicit consent (GDPR Art. 9(2)(a)), but on-device use does not.
export const needsHealthConsent = (): boolean => getAppModeSync() === "online";

// `serverTermsVersion`/`serverHealthConsentAt` are the signed-in user's
// server record. A server without the acceptance or the health consent refuses
// workout writes (403), so in online mode the on-device record alone isn't
// enough: the screen shows again and re-sends both. `undefined` means a server
// that doesn't report them.
export const hasAcceptedCurrentTerms = (
  userId: string,
  serverTermsVersion?: string | null,
  serverHealthConsentAt?: string | null,
): boolean => {
  const record = read(userId);
  if (record?.version !== TERMS_VERSION) return false;
  if (!needsHealthConsent()) return true;
  // Consent covers what the server stored when it was given. A server that
  // starts storing body tracking or supplements has to ask again.
  const covered = record.serverFeatures ?? [];
  return (
    record.healthConsent &&
    !(getServerStoredFeatures() ?? []).some((f) => !covered.includes(f)) &&
    (serverTermsVersion === undefined || serverTermsVersion === TERMS_VERSION) &&
    serverHealthConsentAt !== null
  );
};

export const hasAcceptedEarlierTerms = (userId: string): boolean =>
  read(userId) !== null;

export const recordTermsAcceptance = (
  userId: string,
  healthConsent: boolean,
): Promise<void> =>
  setStorageItem(
    key(userId),
    JSON.stringify({
      version: TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
      healthConsent,
      serverFeatures: getServerStoredFeatures() ?? [],
    } satisfies TermsAcceptance),
  );
