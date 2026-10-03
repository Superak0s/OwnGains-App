import React, { useMemo, useState } from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import { useTheme } from "@shared/context/ThemeContext";
import { checkForTypo } from "@utils/exerciseMatching";
import type { makeStyles } from "../WorkoutScreen";

type MuscleInputProps = {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly allMuscleGroups: string[];
  readonly styles: ReturnType<typeof makeStyles>;
};

export function MuscleInput({
  label,
  placeholder,
  value,
  onChange,
  allMuscleGroups,
  styles,
}: MuscleInputProps): React.JSX.Element {
  const { colors } = useTheme();
  // A picked suggestion is the user's answer, so it must not be second-guessed
  // by re-running the typo check against the value it just wrote.
  const [accepted, setAccepted] = useState<string>("");
  const suggestions = useMemo(
    () =>
      value.trim() && value !== accepted
        ? checkForTypo(value, allMuscleGroups).suggestions
        : [],
    [value, accepted, allMuscleGroups],
  );

  return (
    <>
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>💡 Did you mean:</Text>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.name ?? i}
              style={styles.suggestionButton}
              onPress={() => {
                onChange(s.name);
                setAccepted(s.name);
              }}
            >
              <Text style={styles.suggestionText}>{s.name}</Text>
              <Text style={styles.suggestionMatch}>
                {Math.round(s.similarity * 100)}% match
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );
}
