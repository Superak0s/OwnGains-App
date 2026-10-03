import { create, act } from "react-test-renderer";
import { Text } from "react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import { ApiError } from "@shared/services/apiClient";

jest.mock("@features/auth/services/index", () => ({
  authService: {
    isAuthenticated: jest.fn().mockResolvedValue(true),
    getCurrentUser: jest.fn(),
    getStoredUser: jest.fn(),
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
  tokenStorage: { get: jest.fn().mockResolvedValue("stored-token") },
}));

import { authService } from "@features/auth/services/index";

const getCurrentUser = authService.getCurrentUser as jest.Mock;
const getStoredUser = authService.getStoredUser as jest.Mock;
const logoutMock = authService.logout as jest.Mock;

function Probe() {
  const { isAuthenticated, isLoading, user } = useAuth();
  return (
    <Text>{`${isLoading ? "loading" : "ready"}:${isAuthenticated}:${user?.username ?? "none"}`}</Text>
  );
}

const boot = async () => {
  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });
  return root!.root.findByType(Text).props.children as string;
};

describe("AuthProvider cold start with no connectivity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it("keeps the cached session when the server is unreachable", async () => {
    getCurrentUser.mockRejectedValue(new TypeError("Network request failed"));
    getStoredUser.mockResolvedValue({ id: 7, username: "tester" });

    expect(await boot()).toBe("ready:true:tester");
    expect(logoutMock).not.toHaveBeenCalled();
  });

  it("logs out when the server actually rejects the token", async () => {
    getCurrentUser.mockRejectedValue(new ApiError("Unauthorized", 401));
    (authService.refreshToken as jest.Mock).mockResolvedValue(null);
    getStoredUser.mockResolvedValue({ id: 7, username: "tester" });

    expect(await boot()).toBe("ready:false:none");
    expect(logoutMock).toHaveBeenCalled();
  });
});
