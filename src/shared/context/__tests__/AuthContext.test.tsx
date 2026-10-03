import { create, act } from "react-test-renderer";
import { AuthProvider, useAuth, useAuthToken } from "../AuthContext";

jest.mock("@features/auth/services/index", () => ({
  authService: {
    isAuthenticated: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn().mockResolvedValue({ id: 1, username: "tester" }),
    getStoredUser: jest.fn().mockResolvedValue({ id: 1, username: "tester" }),
    refreshToken: jest.fn(),
    logout: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@shared/services/config", () => ({
  onServerUrlChange: jest.fn(() => () => {}),
}));

jest.mock("@shared/services/appMode", () => ({
  getAppMode: jest.fn().mockResolvedValue("online"),
  isServerless: jest.fn().mockResolvedValue(false),
  onAppModeChange: { subscribe: jest.fn(() => () => {}) },
}));

jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { get: jest.fn() },
  refreshTokenStorage: { get: jest.fn().mockResolvedValue(null) },
}));

import { authService } from "@features/auth/services/index";
import { tokenStorage } from "@shared/services/tokenStorage";
import { ApiError } from "@shared/services/apiError";

const refreshTokenMock = authService.refreshToken as jest.Mock;
const tokenGetMock = tokenStorage.get as jest.Mock;

const MINUTE = 60 * 1000;
const FALLBACK_REFRESH_INTERVAL_MS = 12 * MINUTE;

const jwtExpiringIn = (ms: number): string =>
  `h.${Buffer.from(
    JSON.stringify({ exp: Math.floor((Date.now() + ms) / 1000) }),
  ).toString("base64url")}.s`;

const jwtIssuedAt = (issuedAt: number, lifetimeMs: number): string =>
  `h.${Buffer.from(
    JSON.stringify({
      iat: Math.floor(issuedAt / 1000),
      exp: Math.floor((issuedAt + lifetimeMs) / 1000),
    }),
  ).toString("base64url")}.s`;

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const seen: {
  current?: { isLoading: boolean; isAuthenticated: boolean; token: string };
} = {};
const Probe = () => {
  const { isLoading, isAuthenticated } = useAuth();
  seen.current = { isLoading, isAuthenticated, token: useAuthToken() };
  return null;
};

const mount = async (): Promise<ReturnType<typeof create>> => {
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await flush();
  });
  return root!;
};

const advance = async (ms: number): Promise<void> => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await flush();
  });
};

describe("AuthProvider proactive refresh timer", () => {
  beforeEach(() => {
    refreshTokenMock.mockReset();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("refreshes a minute before the access token's exp and re-arms from the new token", async () => {
    tokenGetMock.mockResolvedValue(jwtExpiringIn(15 * MINUTE));
    refreshTokenMock.mockImplementation(async () => jwtExpiringIn(15 * MINUTE));
    const root = await mount();

    await advance(14 * MINUTE - 1000);
    expect(refreshTokenMock).not.toHaveBeenCalled();

    await advance(1000);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);

    await advance(14 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
    await advance(60 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(2);
  });

  it("times a freshly issued token from its own lifetime when the device clock runs ahead", async () => {
    tokenGetMock.mockResolvedValue(jwtExpiringIn(15 * MINUTE));
    const serverClockBehindBy = 10 * MINUTE;
    refreshTokenMock.mockImplementation(async () =>
      jwtIssuedAt(Date.now() - serverClockBehindBy, 15 * MINUTE),
    );
    const root = await mount();

    await advance(14 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);

    await advance(5 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);

    await advance(9 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });

  it("falls back to a fixed interval under the server's 15-minute lifetime for an opaque token", async () => {
    tokenGetMock.mockResolvedValue("stored-token");
    refreshTokenMock.mockResolvedValue("new-token");
    const root = await mount();

    await advance(FALLBACK_REFRESH_INTERVAL_MS);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("retries on the fallback interval when the server is unreachable", async () => {
    tokenGetMock.mockResolvedValue(jwtExpiringIn(2 * MINUTE));
    refreshTokenMock.mockRejectedValue(new TypeError("Network request failed"));
    const root = await mount();

    await advance(1 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();

    await advance(FALLBACK_REFRESH_INTERVAL_MS);
    expect(refreshTokenMock).toHaveBeenCalledTimes(2);

    act(() => root.unmount());
  });
});

describe("AuthProvider refresh failure handling", () => {
  beforeEach(() => {
    refreshTokenMock.mockReset();
    (authService.logout as jest.Mock).mockClear();
    tokenGetMock.mockResolvedValue(jwtExpiringIn(2 * MINUTE));
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([429, 500, 502, 503])("keeps the session when the refresh answers %i", async (status) => {
    refreshTokenMock.mockRejectedValue(new ApiError("down", status));
    const root = await mount();

    await advance(1 * MINUTE);
    expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    expect(authService.logout).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("logs out when the server refuses the refresh token", async () => {
    refreshTokenMock.mockResolvedValue(null);
    const root = await mount();

    await advance(1 * MINUTE);
    expect(authService.logout).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });
});

describe("AuthProvider cold start", () => {
  const getCurrentUserMock = authService.getCurrentUser as jest.Mock;

  beforeEach(() => {
    refreshTokenMock.mockReset();
    (authService.logout as jest.Mock).mockClear();
    tokenGetMock.mockResolvedValue(jwtExpiringIn(15 * MINUTE));
  });

  afterEach(() => {
    getCurrentUserMock.mockResolvedValue({ id: 1, username: "tester" });
  });

  it("restores the cached session without waiting for the server", async () => {
    getCurrentUserMock.mockReturnValue(new Promise(() => {}));
    const root = await mount();

    expect(seen.current).toEqual({
      isLoading: false,
      isAuthenticated: true,
      token: expect.stringMatching(/^h\./),
    });

    act(() => root.unmount());
  });

  it("keeps the cached session when revalidation can't reach the server", async () => {
    getCurrentUserMock.mockRejectedValue(new TypeError("Network request failed"));
    const root = await mount();

    expect(seen.current?.isAuthenticated).toBe(true);
    expect(refreshTokenMock).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("tries a refresh when revalidation rejects the stored credential", async () => {
    getCurrentUserMock.mockRejectedValueOnce(new ApiError("SESSION_EXPIRED", 401));
    refreshTokenMock.mockResolvedValue(null);
    const root = await mount();

    expect(refreshTokenMock).toHaveBeenCalledTimes(1);
    expect(seen.current?.isAuthenticated).toBe(false);

    act(() => root.unmount());
  });
});
