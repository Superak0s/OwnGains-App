import React, { useCallback, useEffect, useState } from "react";
import { AppState, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { useAlert } from "@shared/components/CustomAlert";
import { captureException, trackFeature } from "@shared/services/crashReporting";
import { loadFromStorage, STORAGE_KEYS } from "@shared/services/storage";
import { formatDateTime } from "@utils/format";
import type { SettingsStyles } from "@features/settings/SettingsScreen";
import {
  connect,
  getAvailability,
  getGrantedTypes,
  openInstallPage,
  openSettings,
  type Availability,
} from "./healthConnect";
import { syncHealthConnect } from "./importer";

const DESCRIPTION: Record<Exclude<Availability, "unsupported">, string> = {
  available:
    "Import weight, body fat, hydration and nutrition, and show steps, heart rate and sleep on Home. OwnGains only reads this data.",
  needs_install: "Install Health Connect to import your health data into OwnGains.",
  needs_update: "Update Health Connect to connect it to OwnGains.",
};

interface Props {
  readonly styles: SettingsStyles;
  readonly userId: string | null;
  readonly alert: ReturnType<typeof useAlert>["alert"];
}

const syncMessage = (imported: number, failed: boolean): string => {
  const noun = imported === 1 ? "entry" : "entries";
  const result =
    imported > 0 ? `Imported ${imported} new ${noun}.` : "Everything is up to date.";
  return failed
    ? `${result} Some data couldn't be imported. It will be retried on the next sync.`
    : result;
};

export default function HealthConnectSection({
  styles,
  userId,
  alert,
}: Props): React.JSX.Element | null {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setAvailability(await getAvailability());
      setConnected((await getGrantedTypes()).length > 0);
      setLastSync(
        userId ? await loadFromStorage<number>(STORAGE_KEYS.HEALTH_CONNECT_LAST_SYNC, userId) : null,
      );
    } catch (error) {
      captureException(error, { feature: "healthConnect" });
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // Install, update and permission changes happen in other apps, so the
  // screen keeps focus and only AppState sees the user come back.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const sync = async (): Promise<void> => {
    if (!userId) return;
    setBusy(true);
    try {
      const summary = await syncHealthConnect(userId, true);
      const failed = Boolean(summary?.failed.length);
      const message = syncMessage(summary?.imported ?? 0, failed);
      alert("Health Connect", message, undefined, failed ? "warning" : "success");
    } catch (error) {
      captureException(error, { feature: "healthConnect" });
      alert("Health Connect", "Couldn't read from Health Connect. Try again later.", undefined, "error");
    } finally {
      setBusy(false);
      void refresh();
    }
  };

  const handleConnect = async (): Promise<void> => {
    try {
      const granted = await connect();
      trackFeature("healthConnect", "connect", { granted: granted.length });
      if (granted.length > 0) await sync();
    } catch (error) {
      captureException(error, { feature: "healthConnect" });
    }
    void refresh();
  };

  if (!availability || availability === "unsupported") return null;

  const button = (label: string, accessibilityLabel: string, onPress: () => unknown) => (
    <TouchableOpacity
      style={[styles.syncButton, busy && styles.disabledButton]}
      onPress={() => {
        onPress();
      }}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: busy }}
    >
      <Text style={styles.syncButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  let lastSyncText = "Never";
  if (busy) lastSyncText = "Syncing…";
  else if (lastSync) lastSyncText = formatDateTime(lastSync);

  const installButton =
    availability === "needs_update"
      ? button("Update Health Connect", "Update Health Connect in the Play Store", openInstallPage)
      : button("Install Health Connect", "Install Health Connect from the Play Store", openInstallPage);

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header" accessibilityLabel="Health Connect">
        ❤️ Health Connect
      </Text>
      <View style={styles.card}>
        {availability === "available" && connected ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Last Sync</Text>
              <Text style={styles.infoValue}>
                {lastSyncText}
              </Text>
            </View>
            <View style={styles.divider} />
            {button("Sync Now", "Import new data from Health Connect now", sync)}
            <View style={styles.divider} />
            {button("Manage Permissions", "Open Health Connect permissions", openSettings)}
          </>
        ) : (
          <>
            <Text style={styles.settingDescription}>{DESCRIPTION[availability]}</Text>
            <View style={styles.divider} />
            {availability === "available"
              ? button("Connect", "Connect Health Connect", handleConnect)
              : installButton}
          </>
        )}
      </View>
    </View>
  );
}
