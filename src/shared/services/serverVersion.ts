import { useEffect, useState } from "react";
import { apiCall } from "./apiClient";
import { isServerless } from "./appMode";
import { getServerUrl } from "./config";

/**
 * Oldest OwnGains-Server this build can talk to. Bump it whenever the app
 * starts calling an endpoint an older server does not answer. Self-hosted
 * instances upgrade on their operator's schedule, not with the app, so an
 * app newer than its server is the normal case, not an edge case.
 */
export const MIN_SERVER_VERSION = "0.5.0";

const parse = (version: string): number[] =>
  version.split(".").map((part) => Number.parseInt(part, 10) || 0);

/** Negative when a < b, zero when equal, positive when a > b. */
export const compareVersions = (a: string, b: string): number => {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

export interface ServerVersionCheck {
  version: string;
  outdated: boolean;
}

/**
 * Returns null when the server can't be reached or doesn't answer. An
 * unreachable server is a connectivity problem, and
 * shouldn't produce a scary "please upgrade" warning. Also null in offline
 * mode, which must never touch the network.
 */
export const checkServerVersion =
  async (): Promise<ServerVersionCheck | null> => {
    if (await isServerless()) return null;
    try {
      const data = await apiCall<{ version?: string }>("/api/version");
      if (!data.version) return null;
      return {
        version: data.version,
        outdated: compareVersions(data.version, MIN_SERVER_VERSION) < 0,
      };
    } catch {
      return null;
    }
  };

let cachedCheck: {
  serverUrl: string;
  result: Promise<ServerVersionCheck | null>;
} | null = null;

/**
 * One version check per server per app run. An unanswered check isn't kept,
 * so the next session start asks again.
 */
export const getServerVersionStatus =
  (): Promise<ServerVersionCheck | null> => {
    const serverUrl = getServerUrl();
    if (cachedCheck?.serverUrl !== serverUrl) {
      const entry = { serverUrl, result: checkServerVersion() };
      cachedCheck = entry;
      void entry.result.then((result) => {
        if (result === null && cachedCheck === entry) cachedCheck = null;
      });
    }
    return cachedCheck.result;
  };

/** The outdated-server check for the signed-in session, or null when the server is current or unknown. */
export function useOutdatedServer(
  sessionKey: string | number | null | undefined,
): ServerVersionCheck | null {
  const [outdated, setOutdated] = useState<ServerVersionCheck | null>(null);
  useEffect(() => {
    setOutdated(null);
    if (sessionKey == null) return;
    let live = true;
    void getServerVersionStatus().then((result) => {
      if (live && result?.outdated) setOutdated(result);
    });
    return () => {
      live = false;
    };
  }, [sessionKey]);
  return outdated;
}
