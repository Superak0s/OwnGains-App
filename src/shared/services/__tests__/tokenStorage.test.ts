jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock("../crashReporting", () => ({
  log: { warn: jest.fn() },
  metric: { count: jest.fn() },
}));

let SecureStore: typeof import("expo-secure-store");
let tokenStorage: (typeof import("../tokenStorage"))["tokenStorage"];
let refreshTokenStorage: (typeof import("../tokenStorage"))["refreshTokenStorage"];

beforeEach(() => {
  // resetModules gives the module under test a fresh mock instance, so the
  // test has to re-require it to keep asserting against the same functions.
  jest.resetModules();
  SecureStore = require("expo-secure-store");
  ({ tokenStorage, refreshTokenStorage } = require("../tokenStorage"));
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  jest.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  jest.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
});

it("reads the access token once and serves later reads from memory", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("a");
  expect(await tokenStorage.get()).toBe("a");
  expect(await tokenStorage.get()).toBe("a");
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
});

it("set updates the cache without re-reading the store", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("a");
  await tokenStorage.get();
  await tokenStorage.set("b");
  expect(await tokenStorage.get()).toBe("b");
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
});

it("clear drops the cached token, so reads remain fast while signed out", async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue("a");
  await tokenStorage.get();
  await tokenStorage.clearAccess();
  expect(await tokenStorage.get()).toBe(null);
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(1);
});

it("a token that cannot be read counts as no token", async () => {
  jest.mocked(SecureStore.getItemAsync).mockRejectedValue(new Error("locked"));
  expect(await tokenStorage.get()).toBe(null);
});

it("the refresh token is cached and cleared independently", async () => {
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (key) =>
    key === "auth_refresh_token" ? "r" : "a",
  );
  expect(await tokenStorage.get()).toBe("a");
  expect(await refreshTokenStorage.get()).toBe("r");
  await refreshTokenStorage.clear();
  expect(await refreshTokenStorage.get()).toBe(null);
  expect(await tokenStorage.get()).toBe("a");
  expect(SecureStore.getItemAsync).toHaveBeenCalledTimes(2);
});

it("retries a read that failed instead of caching the failure", async () => {
  jest
    .mocked(SecureStore.getItemAsync)
    .mockRejectedValueOnce(new Error("locked"))
    .mockResolvedValueOnce("a");
  expect(await tokenStorage.get()).toBe(null);
  expect(await tokenStorage.get()).toBe("a");
});

it("a read that resolves after a set does not overwrite the new token", async () => {
  let resolveRead: (value: string) => void = () => {};
  jest.mocked(SecureStore.getItemAsync).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  const pending = refreshTokenStorage.get();
  await refreshTokenStorage.set("new");
  resolveRead("old");
  expect(await pending).toBe("new");
  expect(await refreshTokenStorage.get()).toBe("new");
});

it("a read that resolves after a clear does not bring the token back", async () => {
  let resolveRead: (value: string) => void = () => {};
  jest.mocked(SecureStore.getItemAsync).mockReturnValueOnce(
    new Promise((resolve) => {
      resolveRead = resolve;
    }),
  );
  const pending = tokenStorage.get();
  await tokenStorage.clear();
  resolveRead("old");
  expect(await pending).toBe(null);
  expect(await tokenStorage.get()).toBe(null);
});
