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
jest.mock("@shared/services/appMode", () => ({
  getAppModeSync: () => mockMode,
  onAppModeChange: { subscribe: () => () => {} },
}));
const mockOverlay = jest.fn();
jest.mock("../TutorialOverlay", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockOverlay(props);
    return null;
  },
}));
const mockIntro = jest.fn();
jest.mock("../TutorialIntro", () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockIntro(props);
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
const lastOverlay = () => mockOverlay.mock.calls.at(-1)?.[0] as { onNext: () => void; chapter: { id: string } };
function Gate() {
  useTutorialGate();
  return null;
}
const lastIntro = () => mockIntro.mock.calls.at(-1)?.[0] as { onStart: () => void; onSkip: () => void };
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

it("shows the first-run intro and records a skip with the current mode", async () => {
  mockMode = "offline";
  await mount();
  await act(async () => lastIntro().onSkip());
  await flush();
  expect(readTutorialState()).toMatchObject({ firstRunDone: true, firstRunMode: "offline", onlineTourOffered: false });
});

it("starts the track, and logging out mid-tutorial finishes the first run", async () => {
  await mount();
  await act(async () => lastIntro().onStart());
  expect(lastOverlay().chapter.id).toBe("welcome");
  await act(async () => tree.update(<TutorialProvider navigationRef={nav}>{null}</TutorialProvider>));
  await flush();
  expect(readTutorialState()).toMatchObject({ firstRunDone: true, firstRunMode: "online", onlineTourOffered: true });
});

it("never shows the intro again once the first run is done", async () => {
  kv[TUTORIAL_KEY] = JSON.stringify({ firstRunDone: true, firstRunMode: "online", onlineTourOffered: true });
  await mount();
  expect(mockIntro).not.toHaveBeenCalled();
  expect(mockAlert).not.toHaveBeenCalled();
});

it("offers the online tour once to an offline-first device", async () => {
  kv[TUTORIAL_KEY] = JSON.stringify({ firstRunDone: true, firstRunMode: "offline" });
  await mount();
  await flush();
  expect(mockAlert.mock.calls[0][0]).toBe("You're online");
  expect(readTutorialState().onlineTourOffered).toBe(true);
  await act(async () => mockAlert.mock.calls[0][2][1].onPress());
  expect(lastOverlay().chapter.id).toBe("friends");
  mockAlert.mockClear();
  await act(async () => tree.unmount());
  await mount();
  expect(mockAlert).not.toHaveBeenCalled();
});

it("a spotlight on another tab opens that tab", async () => {
  await mount(false);
  navigate.mockClear();
  await act(async () => captured.api!.start(["tracking"]));
  expect(navigate).toHaveBeenCalledWith("Main", { screen: "Tracking" });
});

it("does not mark an online-only chapter complete when only the needs-online card was seen", async () => {
  mockMode = "offline";
  await mount(false);
  await act(async () => captured.api!.start(["friends"]));
  await act(async () => lastOverlay().onNext());
  await flush();
  expect(readTutorialState().completed).not.toContain("friends");
});

it("offers the trainer tour once, and never once its chapters are done", async () => {
  await mount(false);
  await act(async () => captured.api!.offerTrainerTour());
  const [title, , buttons] = mockAlert.mock.calls[0];
  expect(title).toBe("Trainer Mode is on");
  await act(async () => buttons[1].onPress());
  expect(lastOverlay().chapter.id).toBe("trainerClient");
  await flush();
  mockAlert.mockClear();
  await act(async () => captured.api!.offerTrainerTour());
  expect(mockAlert).not.toHaveBeenCalled();
  kv[TUTORIAL_KEY] = JSON.stringify({ completed: ["trainerClient", "trainerSession", "trainerFollow"] });
  await act(async () => captured.api!.offerTrainerTour());
  expect(mockAlert).not.toHaveBeenCalled();
});
