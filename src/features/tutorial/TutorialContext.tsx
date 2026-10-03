import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, StyleSheet, View, type GestureResponderEvent } from "react-native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { useAlert } from "@shared/components/CustomAlert";
import { useTabBar } from "@shared/context/TabBarContext";
import { getAppModeSync, onAppModeChange, restartOnboarding, type AppMode } from "@shared/services/appMode";
import { DEFAULT_TAB_ORDER, type TabName } from "@shared/services/tabOrder";
import type { AnchorRect } from "./anchors";
import { CHAPTERS, chaptersFor, onlineChaptersFor, stepsFor, type ChapterId } from "./chapters";
import { advance, retreat, skip, type Cursor } from "./engine";
import {
  gateAction,
  markChapterCompleted,
  markFirstRunDone,
  markOnlineTourOffered,
  pickOutcome,
  readTutorialState,
  setTutorialRole,
  type PickerMode,
  type Role,
} from "./tutorialState";
import RolePicker from "./RolePicker";
import TutorialOverlay from "./TutorialOverlay";

type NavRef = NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>;

export interface TutorialApi {
  start: (queue: ChapterId[], firstRun?: boolean) => void;
  openRolePicker: (mode: PickerMode) => void;
  runGate: () => void;
  leaveMain: () => void;
}

const noop = () => {};
const TutorialContext = createContext<TutorialApi>({
  start: noop,
  openRolePicker: noop,
  runGate: noop,
  leaveMain: noop,
});

export const useTutorial = (): TutorialApi => useContext(TutorialContext);

export function useTutorialGate(): void {
  const { runGate, leaveMain } = useTutorial();
  useEffect(() => {
    runGate();
    return leaveMain;
  }, [runGate, leaveMain]);
}

interface Run {
  queue: ChapterId[];
  firstRun: boolean;
  mode: AppMode;
  startTab: TabName | null;
}

const TAP_DELAY_MS = 350;
const inside = (r: AnchorRect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

export function TutorialProvider({
  navigationRef,
  children,
}: {
  readonly navigationRef: NavRef;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const { alert, AlertComponent } = useAlert();
  const { setIsTabBarCollapsed } = useTabBar();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const cursorRef = useRef<Cursor | null>(null);
  const runRef = useRef<Run | null>(null);
  const holeRef = useRef<AnchorRect | null>(null);
  const touchRef = useRef<{ x: number; y: number } | null>(null);

  const show = useCallback((c: Cursor | null) => {
    cursorRef.current = c;
    setCursor(c);
  }, []);

  const count = useCallback(
    (id: ChapterId) => stepsFor(CHAPTERS[id], runRef.current?.mode ?? "online").length,
    [],
  );

  const goToTab = useCallback(
    (tab: TabName) => {
      if (!navigationRef.isReady()) return;
      (navigationRef.navigate as unknown as (name: string, params: object) => void)("Main", { screen: tab });
    },
    [navigationRef],
  );

  const finish = useCallback(
    (restoreTab: boolean) => {
      const run = runRef.current;
      runRef.current = null;
      holeRef.current = null;
      show(null);
      if (!run) return;
      if (run.firstRun) void markFirstRunDone(run.mode);
      if (restoreTab && run.startTab) goToTab(run.startTab);
    },
    [goToTab, show],
  );

  const start = useCallback(
    (queue: ChapterId[], firstRun = false) => {
      if (queue.length === 0) return;
      const current = navigationRef.isReady() ? (navigationRef.getCurrentRoute() as { name: string } | undefined)?.name : undefined;
      const startTab = (DEFAULT_TAB_ORDER as readonly string[]).includes(current ?? "")
        ? (current as TabName)
        : null;
      runRef.current = { queue, firstRun, mode: getAppModeSync(), startTab };
      setPicker(null);
      show({ queue, chapter: 0, step: 0 });
    },
    [navigationRef, show],
  );

  const next = useCallback(() => {
    const c = cursorRef.current;
    if (!c) return;
    const run = runRef.current;
    const cur = run ? stepsFor(CHAPTERS[c.queue[c.chapter]], run.mode)[c.step] : null;
    if (cur?.kind === "spotlight" && cur.advanceOn === "tap" && cur.anchor.startsWith("tab.")) {
      goToTab(cur.anchor.slice(4) as TabName);
    }
    const { cursor: n, completed } = advance(c, count);
    if (completed && !(CHAPTERS[completed].onlineOnly && run?.mode === "offline")) {
      void markChapterCompleted(completed);
    }
    if (n) show(n);
    else finish(true);
  }, [count, finish, goToTab, show]);

  const confirmExit = useCallback(() => {
    alert(
      "Leave the tutorial?",
      "You can replay any chapter from Settings → Tutorial.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave", style: "destructive", onPress: () => finish(true) },
      ],
      "info",
    );
  }, [alert, finish]);

  const back = useCallback(() => {
    const c = cursorRef.current;
    if (!c) return;
    if (c.chapter === 0 && c.step === 0) confirmExit();
    else show(retreat(c, count));
  }, [confirmExit, count, show]);

  const skipChapter = useCallback(() => {
    const c = cursorRef.current;
    if (!c) return;
    const n = skip(c);
    if (n) show(n);
    else finish(true);
  }, [finish, show]);

  const leaveMain = useCallback(() => {
    setPicker(null);
    finish(false);
  }, [finish]);

  const step = cursor
    ? stepsFor(CHAPTERS[cursor.queue[cursor.chapter]], runRef.current?.mode ?? "online")[cursor.step]
    : null;

  useEffect(() => {
    if (!step) return;
    if (step.kind === "spotlight") {
      setIsTabBarCollapsed(false);
      if (step.tab) goToTab(step.tab);
    }
    AccessibilityInfo.announceForAccessibility(
      step.kind === "card" ? `${step.title}. ${step.body}` : step.caption,
    );
  }, [step, goToTab, setIsTabBarCollapsed]);

  const runGate = useCallback(() => {
    const action = gateAction(readTutorialState(), getAppModeSync());
    if (action === "firstRun") setPicker("firstRun");
    if (action !== "onlineTour") return;
    // Marked before asking, so dismissing the alert still counts as the one offer.
    void markOnlineTourOffered();
    alert(
      "You're online",
      "Take a quick tour of friends, sharing and training?",
      [
        { text: "Not now", style: "cancel" },
        { text: "Show me", onPress: () => setPicker("onlineTour") },
      ],
      "info",
    );
  }, [alert]);

  const pick = useCallback(
    (role: Role) => {
      if (!picker) return;
      const outcome = pickOutcome(role, getAppModeSync(), picker);
      if (outcome === "needsOnline") {
        alert(
          "Trainer features need online mode",
          "Coaching clients goes through a server. Switch to online mode now? You'll sign in, then pick your track again.",
          [
            { text: "Back", style: "cancel" },
            {
              text: "Switch to online",
              onPress: () => {
                setPicker(null);
                void restartOnboarding();
              },
            },
          ],
          "info",
        );
        return;
      }
      void setTutorialRole(role);
      if (outcome === "setRole") {
        setPicker(null);
        return;
      }
      start(picker === "onlineTour" ? onlineChaptersFor(role) : chaptersFor(role), picker === "firstRun");
    },
    [alert, picker, start],
  );

  const skipPicker = useCallback(() => {
    if (picker === "firstRun") void markFirstRunDone(getAppModeSync());
    setPicker(null);
  }, [picker]);

  useEffect(() => {
    if (!cursor && !picker) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (cursor) back();
      else skipPicker();
      return true;
    });
    return () => sub.remove();
  }, [cursor, picker, back, skipPicker]);

  useEffect(() => onAppModeChange.subscribe(() => leaveMain()), [leaveMain]);

  const onHole = useCallback((r: AnchorRect | null) => {
    holeRef.current = r;
  }, []);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchRef.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
  };
  // Tap-through steps pass the touch to the real control. This only notices that it happened.
  const onTouchEnd = (e: GestureResponderEvent) => {
    const hole = holeRef.current;
    const startTouch = touchRef.current;
    if (!hole || !startTouch) return;
    if (inside(hole, startTouch.x, startTouch.y) && inside(hole, e.nativeEvent.pageX, e.nativeEvent.pageY)) {
      holeRef.current = null;
      const scheduledFor = cursorRef.current;
      setTimeout(() => {
        if (cursorRef.current === scheduledFor) next();
      }, TAP_DELAY_MS);
    }
  };

  const openRolePicker = useCallback((mode: PickerMode) => setPicker(mode), []);

  const value = useMemo<TutorialApi>(
    () => ({ start, openRolePicker, runGate, leaveMain }),
    [start, openRolePicker, runGate, leaveMain],
  );

  const chapter = cursor ? CHAPTERS[cursor.queue[cursor.chapter]] : null;
  const total = chapter ? count(chapter.id) : 0;
  const hideApp = (picker !== null && cursor === null) || (cursor !== null && !(step?.kind === "spotlight" && step.advanceOn === "tap"));

  return (
    <TutorialContext.Provider value={value}>
      <View style={styles.root} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <View style={styles.root} importantForAccessibility={hideApp ? "no-hide-descendants" : "auto"} accessibilityElementsHidden={hideApp}>
          {children}
        </View>
        {cursor && chapter && step && (
          <TutorialOverlay
            key={`${cursor.chapter}-${cursor.step}`}
            step={step}
            chapter={chapter}
            stepLabel={`${cursor.step + 1}/${total}`}
            canGoBack={cursor.chapter > 0 || cursor.step > 0}
            isLast={cursor.chapter === cursor.queue.length - 1 && cursor.step === total - 1}
            onHole={onHole}
            onNext={next}
            onBack={back}
            onSkipChapter={skipChapter}
            onExit={() => finish(true)}
          />
        )}
        {picker && !cursor && (
          <RolePicker mode={picker} appMode={getAppModeSync()} onPick={pick} onSkip={skipPicker} />
        )}
        {AlertComponent}
      </View>
    </TutorialContext.Provider>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
