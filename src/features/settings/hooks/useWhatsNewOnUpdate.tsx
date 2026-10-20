import React, { useEffect, useState } from "react";
import Constants from "expo-constants";
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage";
import { reportAndReturn } from "@shared/services/crashReporting";
import ChangelogSheet, { RELEASES } from "../components/ChangelogSheet";
import { releasesToAnnounce, type Release } from "../utils/changelog";

const SEEN_VERSION_KEY = "@whats_new_seen_version";

/** Opens What's New once after an update, with every release since the previous version. */
export function useWhatsNewOnUpdate(): React.JSX.Element {
  const version = Constants.expoConfig?.version;
  const [announce, setAnnounce] = useState<Release[]>([]);

  useEffect(() => {
    if (!version) return;
    let active = true;
    void getStorageItem(SEEN_VERSION_KEY)
      .then(async (seen) => {
        if (seen === version) return;
        await setStorageItem(SEEN_VERSION_KEY, version);
        if (active) setAnnounce(releasesToAnnounce(RELEASES, seen, version));
      })
      .catch(reportAndReturn(undefined, { stage: "whatsNew" }));
    return () => {
      active = false;
    };
  }, [version]);

  return (
    <ChangelogSheet
      visible={announce.length > 0}
      onClose={() => setAnnounce([])}
      currentVersion={version}
      announce={announce}
    />
  );
}
