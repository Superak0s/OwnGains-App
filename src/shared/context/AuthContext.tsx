import {
  createContext,
  useState,
  useContext,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { authService } from "@features/auth/services/index";
import { authService as onlineAuthService } from "@features/auth/services/on/auth";
import { ApiError, isCredentialRejection } from "../services/apiClient";
import {
  setSessionRefresher,
  type SessionRefreshResult,
} from "../services/authenticatedFetch";
import { onServerUrlChange } from "../services/config";
import { getAppMode, isServerless, onAppModeChange } from "../services/appMode";
import { Alert, AppState } from "react-native";
import { refreshTokenStorage, tokenStorage } from "../services/tokenStorage";
import { accessTokenExpiresAt, accessTokenLifetimeMs } from "../services/jwt";
import { hasAcceptedCurrentTerms } from "@features/auth/termsAcceptance";
import {
  GoogleLinkNeedsPasswordError,
  GoogleSignInCancelledError,
  type GoogleLink,
} from "@features/auth/googleSignIn";
import { applyPrivacyChoicesFor, setUserContext, metric, log, captureException, reportAndReturn } from "../services/crashReporting";
import { setRecordStoreUser } from "../services/offlineHelpers";
import type { ProfileUpdate } from "@features/auth/types";
import type { User } from "../types";
import { cancelAllSupplementReminders } from "@shared/services/supplementReminders";
import { userFacingError } from "@shared/services/apiError";

export type { User };

interface AuthResult {
  success: boolean;
  error?: string;
  code?: string;
}

interface GoogleAuthResult extends AuthResult {
  /** Set when the Google email belongs to an existing account: retry with its password. */
  linkRequired?: { idToken: string; username: string };
}

interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  signup: (
    username: string,
    email: string,
    password: string,
    name: string,
  ) => Promise<AuthResult>;
  signin: (username: string, password: string) => Promise<AuthResult>;
  /** Resolves `{ success: false }` with no error when the user closes the Google sheet. */
  signInWithGoogle: (link?: GoogleLink) => Promise<GoogleAuthResult>;
  unlinkGoogle: (password: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  updateProfile: (profile: ProfileUpdate) => Promise<AuthResult>;
  refreshUser: () => Promise<AuthResult>;
  refreshToken: () => Promise<boolean>;
  /** The signed-in account has answered the current consent screen. Nothing syncs before. */
  consented: boolean;
  markConsented: () => void;
  /** Shows the consent screen again if the server now stores more health data than was consented to. */
  recheckConsent: () => void;
}

type RefreshResult = SessionRefreshResult;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
// Kept apart from AuthContext because the token rotates on every refresh, and
// only the few consumers that send the raw JWT should re-render when it does.
const AuthTokenContext = createContext("");

/** Raw JWT string, always up-to-date. */
export const useAuthToken = (): string => useContext(AuthTokenContext);

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

const readStoredToken = async (): Promise<string> => {
  try {
    return (await tokenStorage.get()) ?? "";
  } catch (error) {
    captureException(error, { stage: "readStoredToken" });
    return "";
  }
};

// Used only when the access token has no readable `exp`. It is under the
// server's default 15-minute token lifetime.
const FALLBACK_REFRESH_INTERVAL_MS = 12 * 60 * 1000;
const REFRESH_LEAD_MS = 60 * 1000;
const MIN_REFRESH_DELAY_MS = 5 * 1000;

interface ReceivedToken {
  token: string;
  receivedAt: number;
}

// A token the server just issued is timed from its own lifetime, not from `exp`
// against the device clock: a phone running minutes fast would otherwise treat
// every fresh token as nearly expired and refresh every few seconds.
const refreshDelayFor = (token: string, received: ReceivedToken | null): number => {
  const lifetime = accessTokenLifetimeMs(token);
  if (received?.token === token && lifetime != null) {
    const elapsed = Date.now() - received.receivedAt;
    return Math.max(lifetime - REFRESH_LEAD_MS - elapsed, MIN_REFRESH_DELAY_MS);
  }
  const expiresAt = accessTokenExpiresAt(token);
  if (expiresAt == null) return FALLBACK_REFRESH_INTERVAL_MS;
  return Math.max(expiresAt - REFRESH_LEAD_MS - Date.now(), MIN_REFRESH_DELAY_MS);
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState("");

  // Namespaces must flip before any descendant effect sees the new user. A
  // parent effect runs after them, so a second account on the same device
  // could read the first one's offline records.
  const seatUser = useCallback((next: User | null): void => {
    const id = next?.id == null ? null : String(next.id);
    setUserContext(id);
    setRecordStoreUser(id);
    // A fresh but identical object would re-render the whole tree.
    setUser((prev) =>
      JSON.stringify(prev) === JSON.stringify(next) ? prev : next,
    );
  }, []);

  // Bumped on every session boundary so a refresh that resolves after the user
  // has logged out cannot restore a token onto a session that no longer exists.
  const sessionGenerationRef = useRef(0);
  const receivedTokenRef = useRef<ReceivedToken | null>(null);
  const noteReceivedToken = (token: string): void => {
    receivedTokenRef.current = { token, receivedAt: Date.now() };
  };

  const clearSession = useCallback((): void => {
    sessionGenerationRef.current += 1;
    setAuthToken("");
    seatUser(null);
    setIsAuthenticated(false);
  }, [seatUser]);

  const startSession = useCallback(
    (sessionUser: User, token: string): void => {
      sessionGenerationRef.current += 1;
      setAuthToken(token);
      seatUser(sessionUser);
      setIsAuthenticated(true);
    },
    [seatUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    if (user?.id) await cancelAllSupplementReminders(String(user.id));
    try {
      await authService.logout();
      metric.count("auth.logout", 1, { attributes: { outcome: "ok" } });
    } catch (error) {
      console.error("Error logging out:", error);
      metric.count("auth.logout", 1, { attributes: { outcome: "error" } });
      captureException(error, { stage: "logout" });
    } finally {
      clearSession();
    }
  }, [clearSession, user?.id]);

  /**
   * Offline mode has no server to authenticate against, so the login screen is
   * skipped entirely. Safe to call repeatedly: the offline auth service just
   * loads (or creates) the one local profile.
   */
  const autoConnectOffline = useCallback(async (): Promise<void> => {
    try {
      const stored = await authService
        .getStoredUser()
        .catch(reportAndReturn(null, { stage: "getStoredUser" }));
      const data = (await authService.signin(stored?.username ?? "Me", "")) as {
        success: boolean;
        user?: User;
        token?: string;
      };
      if (data.success && data.user) {
        startSession(data.user, data.token ?? (await readStoredToken()));
      }
    } catch (error) {
      console.error("Offline auto-connect failed:", error);
      log.error("auth.offline_autoconnect_failed", {
        reason: (error as Error).message,
      });
      captureException(error, { stage: "autoConnectOffline" });
    }
  }, [startSession]);

  /**
   * Restores the session from the last successful server response so a cold
   * start with no connectivity doesn't look like a logged-out user.
   */
  const restoreCachedSession = useCallback(async (): Promise<boolean> => {
    const storedUser = await authService.getStoredUser();
    const token = await readStoredToken();
    if (!storedUser || !(token || (await refreshTokenStorage.get()))) return false;
    startSession(storedUser, token);
    console.info("📴 Server unreachable, restored cached session");
    metric.count("auth.session_restored_from_cache");
    return true;
  }, [startSession]);

  const attemptRefresh = useCallback(async (): Promise<RefreshResult> => {
    const generation = sessionGenerationRef.current;
    try {
      const newToken = await authService.refreshToken();
      if (generation !== sessionGenerationRef.current) {
        console.info("Token refresh resolved after the session ended, discarding it");
        return "unreachable";
      }
      if (newToken) {
        noteReceivedToken(newToken);
        setAuthToken(newToken);
        console.info("✅ Token refreshed silently");
        metric.count("auth.token_refresh", 1, {
          attributes: { outcome: "refreshed" },
        });
        return "refreshed";
      }
      console.warn("⚠️ Token refresh returned empty");
      metric.count("auth.token_refresh", 1, { attributes: { outcome: "empty" } });
      return "rejected";
    } catch (error) {
      if (!isCredentialRejection(error)) {
        console.warn("⚠️ Token refresh unreachable, keeping session", error);
        metric.count("auth.token_refresh", 1, {
          attributes: { outcome: "unreachable" },
        });
        return "unreachable";
      }
      console.warn("⚠️ Token refresh failed:", error);
      metric.count("auth.token_refresh", 1, {
        attributes: { outcome: "rejected" },
      });
      log.warn("auth.token_refresh_failed", {
        reason: (error as Error).message,
      });
      return "rejected";
    }
  }, []);

  /**
   * Logs out only when the server actually rejects the refresh. An
   * unreachable server leaves the session intact.
   */
  const refreshInFlightRef = useRef<Promise<RefreshResult> | null>(null);
  const refreshSession = useCallback((): Promise<RefreshResult> => {
    refreshInFlightRef.current ??= (async () => {
      try {
        const result = await attemptRefresh();
        if (result === "rejected") await logout();
        return result;
      } finally {
        refreshInFlightRef.current = null;
      }
    })();
    return refreshInFlightRef.current;
  }, [attemptRefresh, logout]);

  const refreshToken = useCallback(
    async (): Promise<boolean> => (await refreshSession()) === "refreshed",
    [refreshSession],
  );

  useEffect(() => {
    setSessionRefresher(refreshSession);
    return () => setSessionRefresher(null);
  }, [refreshSession]);

  // Read from a ref rather than state so the server-url listener sees the
  // current mode without resubscribing on every change.
  const isOfflineRef = useRef(false);
  useEffect(() => {
    void isServerless().then((offline) => {
      isOfflineRef.current = offline;
    });
    return onAppModeChange.subscribe((mode) => {
      isOfflineRef.current = mode === "offline";
    });
  }, []);

  // Re-armed on every new token, so a successful refresh schedules the next
  // one, and a failed or unreachable refresh retries on the fallback interval.
  useEffect(() => {
    if (!isAuthenticated) return;
    let dueAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const arm = (delay: number): void => {
      clearTimeout(timer);
      dueAt = Date.now() + delay;
      timer = setTimeout(refreshOrRetry, delay);
    };
    const refreshOrRetry = async (): Promise<void> => {
      if (!(await refreshToken())) arm(FALLBACK_REFRESH_INTERVAL_MS);
    };
    arm(refreshDelayFor(authToken, receivedTokenRef.current));
    // Timers don't advance while the app is suspended.
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() >= dueAt) arm(0);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [isAuthenticated, authToken, refreshToken]);

  useEffect(() => {
    void checkAuthStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- check the stored session once on mount
  }, []);

  useEffect(() => {
    const unsubscribe = onAppModeChange.subscribe((mode) => {
      if (mode === "offline") {
        void (async () => {
          // Offline mode is documented as zero-backend. A live server
          // credential must not sit in SecureStore for the whole of it. The
          // proxy already routes offline, so revoke through the online service.
          await onlineAuthService
            .logout()
            .catch(reportAndReturn(undefined, { stage: "revokeOnSwitch" }));
          await refreshTokenStorage.clear();
          await autoConnectOffline();
        })();
      } else void logout();
    });
    return unsubscribe;
  }, [autoConnectOffline, logout]);

  useEffect(() => {
    const unsubscribe = onServerUrlChange(() => {
      // Offline sessions are not tied to a server, and there is no login
      // screen to get back from, so logging out there would leave the user stuck.
      if (isAuthenticated && !isOfflineRef.current) {
        console.info("🔄 Server URL changed, logging out user");
        void logout();
        Alert.alert(
          "Server Changed",
          "The server URL has been changed, so you have been logged out.",
          [{ text: "OK" }],
        );
      }
    });
    return unsubscribe;
  }, [isAuthenticated, logout]);

  const reloadUserAfterRefresh = useCallback(async (): Promise<void> => {
    try {
      const currentUser = await authService.getCurrentUser();
      seatUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      if (!isCredentialRejection(error))
        captureException(error, { stage: "reloadUserAfterRefresh" }, "warning");
      if (!isCredentialRejection(error) && (await restoreCachedSession())) return;
      await logout();
    }
  }, [restoreCachedSession, logout, seatUser]);

  const recoverSession = useCallback(async (): Promise<void> => {
    console.warn("⚠️ Stored token is expired or invalid, attempting refresh");
    const result = await attemptRefresh();
    if (result === "unreachable") {
      if (await restoreCachedSession()) return;
      clearSession();
    } else if (result === "rejected") {
      await authService.logout();
      clearSession();
    } else {
      await reloadUserAfterRefresh();
    }
  }, [
    attemptRefresh,
    restoreCachedSession,
    clearSession,
    reloadUserAfterRefresh,
  ]);

  const restoreSession = useCallback(async (): Promise<void> => {
    try {
      const currentUser = await authService.getCurrentUser();
      startSession(currentUser, await readStoredToken());
      console.info("✅ Valid session restored for:", currentUser.username);
    } catch (error) {
      if (!isCredentialRejection(error))
        captureException(error, { stage: "restoreSession" }, "warning");
      if (!isCredentialRejection(error) && (await restoreCachedSession())) return;
      await recoverSession();
    }
  }, [restoreCachedSession, recoverSession, startSession]);

  // Runs after the cached session is already on screen, so a slow server can't
  // hold the splash screen. Only a rejected credential ends the session.
  const revalidateSession = useCallback(async (): Promise<void> => {
    const generation = sessionGenerationRef.current;
    try {
      const currentUser = await authService.getCurrentUser();
      if (generation === sessionGenerationRef.current) seatUser(currentUser);
    } catch (error) {
      if (!isCredentialRejection(error)) {
        captureException(error, { stage: "revalidateSession" }, "warning");
        return;
      }
      if (generation === sessionGenerationRef.current) await recoverSession();
    }
  }, [recoverSession, seatUser]);

  const checkAuthStatus = useCallback(async (): Promise<void> => {
    try {
      // The persisted app mode must be loaded before deciding whether this is
      // a serverless session, which never shows a login screen.
      await getAppMode();
      const [isAuth, maybeUser, maybeToken] = await Promise.all([
        authService.isAuthenticated(),
        authService
          .getStoredUser()
          .catch(reportAndReturn(null, { stage: "getStoredUser" })),
        readStoredToken(),
      ]);
      const storedUser = isAuth ? maybeUser : null;
      const storedToken = storedUser ? maybeToken : "";
      if (storedUser && storedToken) {
        startSession(storedUser, storedToken);
        void revalidateSession();
      } else if (isAuth) await restoreSession();
      else if (await isServerless()) await autoConnectOffline();
      else clearSession();
    } catch (error) {
      console.error("Error checking auth status:", error);
      captureException(error, { stage: "checkAuthStatus" });
      clearSession();
    } finally {
      setIsLoading(false);
    }
  }, [
    startSession,
    revalidateSession,
    restoreSession,
    autoConnectOffline,
    clearSession,
  ]);

  const signup = useCallback(
    async (
      username: string,
      email: string,
      password: string,
      name: string,
    ): Promise<AuthResult> => {
      try {
        const data = (await authService.signup(
          username,
          email,
          password,
          name,
        )) as { success: boolean; user?: User; token?: string; error?: string };
        if (data.success && data.user && data.token) {
          noteReceivedToken(data.token);
          startSession(data.user, data.token);
          metric.count("auth.signup", 1, { attributes: { outcome: "ok" } });
          return { success: true };
        }
        if (data.success && !data.token) {
          // Restoring the session from the token already in SecureStore would bind
          // it to whichever account signed in last.
          metric.count("auth.signup", 1, { attributes: { outcome: "no_token" } });
          captureException(new Error("Signup succeeded without a token"), { stage: "signup" });
          return { success: false, error: "The server did not return a sign-in token." };
        }
        metric.count("auth.signup", 1, { attributes: { outcome: "rejected" } });
        return { success: false, error: data.error ?? "Signup failed" };
      } catch (error) {
        console.error("Signup error:", error);
        metric.count("auth.signup", 1, { attributes: { outcome: "error" } });
        captureException(error, { stage: "signup" });
        return {
          success: false,
          error: userFacingError(error, "Network error"),
          code: error instanceof ApiError ? error.code : undefined,
        };
      }
    },
    [startSession],
  );

  const signin = useCallback(
    async (username: string, password: string): Promise<AuthResult> => {
      try {
        const data = (await authService.signin(username, password)) as {
          success: boolean;
          user?: User;
          token?: string;
          error?: string;
          message?: string;
        };
        if (data.success && data.user && data.token) {
          noteReceivedToken(data.token);
          startSession(data.user, data.token);
          metric.count("auth.signin", 1, { attributes: { outcome: "ok" } });
          return { success: true };
        }
        if (data.success && !data.token) {
          metric.count("auth.signin", 1, { attributes: { outcome: "no_token" } });
          captureException(new Error("Signin succeeded without a token"), { stage: "signin" });
          return { success: false, error: "The server did not return a sign-in token." };
        }
        metric.count("auth.signin", 1, { attributes: { outcome: "rejected" } });
        return {
          success: false,
          error: data.error ?? data.message ?? "Invalid username or password",
        };
      } catch (error) {
        metric.count("auth.signin", 1, { attributes: { outcome: "error" } });
        log.warn("auth.signin_failed", { reason: (error as Error).message });
        return {
          success: false,
          error: userFacingError(error, "Network error"),
          code: error instanceof ApiError ? error.code : undefined,
        };
      }
    },
    [startSession],
  );

  const signInWithGoogle = useCallback(async (link?: GoogleLink): Promise<GoogleAuthResult> => {
    try {
      const data = (await authService.signInWithGoogle(link)) as {
        success: boolean;
        user?: User;
        token?: string;
        error?: string;
      };
      if (data.success && data.user && data.token) {
        noteReceivedToken(data.token);
        startSession(data.user, data.token);
        metric.count("auth.google", 1, { attributes: { outcome: "ok" } });
        return { success: true };
      }
      metric.count("auth.google", 1, { attributes: { outcome: "rejected" } });
      return { success: false, error: data.error ?? "Google sign-in failed" };
    } catch (error) {
      if (error instanceof GoogleSignInCancelledError) return { success: false };
      if (error instanceof GoogleLinkNeedsPasswordError)
        return {
          success: false,
          linkRequired: { idToken: error.idToken, username: error.username },
        };
      metric.count("auth.google", 1, { attributes: { outcome: "error" } });
      log.warn("auth.google_failed", { reason: (error as Error).message });
      return {
        success: false,
        error: userFacingError(error, "Google sign-in failed"),
        code: error instanceof ApiError ? error.code : undefined,
      };
    }
  }, [startSession]);

  const updateProfile = useCallback(
    async (profile: ProfileUpdate): Promise<AuthResult> => {
      try {
        seatUser(await authService.updateProfile(profile));
        return { success: true };
      } catch (error) {
        console.error("Update profile error:", error);
        return {
          success: false,
          error: userFacingError(error, "Update failed"),
        };
      }
    },
    [seatUser],
  );

  const unlinkGoogle = useCallback(
    async (password: string): Promise<AuthResult> => {
      try {
        seatUser(await authService.unlinkGoogle(password));
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: userFacingError(error, "Couldn't unlink Google"),
        };
      }
    },
    [seatUser],
  );

  const refreshUser = useCallback(async (): Promise<AuthResult> => {
    try {
      seatUser(await authService.getCurrentUser());
      return { success: true };
    } catch (error) {
      console.error("Refresh user error:", error);
      return {
        success: false,
        error: userFacingError(error, "Refresh failed"),
      };
    }
  }, [seatUser]);

  const userId = user?.id == null ? null : String(user.id);
  const consentNeededFor = (id: string | null) => ({
    userId: id,
    needed:
      id !== null &&
      (!applyPrivacyChoicesFor(id) ||
        !hasAcceptedCurrentTerms(id, user?.termsVersion, user?.healthConsentAt)),
  });
  // Decided during render rather than in an effect, so nothing that waits on
  // it (the signed-in tabs, workout sync) runs before consent is answered.
  const [consent, setConsent] = useState(() => consentNeededFor(userId));
  if (consent.userId !== userId) setConsent(consentNeededFor(userId));
  const consented = consent.userId === userId && !consent.needed;
  const markConsented = useCallback(
    () => setConsent({ userId, needed: false }),
    [userId],
  );
  const termsVersion = user?.termsVersion;
  const healthConsentAt = user?.healthConsentAt;
  const recheckConsent = useCallback(() => {
    if (userId && !hasAcceptedCurrentTerms(userId, termsVersion, healthConsentAt))
      setConsent({ userId, needed: true });
  }, [userId, termsVersion, healthConsentAt]);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      isAuthenticated,
      isLoading,
      signup,
      signin,
      signInWithGoogle,
      unlinkGoogle,
      logout,
      updateProfile,
      refreshUser,
      refreshToken,
      consented,
      markConsented,
      recheckConsent,
    }),
    [
      consented,
      markConsented,
      recheckConsent,
      user,
      isAuthenticated,
      isLoading,
      signup,
      signin,
      signInWithGoogle,
      unlinkGoogle,
      logout,
      updateProfile,
      refreshUser,
      refreshToken,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      <AuthTokenContext.Provider value={authToken}>
        {children}
      </AuthTokenContext.Provider>
    </AuthContext.Provider>
  );
};
