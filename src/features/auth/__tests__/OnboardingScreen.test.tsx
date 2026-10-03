import { create, act } from "react-test-renderer";
import { TouchableOpacity } from "react-native";

let mockCurrentMode = "online";
jest.mock("@shared/services/appMode", () => ({
  setAppMode: jest.fn().mockResolvedValue(true),
  setOnboardingComplete: jest.fn().mockResolvedValue(undefined),
  getAppModeSync: () => mockCurrentMode,
}));

let mockIsAuthenticated = false;
jest.mock("@shared/context/AuthContext", () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}));


jest.mock("@shared/services/crashReporting", () => ({
  captureException: jest.fn(),
}));

jest.mock("@shared/context/ThemeContext", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#000000" }) }),
}));


import { setAppMode, setOnboardingComplete } from "@shared/services/appMode";
import OnboardingScreen from "../OnboardingScreen";

const navigation = { navigate: jest.fn() } as never;

const renderScreen = async () => {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<OnboardingScreen navigation={navigation} />);
  });
  return tree.root
    .findAllByType(TouchableOpacity)
    .filter((n) => n.props.accessibilityRole === "button");
};

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  mockCurrentMode = "online";
  mockIsAuthenticated = false;
});

it("stores offline mode for the first choice", async () => {
  const cards = await renderScreen();
  await act(async () => {
    await cards[0]!.props.onPress();
  });
  expect(setAppMode).toHaveBeenCalledWith("offline");
  expect(setOnboardingComplete).toHaveBeenCalledWith(true);
});

it("stores online mode for the second choice", async () => {
  const cards = await renderScreen();
  await act(async () => {
    await cards[1]!.props.onPress();
  });
  expect(setAppMode).toHaveBeenCalledWith("online");
});

// The flag is what lifts the onboarding gate. If it were written first, a
// failed mode write would strand the user on a sign-in form with no mode set.
it("does not mark onboarding complete when the mode write fails", async () => {
  (setAppMode as jest.Mock).mockRejectedValueOnce(new Error("db closed"));
  const cards = await renderScreen();
  await act(async () => {
    await cards[0]!.props.onPress();
  });
  expect(setOnboardingComplete).not.toHaveBeenCalled();
});

// Switching away from offline leaves the local profile and its workouts on the
// device but unreachable, which the card copy does not say.
it("confirms before leaving offline mode for a server", async () => {
  mockCurrentMode = "offline";
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(<OnboardingScreen navigation={navigation} />);
  });
  const cards = tree.root
    .findAllByType(TouchableOpacity)
    .filter((n) => n.props.accessibilityRole === "button");
  await act(async () => {
    await cards[1]!.props.onPress();
  });
  expect(setAppMode).not.toHaveBeenCalled();

  // The confirm button shares the card's accessibility label, and the alert
  // renders after the card list, so the last match is the button.
  const confirms = tree.root
    .findAllByProps({ accessibilityLabel: "Connect to a server" })
    .filter((n) => typeof n.props.onPress === "function");
  await act(async () => {
    confirms[confirms.length - 1]!.props.onPress();
  });
  expect(setAppMode).toHaveBeenCalledWith("online");
});

// Reached from Settings, this screen opens on top of a live session. Without a
// way out the only exit is picking a mode.
it("offers a way back when there is a session behind it", async () => {
  mockIsAuthenticated = true;
  const cards = await renderScreen();
  await act(async () => {
    await cards[2]!.props.onPress();
  });
  expect(setOnboardingComplete).toHaveBeenCalledWith(true);
  expect(setAppMode).not.toHaveBeenCalled();
});
