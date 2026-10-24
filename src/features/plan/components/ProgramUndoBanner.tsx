import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import type { UseAlertReturn } from "@shared/components/CustomAlert";
import { onProgramEvent } from "@shared/services/trainerEvents";
import { userFacingError } from "@shared/services/apiError";
import type { ProgramApi } from "../services/programApiFactory";
import type { ProgramSnapshot, SavedProgram } from "../types";

const DAY_MS = 86_400_000;

/**
 * Offers the trainee an undo of their trainer's latest change to the plan,
 * for as long as the server keeps the snapshot (7 days).
 */
export function ProgramUndoBanner({
  programApi,
  alert,
  onRestored,
}: {
  readonly programApi: ProgramApi;
  readonly alert: UseAlertReturn["alert"];
  readonly onRestored: (program: SavedProgram) => Promise<unknown>;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [snapshot, setSnapshot] = useState<ProgramSnapshot | null>(null);

  const refresh = useCallback(() => {
    void programApi.listSnapshots().then((list) => setSnapshot(list[0] ?? null));
  }, [programApi]);

  useFocusEffect(refresh);
  useEffect(
    () =>
      onProgramEvent.subscribe((e) => {
        if (e.type === "program_replaced") refresh();
      }),
    [refresh],
  );

  if (!snapshot) return null;
  const who = snapshot.trainer?.displayName || snapshot.trainer?.username || "Your trainer";
  const when = new Date(snapshot.createdAt).toLocaleDateString();
  const daysLeft = Math.max(1, Math.ceil((Date.parse(snapshot.expiresAt) - Date.now()) / DAY_MS));

  const undo = () =>
    alert(
      "Undo this change?",
      `Your plan goes back to how it was before ${who} changed it on ${when}. Edits you made since then are lost.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            programApi
              .restoreSnapshot(snapshot.id)
              .then(async (program) => {
                if (program) await onRestored(program);
                refresh();
              })
              .catch((err) =>
                alert("Couldn't undo", userFacingError(err, "Try again in a moment."), [{ text: "OK" }], "error"),
              );
          },
        },
      ],
      "warning",
    );

  const keep = () => {
    setSnapshot(null);
    programApi.dismissSnapshot(snapshot.id).then(refresh, refresh);
  };

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        {`${who} changed your plan on ${when}. You can undo this for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}.`}
      </Text>
      <View style={styles.actions}>
        <TouchableOpacity accessibilityRole="button" onPress={keep} hitSlop={8}>
          <Text style={styles.keep}>Keep</Text>
        </TouchableOpacity>
        <TouchableOpacity accessibilityRole="button" onPress={undo} hitSlop={8}>
          <Text style={styles.undo}>Undo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    banner: {
      gap: 10,
      backgroundColor: colors.warningLight,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 12,
      borderLeftWidth: 3,
      borderLeftColor: colors.warning,
    },
    text: { fontSize: 14, fontWeight: "600", color: colors.textPrimary },
    actions: { flexDirection: "row", justifyContent: "flex-end", gap: 20 },
    keep: { fontSize: 14, fontWeight: "600", color: colors.textMuted },
    undo: { fontSize: 14, fontWeight: "700", color: colors.warning },
  });
