import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { getAppModeSync } from "@shared/services/appMode";
import { CHAPTERS, chaptersFor, type ChapterId } from "./chapters";
import { useTutorial } from "./TutorialContext";
import { ROLE_LABELS, onTutorialStateChange, readTutorialState } from "./tutorialState";

export default function TutorialMenuSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { start, openRolePicker } = useTutorial();
  const [state, setState] = useState(readTutorialState);
  useEffect(() => onTutorialStateChange.subscribe(setState), []);
  useEffect(() => {
    if (visible) setState(readTutorialState());
  }, [visible]);

  const role = state.role ?? "user";
  const ids = chaptersFor(role);
  const offline = getAppModeSync() === "offline";
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
      subtitle={`${ROLE_LABELS[role]} track · ${done}/${ids.length} chapters done`}
      showCancelButton={false}
      showConfirmButton={false}
      scrollable
    >
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={() => play(offline && role !== "user" ? chaptersFor("user") : ids)} accessibilityRole="button" accessibilityLabel="Play the whole tutorial">
          <Text style={styles.primaryText}>▶ Play all</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondary}
          onPress={() => {
            onClose();
            openRolePicker("change");
          }}
          accessibilityRole="button"
          accessibilityLabel="Change tutorial track"
        >
          <Text style={styles.secondaryText}>Change role</Text>
        </TouchableOpacity>
      </View>
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
    actions: { flexDirection: "row", gap: 10, marginBottom: 12 },
    primary: { flex: 1, backgroundColor: colors.accent, borderRadius: 12, padding: 12, alignItems: "center" },
    primaryText: { color: colors.textOnAccent, fontWeight: "700" },
    secondary: { flex: 1, borderWidth: 1, borderColor: colors.surfaceBorder, borderRadius: 12, padding: 12, alignItems: "center" },
    secondaryText: { color: colors.textPrimary, fontWeight: "600" },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.surfaceBorder },
    icon: { fontSize: 22 },
    title: { flex: 1, fontSize: 15, color: colors.textPrimary },
    tag: { fontSize: 14 },
    status: { fontSize: 18, fontWeight: "700", color: colors.textMuted },
  });
