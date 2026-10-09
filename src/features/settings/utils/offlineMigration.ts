import { setStorageItem } from "@shared/services/sqliteStorage";
import {
  saveToStorage,
  loadFromStorage,
  getUserKey,
  STORAGE_KEYS,
} from "@shared/services/storage";
import { setAppMode } from "@shared/services/appMode";
import { workoutApi } from "@features/workout/services/index";
import { authService } from "@features/auth/services/index";
import { TERMS_VERSION } from "@features/auth/termsAcceptance";
import type { User, WorkoutSession } from "@shared/types";

export const migrateUserData = async (
  userId: string,
  selectedSplit: string | null,
): Promise<void> => {
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      // Raw round-trip: plain strings are stored unquoted, so a parsing read
      // throws and loadFromStorage hands back null, dropping the key.
      const value = await loadFromStorage<string>(key, userId, false);
      if (value != null) {
        await saveToStorage(key, value, "local");
      }
    } catch (err) {
      console.warn(`Failed copying key ${key}:`, err);
    }
  }
  // Every split, not just the current one: withdrawing health consent makes
  // the server delete all of them. A failure throws so the caller stops
  // before that delete.
  const sessions: WorkoutSession[] = [];
  let before: string | null = null;
  do {
    const page = await workoutApi.getSessionHistoryPage(
      null,
      before,
      1000,
      true,
    );
    sessions.push(...page.sessions);
    before = page.sessions.length > 0 ? page.nextCursor : null;
  } while (before);
  const mapSession = (s: WorkoutSession) => ({
    id: s.id,
    split: s.split ?? selectedSplit,
    dayNumber: s.dayNumber ?? 0,
    dayTitle: s.dayTitle,
    startTime: s.startTime,
    endTime: s.endTime,
    setTimings: s.setTimings ?? [],
    isDemo: false,
  });
  await setStorageItem(
    "@offline:workout:sessions",
    JSON.stringify(sessions.map(mapSession)),
  );
};

export interface OfflineMigrationInput {
  user: User | null | undefined;
  selectedSplit: string | null;
  profileAvatarUri: string | null;
  withdrawHealthConsent?: boolean;
}

export const doMigrateOffline = async ({
  user,
  selectedSplit,
  profileAvatarUri,
  withdrawHealthConsent = false,
}: OfflineMigrationInput): Promise<boolean> => {
  try {
    const currentUserId = user?.id ?? null;
    if (currentUserId) {
      await migrateUserData(currentUserId, selectedSplit);
    }
    // Before the mode switch, which drops the online session. The server
    // erases the workouts and body data the consent covered (Art. 7(3), 17).
    if (withdrawHealthConsent)
      await authService.recordConsent(TERMS_VERSION, false, true);
    // Written before the mode switch, not after: setAppMode fires
    // AuthContext's un-awaited autoConnectOffline, and a profile update
    // racing that would be overwritten by the session it creates.
    await setStorageItem(
      "@offline_user",
      JSON.stringify({
        id: "local",
        username: user?.username ?? "Me",
        ...(user?.name && { name: user.name }),
        email: user?.email ?? "",
        ...(typeof user?.heightCm === "number" && {
          heightCm: user.heightCm,
        }),
        ...(typeof user?.bfFormulaSex === "string" && {
          bfFormulaSex: user.bfFormulaSex,
        }),
      }),
    );
    if (profileAvatarUri)
      await setStorageItem(
        getUserKey("@profile_avatar", "local"),
        profileAvatarUri,
      );
    await setAppMode("offline");
    return true;
  } catch (error) {
    console.error("Migration to offline failed:", error);
    return false;
  }
};
