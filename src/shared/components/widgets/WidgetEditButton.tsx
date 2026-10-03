import React, { useMemo } from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext";
import { tutorialAnchor } from "@features/tutorial/anchors";

export default function WidgetEditButton({
  onPress,
}: {
  readonly onPress: () => void;
}): React.JSX.Element | null {
  const { colors } = useTheme();
  const isFocused = useIsFocused();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <TouchableOpacity
      ref={isFocused ? tutorialAnchor("widgets.edit") : undefined}
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Add or edit widgets"
      accessibilityHint="Opens the widget gallery for this screen"
    >
      <Text style={styles.label}>🧩 Add or edit widgets</Text>
    </TouchableOpacity>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    button: {
      marginTop: 12,
      marginBottom: 24,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    label: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.accent,
    },
  });
