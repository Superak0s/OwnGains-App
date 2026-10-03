import React, { useMemo } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { useTheme, type ThemeColors } from "@shared/context/ThemeContext"

export function WidgetPullHint({
  armed,
}: {
  readonly armed: boolean
}): React.JSX.Element {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  return (
    <View pointerEvents='none' style={styles.pullHint}>
      <Text style={styles.pullHintText}>
        {armed
          ? "Release to add a widget ✨"
          : "Pull to add a widget ↓"}
      </Text>
    </View>
  )
}

export function WidgetEditHeader({
  editMode,
  onDone,
}: {
  readonly editMode: boolean
  readonly onDone: () => void
}): React.JSX.Element | null {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])

  if (!editMode) return null

  return (
    <View style={styles.header}>
      <Text style={styles.title}>Editing Widgets</Text>
      <TouchableOpacity
        onPress={onDone}
        hitSlop={8}
        accessibilityRole='button'
        accessibilityLabel='Done editing widgets'
      >
        <Text style={styles.done}>Done</Text>
      </TouchableOpacity>
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    pullHint: {
      position: "absolute",
      top: 8,
      left: 0,
      right: 0,
      alignItems: "center",
      zIndex: 40,
    },
    pullHintText: {
      backgroundColor: colors.accent,
      color: colors.textOnAccent,
      fontSize: 13,
      fontWeight: "600",
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderRadius: 14,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    title: { fontSize: 14, fontWeight: "700", color: colors.textSecondary },
    done: { fontSize: 14, fontWeight: "700", color: colors.accent },
  })
