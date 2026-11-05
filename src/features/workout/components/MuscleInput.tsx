import React, { useMemo } from "react";
import { View, TouchableOpacity } from "react-native";
import { Text, TextInput } from "@shared/components/Text";
import { useTheme } from "@shared/context/ThemeContext";
import { replaceLastMuscle, suggestMuscles } from "@utils/exerciseMatching";
import type { makeStyles } from "../WorkoutScreen";

type MuscleInputProps = {
  readonly label: string;
  readonly placeholder: string;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly allMuscleGroups: string[];
  readonly showSuggestions: boolean;
  readonly styles: ReturnType<typeof makeStyles>;
};

export function MuscleInput({
  label,
  placeholder,
  value,
  onChange,
  allMuscleGroups,
  showSuggestions,
  styles,
}: MuscleInputProps): React.JSX.Element {
  const { colors } = useTheme();
  const suggestions = useMemo(
    () => (showSuggestions ? suggestMuscles(value, allMuscleGroups) : []),
    [value, allMuscleGroups, showSuggestions],
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
          accessibilityLabel={label}
        />
      </View>
      {suggestions.length > 0 && (
        <View style={styles.suggestionsContainer}>
          <Text style={styles.suggestionsTitle}>💡 Did you mean:</Text>
          {suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.name ?? i}
              style={styles.suggestionButton}
              accessibilityRole="button"
              accessibilityLabel={`Use ${s.name}`}
              onPress={() => onChange(replaceLastMuscle(value, s.name))}
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
