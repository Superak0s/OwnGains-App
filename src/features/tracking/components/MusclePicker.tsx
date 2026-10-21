import React, { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Chip, useUi } from "@shared/components/ui";
import makeStyles from "../styles";
import {
  MUSCLE_GROUPS,
  MUSCLE_GROUP_LABELS,
  type MuscleGroup,
} from "../types/muscleRecovery";

interface MusclePickerProps {
  readonly label: string;
  readonly selected: readonly string[];
  readonly onToggle: (muscle: MuscleGroup) => void;
  /** Extra chips shown after the built-in muscle groups. */
  readonly children?: React.ReactNode;
}

/** A searchable multi-select of the built-in muscle groups. */
export function MusclePicker({
  label,
  selected,
  onToggle,
  children,
}: MusclePickerProps): React.JSX.Element {
  const { ui, colors } = useUi();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  return (
    <>
      <Text style={styles.inputLabel}>
        {label}{" "}
        {selected.length > 0 ? (
          <Text style={styles.inputLabelOptional}>
            ({selected.length} selected)
          </Text>
        ) : null}
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Search muscle groups"
        placeholderTextColor={colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />
      <View style={ui.chipRow}>
        {MUSCLE_GROUPS.filter((muscle) =>
          MUSCLE_GROUP_LABELS[muscle].toLowerCase().includes(query),
        ).map((muscle) => (
          <Chip
            key={muscle}
            label={MUSCLE_GROUP_LABELS[muscle]}
            selected={selected.includes(muscle)}
            onPress={() => onToggle(muscle)}
          />
        ))}
        {children}
      </View>
    </>
  );
}
