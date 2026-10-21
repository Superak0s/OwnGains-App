import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Chip, useUi } from "@shared/components/ui";
import { muscleLabel, parseMuscleList } from "@utils/exerciseDb";
import { BROWSE_MUSCLES, muscleDisplayName } from "../utils";
import { MuscleInput } from "./MuscleInput";
import type { makeStyles } from "../WorkoutScreen";

type Styles = ReturnType<typeof makeStyles>;

type MuscleBrowseChipsProps = {
  readonly value: string | null;
  readonly onChange: (muscle: string | null) => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly labelStyle: StyleProp<TextStyle>;
};

export function MuscleBrowseChips({
  value,
  onChange,
  style,
  labelStyle,
}: MuscleBrowseChipsProps): React.JSX.Element {
  const { ui } = useUi();
  return (
    <View style={style}>
      <Text style={labelStyle}>Browse by muscle</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
        contentContainerStyle={ui.chipRow}
        accessibilityRole='radiogroup'
      >
        {BROWSE_MUSCLES.map((muscle) => {
          const selected = value === muscle;
          const label = muscleDisplayName(muscle);
          return (
            <Chip
              key={muscle}
              label={label}
              selected={selected}
              accessibilityRole='radio'
              accessibilityLabel={`${label} exercises`}
              onPress={() => onChange(selected ? null : muscle)}
            />
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
