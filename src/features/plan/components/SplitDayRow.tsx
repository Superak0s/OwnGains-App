import React, { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import type { ThemeColors } from "@shared/context/ThemeContext";
import { SuggestionsBox } from "@shared/components/SuggestionsBox";
import type { CanonicalExercise } from "@utils/exerciseDb";
import type { Styles } from "../PlanScreen";
import type { SplitDayDraft } from "../types";
import { ExercisePickerModal } from "./ExercisePickerModal";
import { DEFAULT_SETS, normalizeReps } from "../utils/splitDraft";

interface SplitDayRowProps {
  readonly index: number;
  readonly day: SplitDayDraft;
  readonly canRemove: boolean;
  readonly isExpanded: boolean;
  readonly titleSuggestions: readonly string[];
  readonly colors: ThemeColors;
  readonly styles: Styles;
  readonly onToggleExpand: (idx: number) => void;
  readonly onChangeTitle: (idx: number, value: string) => void;
  readonly onAddExercise: (idx: number, exercise: CanonicalExercise) => void;
  readonly onChangeExerciseSets: (
    idx: number,
    exIdx: number,
    value: string,
  ) => void;
  readonly onChangeExerciseReps: (
    idx: number,
    exIdx: number,
    value: string,
  ) => void;
  readonly onRemoveExercise: (idx: number, exIdx: number) => void;
  readonly onRemove: (idx: number) => void;
}

export function SplitDayRow({
  index,
  day,
  canRemove,
  isExpanded,
  titleSuggestions,
  colors,
  styles,
  onToggleExpand,
  onChangeTitle,
  onAddExercise,
  onChangeExerciseSets,
  onChangeExerciseReps,
  onRemoveExercise,
  onRemove,
}: SplitDayRowProps): React.JSX.Element {
  const [isTitleFocused, setIsTitleFocused] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const handleToggleExpand = () => onToggleExpand(index);
  const handleRemove = () => onRemove(index);
  const handleTitleChange = (v: string) => onChangeTitle(index, v);
  // Delayed so a tap on a suggestion lands before the box closes. Cleared on
  // unmount because "Remove day" tears the row down mid-delay.
  const titleBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (titleBlurTimer.current) clearTimeout(titleBlurTimer.current);
    },
    [],
  );
  const handleTitleBlur = () => {
    titleBlurTimer.current = setTimeout(() => setIsTitleFocused(false), 150);
  };
  const handleTitleFocus = () => setIsTitleFocused(true);
  const handlePickExercise = (exercise: CanonicalExercise) =>
    onAddExercise(index, exercise);
  const openPicker = () => setIsPickerOpen(true);
  const closePicker = () => setIsPickerOpen(false);

  const matchingTitles = titleSuggestions.filter(
    (t) =>
      t.toLowerCase().includes(day.dayTitle.trim().toLowerCase()) &&
      t.toLowerCase() !== day.dayTitle.trim().toLowerCase(),
  );

  return (
    <View style={styles.splitDayBlock}>
      <TouchableOpacity
        style={styles.splitDayHeader}
        onPress={handleToggleExpand}
        accessibilityRole='button'
        accessibilityLabel={`${isExpanded ? "Collapse" : "Expand"} ${
          day.dayTitle.trim() || `Day ${index + 1}`
        }, ${day.exercises.length} exercise${
          day.exercises.length === 1 ? "" : "s"
        }`}
        accessibilityState={{ expanded: isExpanded }}
      >
        <Text style={styles.splitDayHeaderTitle} numberOfLines={1}>
          {isExpanded ? "▾" : "▸"}{" "}
          {day.dayTitle.trim() || `Day ${index + 1}`}
        </Text>
        <Text style={styles.splitDayHeaderMeta}>
          {day.exercises.length} exercise
          {day.exercises.length === 1 ? "" : "s"}
        </Text>
      </TouchableOpacity>

      {isExpanded && (
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={styles.editFieldLabel}>Day {index + 1} title</Text>
            {canRemove && (
              <TouchableOpacity
                onPress={handleRemove}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole='button'
                accessibilityLabel={`Remove ${
                  day.dayTitle.trim() || `day ${index + 1}`
                }`}
              >
                <Text style={styles.removeExerciseBtnText}>− Remove day</Text>
              </TouchableOpacity>
            )}
          </View>
          <TextInput
            style={styles.editInput}
            value={day.dayTitle}
            onChangeText={handleTitleChange}
            onFocus={handleTitleFocus}
            onBlur={handleTitleBlur}
            placeholder='e.g. Push Day'
            placeholderTextColor={colors.textMuted}
          />
          {isTitleFocused && matchingTitles.length > 0 && (
            <SuggestionsBox
              items={matchingTitles.slice(0, 5).map((t) => ({ label: t }))}
              onSelect={handleTitleChange}
            />
          )}

          <Text style={styles.editFieldLabel}>
            Exercises (name / sets / reps)
          </Text>
          {day.exercises.length > 0 && (
            <Text style={styles.editFieldHint}>
              Set to 0 to drop an exercise from this split. Reps can be a range
              like 8-12, or left blank.
            </Text>
          )}
          {day.exercises.map((exercise, exIdx) => (
            <View
              key={`${exercise.exerciseId}-${exercise.name}`}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: colors.textPrimary, flex: 1 }}>
                {exercise.name}
              </Text>
              <TextInput
                style={[styles.editSetInput, { width: 48, marginRight: 8 }]}
                value={exercise.sets}
                onChangeText={(v) => onChangeExerciseSets(index, exIdx, v)}
                onBlur={() =>
                  onChangeExerciseSets(
                    index,
                    exIdx,
                    exercise.sets.trim() === ""
                      ? String(DEFAULT_SETS)
                      : exercise.sets,
                  )
                }
                keyboardType='number-pad'
                maxLength={2}
                accessibilityLabel={`Sets for ${exercise.name}`}
              />
              <TextInput
                style={[styles.editSetInput, { width: 64, marginRight: 8 }]}
                value={exercise.reps}
                onChangeText={(v) => onChangeExerciseReps(index, exIdx, v)}
                onBlur={() =>
                  onChangeExerciseReps(index, exIdx, normalizeReps(exercise.reps))
                }
                placeholder='reps'
                placeholderTextColor={colors.textMuted}
                maxLength={7}
                accessibilityLabel={`Reps for ${exercise.name}`}
              />
              <TouchableOpacity
                onPress={() => onRemoveExercise(index, exIdx)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole='button'
                accessibilityLabel={`Remove ${exercise.name}`}
              >
                <Text style={styles.removeExerciseBtnText}>− Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addExerciseBtn} onPress={openPicker}>
            <Text style={styles.addExerciseBtnText}>+ Add exercise</Text>
          </TouchableOpacity>
        </View>
      )}

      {isPickerOpen && (
        <ExercisePickerModal
          visible
          onClose={closePicker}
          onSelect={handlePickExercise}
          existingNames={day.exercises.map((e) => e.name)}
        />
      )}
    </View>
  );
}
