import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { muscleLabel, parseMuscleList } from "@utils/exerciseDb";
import { BROWSE_MUSCLES, muscleDisplayName } from "../utils";
import { MuscleInput } from "./MuscleInput";
import type { makeStyles } from "../WorkoutScreen";

type Styles = ReturnType<typeof makeStyles>;

type MuscleBrowseChipsProps = {
  readonly value: string | null;
  readonly onChange: (muscle: string | null) => void;
  readonly styles: Styles;
};

export function MuscleBrowseChips({
  value,
  onChange,
  styles,
}: MuscleBrowseChipsProps): React.JSX.Element {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>Browse by muscle</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={styles.chipRow}
      >
        {BROWSE_MUSCLES.map((muscle) => {
          const selected = value === muscle;
          const label = muscleDisplayName(muscle);
          return (
            <TouchableOpacity
              key={muscle}
              style={[styles.chip, selected && styles.chipActive]}
              accessibilityRole='radio'
              accessibilityLabel={`${label} exercises`}
              accessibilityState={{ selected }}
              onPress={() => onChange(selected ? null : muscle)}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextActive]}
              >
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

type AdvancedMusclesProps = {
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly primary: string;
  readonly secondary: string;
  readonly onPrimaryChange: (text: string) => void;
  readonly onSecondaryChange: (text: string) => void;
  readonly allMuscleGroups: string[];
  readonly styles: Styles;
};

export function AdvancedMuscles({
  expanded,
  onToggle,
  primary,
  secondary,
  onPrimaryChange,
  onSecondaryChange,
  allMuscleGroups,
  styles,
}: AdvancedMusclesProps): React.JSX.Element {
  return (
    <>
      <TouchableOpacity
        style={styles.advancedToggle}
        accessibilityRole='button'
        accessibilityLabel='Advanced: muscles worked'
        accessibilityState={{ expanded }}
        onPress={onToggle}
      >
        <View style={styles.advancedToggleBody}>
          <Text style={styles.advancedToggleTitle}>Advanced</Text>
          <Text style={styles.advancedToggleSummary} numberOfLines={1}>
            {muscleLabel(parseMuscleList(primary), parseMuscleList(secondary)) ||
              "No muscles set"}
          </Text>
        </View>
        <Text style={styles.advancedToggleChevron}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {expanded && (
        <>
          <MuscleInput
            label='Primary Muscles'
            placeholder='e.g., Chest, Triceps'
            value={primary}
            onChange={onPrimaryChange}
            allMuscleGroups={allMuscleGroups}
            styles={styles}
          />
          <MuscleInput
            label='Secondary Muscles (optional)'
            placeholder='e.g., Shoulders'
            value={secondary}
            onChange={onSecondaryChange}
            allMuscleGroups={allMuscleGroups}
            styles={styles}
          />
        </>
      )}
    </>
  );
}
