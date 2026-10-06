jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("@shared/services/notifications", () => ({
  getNotifications: jest.fn(async () => null),
  scheduleNotification: jest.fn(),
}));
jest.mock("../services", () => ({
  hydrationApi: { logHydration: jest.fn(async () => ({ success: true })) },
}));

import { hydrationApi } from "../services";
import { setRecordStoreUser } from "@shared/services/offlineHelpers";
import { handleHydrationAction } from "../hydrationNotification";

const response = (actionIdentifier: string, content: object) =>
  ({ actionIdentifier, notification: { request: { content } } }) as never;
const data = { type: "hydration_quick_log", userId: "u1" };

beforeEach(() => {
  jest.clearAllMocks();
  setRecordStoreUser(null);
});

it("logs the button's amount for the notification's user", async () => {
  await handleHydrationAction(response("add-ml:250", { data }));
  expect(hydrationApi.logHydration).toHaveBeenCalledWith(250);
});

it("reads the unmapped JSON data the background task receives", async () => {
  await handleHydrationAction(
    response("add-ml:500", { dataString: JSON.stringify(data) }),
  );
  expect(hydrationApi.logHydration).toHaveBeenCalledWith(500);
});

it("ignores taps on the body, other notifications and another signed-in user", async () => {
  await handleHydrationAction(response("expo.modules.notifications.actions.DEFAULT", { data }));
  await handleHydrationAction(response("add-ml:250", { data: { type: "other", userId: "u1" } }));
  await handleHydrationAction(response("add-ml:0", { data }));
  setRecordStoreUser("u2");
  await handleHydrationAction(response("add-ml:250", { data }));
  expect(hydrationApi.logHydration).not.toHaveBeenCalled();
});
