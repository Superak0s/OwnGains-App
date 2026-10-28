import { Platform } from "react-native";
import { getSdkStatus } from "react-native-health-connect";
import { getAvailability } from "../healthConnect";

jest.mock("react-native-health-connect", () => ({
  getSdkStatus: jest.fn(),
  initialize: jest.fn(),
  getGrantedPermissions: jest.fn(),
  requestPermission: jest.fn(),
  openHealthConnectSettings: jest.fn(),
  SdkAvailabilityStatus: {
    SDK_UNAVAILABLE: 1,
    SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2,
    SDK_AVAILABLE: 3,
  },
}));

const setPlatform = (os: string, version: number) => {
  Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });
  Object.defineProperty(Platform, "Version", { get: () => version, configurable: true });
};

beforeEach(() => jest.clearAllMocks());

it.each([
  [30, 3, "available"],
  [30, 2, "needs_update"],
  [30, 1, "needs_install"],
  [34, 1, "unsupported"],
  [27, 1, "unsupported"],
])("Android API %i with SDK status %i is %s", async (version, status, expected) => {
  setPlatform("android", version);
  jest.mocked(getSdkStatus).mockResolvedValue(status);
  await expect(getAvailability()).resolves.toBe(expected);
});

it("is unsupported off Android without asking the SDK", async () => {
  setPlatform("ios", 17);
  await expect(getAvailability()).resolves.toBe("unsupported");
  expect(getSdkStatus).not.toHaveBeenCalled();
});
