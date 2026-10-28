import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { getAppModeSync } from "@shared/services/appMode";
import { getAppRole } from "@shared/services/appRole";
import { CHAPTERS, TRAINER_TOUR, TUTORIAL, type ChapterId } from "./chapters";
import { useTutorial } from "./TutorialContext";
import { onTutorialStateChange, readTutorialState } from "./tutorialState";

export default function TutorialMenuSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { start } = useTutorial();
  const [state, setState] = useState(readTutorialState);
  useEffect(() => onTutorialStateChange.subscribe(setState), []);
  useEffect(() => {
    if (visible) setState(readTutorialState());
  }, [visible]);

  const offline = getAppModeSync() === "offline";
  const ids = !offline && getAppRole() === "trainer" ? [...TUTORIAL, ...TRAINER_TOUR] : TUTORIAL;
  const done = ids.filter((id) => state.completed.includes(id)).length;
  const play = (queue: ChapterId[]) => {
    onClose();
    start(queue);
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Tutorial"
      subtitle={`${done}/${ids.length} chapters done`}
      showCancelButton={false}
      showConfirmButton={false}
      scrollable
    >
      <TouchableOpacity style={styles.primary} onPress={() => play(ids)} accessibilityRole="button" accessibilityLabel="Play the whole tutorial">
        <Text style={styles.primaryText}>▶ Play all</Text>
      </TouchableOpacity>
      {ids.map((id) => {
        const ch = CHAPTERS[id];
        const isDone = state.completed.includes(id);
        return (
          <TouchableOpacity
            key={id}
            style={styles.row}
            onPress={() => play([id])}
            accessibilityRole="button"
            accessibilityLabel={`Play ${ch.title}${isDone ? ", completed" : ""}${ch.onlineOnly && offline ? ", needs online mode" : ""}`}
          >
            <Text style={styles.icon}>{ch.icon}</Text>
            <Text style={styles.title}>{ch.title}</Text>
            {ch.onlineOnly && offline && <Text style={styles.tag}>🌐</Text>}
            <Text style={[styles.status, isDone && { color: colors.success }]}>{isDone ? "✓" : "›"}</Text>
          </TouchableOpacity>
        );
      })}
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    primary: { marginBottom: 12, backgroundColor: colors.accent, borderRadius: 12, padding: 12, alignItems: "center" },
    primaryText: { color: colors.textOnAccent, fontWeight: "700" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceBorder },
    icon: { fontSize: 22 },
    title: { flex: 1, fontSize: 15, color: colors.textPrimary },
    tag: { fontSize: 14 },
    status: { fontSize: 18, fontWeight: "700", color: colors.textMuted },
  });
