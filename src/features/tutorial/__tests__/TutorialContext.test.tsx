jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"));
jest.mock("@shared/context/ThemeContext", () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => "#000000" }) }),
}));
jest.mock("@shared/context/TabBarContext", () => ({
  useTabBar: () => ({ isTabBarCollapsed: false, setIsTabBarCollapsed: jest.fn() }),
}));
const mockAlert = jest.fn();
jest.mock("@shared/components/CustomAlert", () => ({
  useAlert: () => ({ alert: mockAlert, AlertComponent: null }),
}));
let mockMode: "online" | "offline" = "online";
const mockRestartOnboarding = jest.fn();
jest.mock("@shared/services/appMode", () => ({
  getAppModeSync: () => mockMode,
  onAppModeChange: { subscribe: () => () => {} },
  restartOnboarding: () => mockRestartOnboarding(),
}));
const mockOverlay = jest.fn();
jest.mock("../TutorialOverlay", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockOverlay(props);
    return null;
  },
}));
const mockPicker = jest.fn();
jest.mock("../RolePicker", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockPicker(props);
    return null;
  },
}));

import React from "react";
import { create, act, type ReactTestRenderer } from "react-test-renderer";
import { kv, resetMemorySqlite } from "test-utils/memorySqlite";
import { TutorialProvider, useTutorial, useTutorialGate } from "../TutorialContext";
import { TUTORIAL_KEY, readTutorialState } from "../tutorialState";

const navigate = jest.fn();
const nav = { isReady: () => true, getCurrentRoute: () => ({ name: "Home" }), navigate } as never;
const captured: { api?: ReturnType<typeof useTutorial> } = {};
function Capture() {
  captured.api = useTutorial();
  return null;
}
const lastOverlay = () => mockOverlay.mock.calls.at(-1)?.[0] as { onNext: () => void };
function Gate() {
  useTutorialGate();
  return null;
}
const lastPicker = () => mockPicker.mock.calls.at(-1)?.[0] as { mode: string; onPick: (r: string) => void; onSkip: () => void };
const flush = () => act(async () => {});

let tree: ReactTestRenderer;
const mount = async (withGate = true) => {
  await act(async () => {
    tree = create(
      <TutorialProvider navigationRef={nav}>
        <Capture />
        {withGate ? <Gate /> : null}
      </TutorialProvider>,
    );
  });
};

beforeEach(() => {
  resetMemorySqlite();
  jest.clearAllMocks();
  mockMode = "online";
});

it("shows the first-run picker and records a skip with the current mode", async () => {
  mockMode = "offline";
  await mount();
  expect(lastPicker().mode).toBe("firstRun");
  await act(async () => lastPicker().onSkip());
  await flush();
  expect(readTutorialState()).toMatchObject({ firstRunDone: true, firstRunMode: "offline", onlineTourOffered: false });
});

it("asks an offline user to switch online instead of starting a trainer track", async () => {
  mockMode = "offline";
  await mount();
  await act(async () => lastPicker().onPick("trainer"));
  expect(mockOverlay).not.toHaveBeenCalled();
  const [title, , buttons] = mockAlert.mock.calls[0];
  expect(title).toBe("Trainer features need online mode");
  await act(async () => buttons[1].onPress());
  expect(mockRestartOnboarding).toHaveBeenCalled();
  expect(readTutorialState().firstRunDone).toBe(false);
});

it("starts the track, and logging out mid-tutorial finishes the first run", async () => {
  await mount();
  await act(async () => lastPicker().onPick("user"));
  expect(mockOverlay).toHaveBeenCalled();
  await act(async () => tree.update(<TutorialProvider navigationRef={nav}>{null}</TutorialProvider>));
  await flush();
  expect(readTutorialState()).toMatchObject({ firstRunDone: true, firstRunMode: "online", onlineTourOffered: true });
});

it("never shows the picker again once the first run is done", async () => {
  kv[TUTORIAL_KEY] = JSON.stringify({ firstRunDone: true, firstRunMode: "online", onlineTourOffered: true });
  await mount();
  expect(mockPicker).not.toHaveBeenCalled();
  expect(mockAlert).not.toHaveBeenCalled();
});

it("offers the online tour once to an offline-first device", async () => {
  kv[TUTORIAL_KEY] = JSON.stringify({ firstRunDone: true, firstRunMode: "offline" });
  await mount();
  await flush();
  expect(mockAlert.mock.calls[0][0]).toBe("You're online");
  expect(readTutorialState().onlineTourOffered).toBe(true);
  await act(async () => mockAlert.mock.calls[0][2][1].onPress());
  expect(lastPicker().mode).toBe("onlineTour");
  mockAlert.mockClear();
  await act(async () => tree.unmount());
  await mount();
  expect(mockAlert).not.toHaveBeenCalled();
});

it("Next on a tab spotlight opens that tab", async () => {
  await mount(false);
  await act(async () => captured.api!.start(["home"]));
  navigate.mockClear();
  await act(async () => lastOverlay().onNext());
  expect(navigate).toHaveBeenCalledWith("Main", { screen: "Home" });
});

it("does not mark an online-only chapter complete when only the needs-online card was seen", async () => {
  mockMode = "offline";
  await mount(false);
  await act(async () => captured.api!.start(["friends"]));
  await act(async () => lastOverlay().onNext());
  await flush();
  expect(readTutorialState().completed).not.toContain("friends");
});
