import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";
import ModalSheet from "@shared/components/ModalSheet";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import {
  filterExercises,
  muscleLabel,
  type CanonicalExercise,
} from "@utils/exerciseDb";
import { MuscleChips } from "./MuscleChips";

const RESULT_LIMIT = 40;

interface ExercisePickerModalProps {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onSelect: (exercise: CanonicalExercise) => void;
  readonly existingNames?: readonly string[];
}

export function ExercisePickerModal({
  visible,
  onClose,
  onSelect,
  existingNames = [],
}: ExercisePickerModalProps): React.JSX.Element {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState("");
  const [included, setIncluded] = useState<string[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);

  const alreadyAdded = useMemo(
    () => new Set(existingNames.map((n) => n.trim().toLowerCase())),
    [existingNames],
  );

  const toggleMuscle = (muscle: string) => {
    if (included.includes(muscle)) {
      setIncluded((prev) => prev.filter((m) => m !== muscle));
      setExcluded((prev) => [...prev, muscle]);
    } else if (excluded.includes(muscle)) {
      setExcluded((prev) => prev.filter((m) => m !== muscle));
    } else {
      setIncluded((prev) => [...prev, muscle]);
    }
  };

  // The database scan runs on every keystroke. Deferring it lets the typed
  // character paint first.
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () =>
      filterExercises({
        query: deferredQuery,
        include: included,
        exclude: excluded,
        // One over the limit, so "there are more" is distinguishable from
        // "there are exactly this many".
        limit: RESULT_LIMIT + 1,
      }),
    [deferredQuery, included, excluded],
  );
  const shown = results.slice(0, RESULT_LIMIT);

  const hasFilters = !!query || included.length > 0 || excluded.length > 0;

  const clearFilters = () => {
    setQuery("");
    setIncluded([]);
    setExcluded([]);
  };

  // Filters are per-visit: carrying them into the next day's picker silently
  // hid most of the database.
  useEffect(() => {
    if (!visible) clearFilters();
  }, [visible]);

  const handleSelect = (exercise: CanonicalExercise) => {
    onSelect(exercise);
    onClose();
  };

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title="Pick an exercise"
      subtitle="Tap a muscle to require it, again to exclude it, once more to clear it"
      showConfirmButton={false}
      cancelText="Close"
      scrollable
      fullHeight
    >
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search exercises"
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Search exercises"
        autoCorrect={false}
      />

      <MuscleChips
        included={included}
        excluded={excluded}
        onToggle={toggleMuscle}
      />

      {results.length === 0 ? (
        <>
          <Text style={styles.empty}>No exercises match those filters.</Text>
          {hasFilters && (
            <TouchableOpacity
              style={styles.clearFilters}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={clearFilters}
            >
              <Text style={styles.clearFiltersText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </>
      ) : (
        shown.map((exercise) => {
          const isDuplicate = alreadyAdded.has(exercise.name.toLowerCase());
          return (
          <TouchableOpacity
            key={exercise.id}
            style={styles.result}
            accessibilityRole='button'
            accessibilityLabel={`${exercise.name}${isDuplicate ? ", already in this day" : ""}`}
            accessibilityState={{ disabled: isDuplicate }}
            disabled={isDuplicate}
            onPress={() => handleSelect(exercise)}
          >
            <Text style={styles.resultName}>{exercise.name}</Text>
            {isDuplicate && (
              <Text style={styles.duplicate}>⚠️ Already in this day</Text>
            )}
            <Text style={styles.resultMeta}>
              {[
                muscleLabel(exercise.primaryMuscles, exercise.secondaryMuscles),
                exercise.equipment,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </TouchableOpacity>
          );
        })
      )}
      {results.length > RESULT_LIMIT && (
        <Text style={styles.empty}>Refine your search to see more.</Text>
      )}
    </ModalSheet>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    search: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      paddingHorizontal: 12,
      paddingVertical: 9,
      fontSize: 15,
      color: colors.textPrimary,
    },
    result: {
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.separator,
    },
    resultName: { fontSize: 15, color: colors.textPrimary },
    resultMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    duplicate: {
      fontSize: 12,
      color: colors.warning,
      fontWeight: "600",
      marginTop: 2,
    },
    empty: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: "center",
      marginTop: 16,
    },
    clearFilters: {
      alignSelf: "center",
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.accent,
    },
    clearFiltersText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.accent,
    },
  });
