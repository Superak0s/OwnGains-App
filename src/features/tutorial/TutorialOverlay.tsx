import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { measureAnchor, waitForAnchor, type AnchorRect } from "./anchors";
import type { Chapter, Step } from "./chapters";
import { Hand, PulseRing } from "./motion";
import Practice from "./practice/Practice";

const DIM = "rgba(0,0,0,0.72)";
const PAD = 6;
const GIVE_UP_MS = 1500;

interface Props {
  readonly step: Step;
  readonly chapter: Chapter;
  readonly stepLabel: string;
  readonly canGoBack: boolean;
  readonly isLast: boolean;
  readonly onHole: (r: AnchorRect | null) => void;
  readonly onNext: () => void;
  readonly onBack: () => void;
  readonly onSkipChapter: () => void;
  readonly onExit: () => void;
}

const block = { onStartShouldSetResponder: () => true } as const;

export default function TutorialOverlay(p: Props): React.JSX.Element {
  const { step } = p;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [rect, setRect] = useState<AnchorRect | null | "pending">(step.kind === "spotlight" ? "pending" : null);
  const [practiceDone, setPracticeDone] = useState(false);

  useEffect(() => {
    if (step.kind !== "spotlight") return;
    let alive = true;
    // measureInWindow may never call back, and the race keeps the step from hanging on "pending".
    const giveUp = new Promise<null>((resolve) => setTimeout(() => resolve(null), GIVE_UP_MS));
    void Promise.race([waitForAnchor(step.anchor), giveUp]).then((r) => alive && setRect(r));
    // Re-measured so the hole follows the tab bar sliding back in or a list scrolling.
    const id = setInterval(() => {
      void measureAnchor(step.anchor).then((r) => alive && r && setRect(r));
    }, 500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [step]);

  const hole = step.kind === "spotlight" && rect && rect !== "pending"
    ? { x: rect.x - PAD, y: rect.y - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }
    : null;
  const { onHole } = p;
  const tapHole = step.kind === "spotlight" && step.advanceOn === "tap" ? hole : null;
  useEffect(() => {
    onHole(tapHole);
  }, [onHole, tapHole?.x, tapHole?.y, tapHole?.width, tapHole?.height]);

  const topBar = (
    <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
      <Text style={styles.chapterTitle} numberOfLines={1}>
        {p.chapter.icon} {p.chapter.title} · {p.stepLabel}
      </Text>
      <TouchableOpacity onPress={p.onSkipChapter} accessibilityRole="button" accessibilityLabel="Skip this chapter" style={styles.topBtn}>
        <Text style={styles.topBtnText}>Skip chapter</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={p.onExit} accessibilityRole="button" accessibilityLabel="Exit tutorial" style={styles.topBtn}>
        <Text style={styles.topBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  const nextLabel = (() => {
    if (step.kind === "practice" && !practiceDone) return "Skip practice";
    return p.isLast ? "Done" : "Next ›";
  })();
  const bottomBar = (
    <View style={styles.bottomBar}>
      <TouchableOpacity onPress={p.onBack} disabled={!p.canGoBack} accessibilityRole="button" accessibilityLabel="Previous step" accessibilityState={{ disabled: !p.canGoBack }} style={[styles.navBtn, !p.canGoBack && { opacity: 0.3 }]}>
        <Text style={styles.navText}>‹ Back</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={p.onNext} accessibilityRole="button" accessibilityLabel={nextLabel} style={[styles.navBtn, styles.nextBtn, step.kind === "practice" && !practiceDone && styles.nextMuted]}>
        <Text style={styles.nextText}>{nextLabel}</Text>
      </TouchableOpacity>
    </View>
  );

  if (step.kind === "spotlight" && rect === "pending") {
    return <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} accessibilityViewIsModal {...block} />;
  }

  if (step.kind === "spotlight" && hole) {
    const below = hole.y + hole.height / 2 < height / 2;
    const bands = [
      { left: 0, top: 0, width, height: Math.max(0, hole.y) },
      { left: 0, top: hole.y + hole.height, width, height: Math.max(0, height - hole.y - hole.height) },
      { left: 0, top: hole.y, width: Math.max(0, hole.x), height: hole.height },
      { left: hole.x + hole.width, top: hole.y, width: Math.max(0, width - hole.x - hole.width), height: hole.height },
    ];
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal>
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <Mask id="tutorialHole">
              <Rect x={0} y={0} width={width} height={height} fill="white" />
              <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={14} fill="black" />
            </Mask>
          </Defs>
          <Rect x={0} y={0} width={width} height={height} fill={DIM} mask="url(#tutorialHole)" />
        </Svg>
        {bands.map((b, i) => (
          <View key={i} style={[styles.abs, b]} {...block} />
        ))}
        {step.advanceOn === "next" && <View style={[styles.abs, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} {...block} />}
        <PulseRing rect={hole} />
        {step.gesture && <Hand gesture={step.gesture} x={hole.x + hole.width / 2} y={hole.y + hole.height / 2} />}
        {topBar}
        <View style={[styles.bubble, below ? { top: hole.y + hole.height + 16 } : { bottom: height - hole.y + 16 }]}>
          <Text style={styles.bubbleText} accessibilityLiveRegion="polite">{step.caption}</Text>
          {bottomBar}
        </View>
      </View>
    );
  }

  let body: React.ReactNode;
  if (step.kind === "card") {
    body = (
      <>
        <Text style={styles.cardIcon}>{step.icon}</Text>
        <Text style={styles.cardTitle} accessibilityRole="header">{step.title}</Text>
        <Text style={styles.cardBody}>{step.body}</Text>
      </>
    );
  } else if (step.kind === "practice") {
    body = (
      <>
        <Text style={styles.cardBody}>{step.caption}</Text>
        <Practice spec={step.practice} onComplete={() => setPracticeDone(true)} />
        {practiceDone && <Text style={styles.done}>✓ Nice. That's how it works.</Text>}
      </>
    );
  } else {
    body = (
      <>
        <Text style={styles.cardIcon}>🔎</Text>
        <Text style={styles.cardTitle} accessibilityRole="header">{step.caption}</Text>
        <Text style={styles.cardBody}>{step.fallback}</Text>
      </>
    );
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} accessibilityViewIsModal {...block}>
      {topBar}
      <View style={styles.panelWrap}>
        <ScrollView
          style={styles.panel}
          contentContainerStyle={styles.panelContent}
          scrollEnabled={!(step.kind === "practice" && step.practice.type === "twoFingerPull")}
        >
          {body}
        </ScrollView>
        {bottomBar}
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    abs: { position: "absolute" },
    topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: 8 },
    chapterTitle: { flex: 1, color: "#ffffff", fontWeight: "700", fontSize: 14 },
    topBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.15)" },
    topBtnText: { color: "#ffffff", fontWeight: "600" },
    bubble: { position: "absolute", left: 16, right: 16, backgroundColor: colors.surface, borderRadius: 16, padding: 14 },
    bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 21 },
    bottomBar: { flexDirection: "row", justifyContent: "space-between", paddingTop: 10, gap: 8 },
    navBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.15)" },
    navText: { color: "#ffffff", fontWeight: "600", fontSize: 13 },
    nextBtn: { backgroundColor: colors.accent },
    nextMuted: { backgroundColor: "rgba(255,255,255,0.15)" },
    nextText: { color: colors.textOnAccent, fontWeight: "700", fontSize: 13 },
    panelWrap: { flex: 1, justifyContent: "center", paddingHorizontal: 16, paddingTop: 56 },
    panel: { flexGrow: 0, maxHeight: "92%", backgroundColor: colors.background, borderRadius: 20 },
    panelContent: { padding: 20, gap: 12 },
    cardIcon: { fontSize: 56, textAlign: "center" },
    cardTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, textAlign: "center" },
    cardBody: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
    done: { fontSize: 15, fontWeight: "700", color: colors.success, textAlign: "center" },
  });
