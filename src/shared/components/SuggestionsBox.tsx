import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../context/ThemeContext";
import type { ThemeColors } from "../context/ThemeContext";

interface SuggestionItem {
  readonly label: string;
  readonly meta?: string;
}

interface SuggestionsBoxProps {
  readonly items: readonly SuggestionItem[];
  readonly onSelect: (label: string) => void;
  readonly title?: string;
  /** "highlight" is the amber "did you mean" treatment used for typo suggestions. */
  readonly variant?: "default" | "highlight";
}

export function SuggestionsBox({
  items,
  onSelect,
  title,
  variant = "default",
}: SuggestionsBoxProps): React.JSX.Element | null {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, variant), [colors, variant]);
  if (items.length === 0) return null;
  return (
    <View style={styles.box}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {items.map((item) => (
        <TouchableOpacity
          key={item.label}
          style={styles.item}
          onPress={() => onSelect(item.label)}
          accessibilityRole="button"
          accessibilityLabel={
            item.meta ? `${item.label}, ${item.meta}` : item.label
          }
        >
          <Text style={styles.itemText}>{item.label}</Text>
          {item.meta ? <Text style={styles.itemMeta}>{item.meta}</Text> : null}
        </TouchableOpacity>
      ))}
    </View>
  );
}

const makeStyles = (colors: ThemeColors, variant: "default" | "highlight") =>
  StyleSheet.create({
    box:
      variant === "highlight"
        ? {
            backgroundColor: colors.warningLight,
            borderRadius: 12,
            padding: 16,
            marginBottom: 20,
            borderWidth: 1,
            borderColor: colors.warning,
          }
        : {
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.separator,
            borderRadius: 8,
            marginTop: 2,
            overflow: "hidden",
          },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: variant === "highlight" ? colors.warning : colors.textSecondary,
      marginBottom: 12,
    },
    item:
      variant === "highlight"
        ? {
            backgroundColor: colors.surface,
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            borderWidth: 1,
            borderColor: colors.warning,
          }
        : {
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.background,
          },
    itemText:
      variant === "highlight"
        ? { fontSize: 16, fontWeight: "500", color: colors.textPrimary, flex: 1 }
        : { fontSize: 14, color: colors.textPrimary },
    itemMeta: {
      fontSize: 12,
      color: variant === "highlight" ? colors.warning : colors.textSecondary,
      fontWeight: "600",
    },
  });
