jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("@shared/services/notifications", () => ({
  getNotifications: jest.fn(async () => null),
  scheduleNotification: jest.fn(),
}));
jest.mock("../services", () => ({
  hydrationApi: { logHydration: jest.fn(async () => ({ success: true })) },
}));
jest.mock("@features/auth/services", () => ({
  authService: { getStoredUser: jest.fn() },
}));
jest.mock("../tabs/HydrationTab", () => ({ LogHydrationModal: () => null }));

import { ToastAndroid } from "react-native";
import { authService } from "@features/auth/services";
import { setRecordStoreUser } from "@shared/services/offlineHelpers";
import { hydrationApi } from "../services";
import { logFromTile } from "../hydrationTiles";

const getStoredUser = authService.getStoredUser as jest.Mock;
const logHydration = hydrationApi.logHydration as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  setRecordStoreUser(null);
  jest.spyOn(ToastAndroid, "show").mockImplementation(() => {});
});

it("logs the tile's amount for the stored user", async () => {
  getStoredUser.mockResolvedValue({ id: 7 });
  await logFromTile({ ml: 250 });
  expect(logHydration).toHaveBeenCalledWith(250);
  expect(ToastAndroid.show).toHaveBeenCalledWith("Logged 250 ml of water", expect.anything());
});

it("logs nothing when signed out or signed in as someone else", async () => {
  getStoredUser.mockResolvedValue(null);
  await logFromTile({ ml: 250 });
  getStoredUser.mockResolvedValue({ id: 7 });
  setRecordStoreUser("8");
  await logFromTile({ ml: 500 });
  expect(logHydration).not.toHaveBeenCalled();
});

it("says so when the log fails", async () => {
  getStoredUser.mockResolvedValue({ id: 7 });
  logHydration.mockRejectedValueOnce(new Error("offline"));
  await logFromTile({ ml: 500 });
  expect(ToastAndroid.show).toHaveBeenCalledWith(
    "Couldn't log water. Open OwnGains to try again.",
    expect.anything(),
  );
});
