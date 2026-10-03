import React, { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import type { makeStyles } from "../WorkoutScreen";

const PAGE_SIZE = 3;

export type SuggestionItem = {
  readonly name: string;
  readonly meta?: string;
};

type SuggestionListProps = {
  readonly title: string;
  readonly items: readonly SuggestionItem[];
  readonly onPick: (name: string) => void;
  readonly styles: ReturnType<typeof makeStyles>;
};

/** Remount (via `key`) to reset back to the first page when the query changes. */
export function SuggestionList({
  title,
  items,
  onPick,
  styles,
}: SuggestionListProps): React.JSX.Element | null {
  const [visible, setVisible] = useState(PAGE_SIZE);
  if (items.length === 0) return null;
  const remaining = items.length - visible;

  return (
    <View style={styles.suggestionsContainer}>
      <Text style={styles.suggestionsTitle}>{title}</Text>
      {items.slice(0, visible).map((s) => (
        <TouchableOpacity
          key={s.name}
          style={styles.suggestionButton}
          accessibilityRole='button'
          accessibilityLabel={`Use ${s.name}`}
          onPress={() => onPick(s.name)}
        >
          <Text style={styles.suggestionText}>{s.name}</Text>
          {s.meta ? (
            <Text style={styles.suggestionMeta} numberOfLines={1}>
              {s.meta}
            </Text>
          ) : null}
        </TouchableOpacity>
      ))}
      {remaining > 0 && (
        <TouchableOpacity
          style={styles.loadMoreButton}
          accessibilityRole='button'
          accessibilityLabel={`Show ${Math.min(PAGE_SIZE, remaining)} more suggestions`}
          onPress={() => setVisible((v) => v + PAGE_SIZE)}
        >
          <Text style={styles.loadMoreText}>Load more ({remaining})</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
