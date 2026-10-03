import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { SuggestionsBox } from "@shared/components/SuggestionsBox";
import { useTheme } from "@shared/context/ThemeContext";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { toSuggestions } from "@utils/exerciseDb";
import type { UnresolvedExercise } from "../utils/matchProgram";

interface MatchReviewModalProps {
  readonly visible: boolean;
  readonly unresolved: readonly UnresolvedExercise[];
  readonly onResolve: (
    target: UnresolvedExercise,
    exerciseId: string | null,
  ) => void;
  readonly onClose: () => void;
  /** A resolution rewrites every occurrence of the name, so it needs a way back. */
  readonly canUndo?: boolean;
  readonly onUndo?: () => void;
}

export default function MatchReviewModal({
  visible,
  unresolved,
  onResolve,
  onClose,
  canUndo = false,
  onUndo,
}: MatchReviewModalProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [reviewTotal, setReviewTotal] = useState(0);

  useEffect(() => {
    setReviewTotal((prev) => (visible ? Math.max(prev, unresolved.length) : 0));
  }, [visible, unresolved.length]);

  // Resolving drops the entry from the list, so the queue head is always the
  // exercise being reviewed. Rendering the whole list instead cost ~500ms a
  // frame on a program with dozens of unmatched names.
  const entry = unresolved[0];
  if (!visible || !entry) return null;

  const items =
    query.trim().length > 1
      ? toSuggestions(query, 5)
        : entry.candidates.map((c) => ({
          id: c.exercise.id,
          label: c.exercise.name,
          meta: [
            c.exercise.primaryMuscles.join(", "),
            c.exercise.secondaryMuscles?.length
              ? `+ ${c.exercise.secondaryMuscles.join(", ")}`
              : "",
          ]
            .filter(Boolean)
            .join(" "),
        }));

  const resolve = (exerciseId: string | null) => {
    setQuery("");
    onResolve(entry, exerciseId);
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title='Review exercises'
      subtitle={`${reviewTotal - unresolved.length + 1} of ${reviewTotal}: pick the right one, or keep yours.`}
      scrollable={true}
      showConfirmButton={false}
      cancelText='Done'
    >
      <View style={styles.row}>
        <Text style={styles.name}>{entry.name}</Text>
        <Text style={styles.location}>
          {[`Day ${entry.dayNumber}`, entry.split].filter(Boolean).join(" · ")}
        </Text>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          placeholder='Search the exercise database'
          placeholderTextColor={colors.textMuted}
        />
        {items.length > 0 && (
          <SuggestionsBox
            items={items}
            onSelect={(label) =>
              resolve(items.find((i) => i.label === label)?.id ?? null)
            }
          />
        )}
        <TouchableOpacity
          style={styles.keepButton}
          onPress={() => resolve(null)}
          accessibilityRole="button"
          accessibilityLabel={`Keep "${entry.name}" as a custom exercise`}
        >
          <Text style={styles.keepButtonText}>Keep as custom</Text>
        </TouchableOpacity>
        {canUndo && onUndo && (
          <TouchableOpacity
            style={styles.undoButton}
            onPress={onUndo}
            accessibilityRole="button"
            accessibilityLabel="Undo the last answer"
          >
            <Text style={styles.undoButtonText}>↩ Undo last</Text>
          </TouchableOpacity>
        )}
      </View>
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: { marginBottom: 8 },
    name: { fontSize: 16, fontWeight: "600", color: colors.textPrimary },
    location: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    input: {
      borderWidth: 1,
      borderColor: colors.separator,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      color: colors.textPrimary,
      backgroundColor: colors.surface,
    },
    keepButton: {
      marginTop: 14,
      borderWidth: 1.5,
      borderColor: colors.accent,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 18,
      alignItems: "center",
    },
    keepButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.accent,
    },
    undoButton: {
      marginTop: 10,
      paddingVertical: 10,
      alignItems: "center",
    },
    undoButtonText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
  });
