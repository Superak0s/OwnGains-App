import React, { useEffect, useMemo, useState } from "react"
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useTheme } from "@shared/context/ThemeContext"
import type { ThemeColors } from "@shared/context/ThemeContext"
import type { WidgetDefinition } from "@shared/types"

interface WidgetGalleryProps<T extends string> {
  readonly visible: boolean
  readonly onClose: () => void
  readonly availableWidgets: WidgetDefinition<T>[]
  readonly onAddWidget: (type: T) => void
  /** Whether any widgets are currently placed. Hides the edit entry point
   *  when there's nothing to edit yet. */
  readonly hasPlacedWidgets: boolean
  /** Closes this panel and switches the home screen into edit mode, where
   *  placed widgets can be resized, removed, or dragged to reorder. */
  readonly onEditWidgets: () => void
  /** Widget type -> owning screen. Boards that host foreign widgets pass this
   *  to get a source filter above the grid. Without it there's no filter. */
  readonly sources?: Record<string, string>
  /** Widget type -> tab within the screen that defines it, for a secondary filter row
   *  shown once the primary filter narrows to a screen with several tabs. */
  readonly subSources?: Record<string, string>
}

export default function WidgetGallery<T extends string>({
  visible,
  onClose,
  availableWidgets,
  onAddWidget,
  hasPlacedWidgets,
  onEditWidgets,
  sources,
  subSources,
}: WidgetGalleryProps<T>): React.JSX.Element {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const [source, setSource] = useState<string | null>(null)
  const [subSource, setSubSource] = useState<string | null>(null)
  const [query, setQuery] = useState("")

  // Filters and search are per-visit: kept across a close they silently hide
  // most of the gallery the next time it opens.
  useEffect(() => {
    if (!visible) {
      setSource(null)
      setSubSource(null)
      setQuery("")
    }
  }, [visible])

  const sourceLabels = useMemo(
    () =>
      sources
        ? [...new Set(availableWidgets.map((def) => sources[def.type]))].filter(
            Boolean,
          )
        : [],
    [sources, availableWidgets],
  )

  const inSource =
    source && sources
      ? availableWidgets.filter((def) => sources[def.type] === source)
      : availableWidgets

  const subLabels = subSources
    ? [...new Set(inSource.map((def) => subSources[def.type]))].filter(Boolean)
    : []

  const inSub =
    subSource && subSources
      ? inSource.filter((def) => subSources[def.type] === subSource)
      : inSource

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? inSub.filter(
        (def) =>
          def.title?.toLowerCase().includes(needle) ||
          def.description?.toLowerCase().includes(needle),
      )
    : inSub

  const selectSource = (label: string | null) => {
    setSource(label)
    setSubSource(null)
  }

  const renderFilterRow = (
    labels: string[],
    selected: string | null,
    onSelect: (label: string | null) => void,
    chipStyle: StyleProp<ViewStyle>,
    chipActiveStyle: StyleProp<ViewStyle>,
  ) =>
    labels.length > 1 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterRow}
        accessibilityRole='radiogroup'
      >
        {[null, ...labels].map((label) => (
          <TouchableOpacity
            key={label ?? "all"}
            onPress={() => onSelect(label)}
            style={[chipStyle, selected === label && chipActiveStyle]}
            accessibilityRole='radio'
            accessibilityState={{ selected: selected === label }}
          >
            <Text
              style={[
                styles.chipText,
                selected === label && styles.chipTextActive,
              ]}
            >
              {label ?? "All"}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    ) : null

  return (
    <Modal
      visible={visible}
      animationType='slide'
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={onClose}
          accessibilityElementsHidden
          importantForAccessibility='no'
        />
        <View
          style={[styles.sheet, { paddingBottom: 24 + insets.bottom }]}
          accessibilityViewIsModal
        >
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Add a Widget</Text>
              <Text style={styles.subtitle}>
                Pull down with two fingers to open this anytime
              </Text>
            </View>
            <View style={styles.headerActions}>
              {hasPlacedWidgets && (
                <TouchableOpacity
                  onPress={onEditWidgets}
                  hitSlop={8}
                  style={styles.editButton}
                  accessibilityRole='button'
                  accessibilityLabel='Edit placed widgets'
                >
                  <Text style={styles.editButtonText}>Edit Widgets</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Close widget gallery"
                onPress={onClose}
                hitSlop={12}
              >
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder='Search widgets'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Search widgets'
            autoCorrect={false}
          />

          {renderFilterRow(
            sourceLabels,
            source,
            selectSource,
            styles.chip,
            styles.chipActive,
          )}

          {renderFilterRow(
            subLabels,
            subSource,
            setSubSource,
            styles.subChip,
            styles.subChipActive,
          )}

          <ScrollView
            contentContainerStyle={styles.grid}
            showsVerticalScrollIndicator={false}
          >
            {shown.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>{needle ? "🔍" : "🎉"}</Text>
                <Text style={styles.emptyText}>
                  {needle
                    ? `No widgets match "${query.trim()}"`
                    : `All ${subSource ?? source ?? "available"} widgets are already on this board`}
                </Text>
              </View>
            ) : (
              shown.map((def) => (
                <TouchableOpacity
                  key={def.type}
                  style={styles.card}
                  activeOpacity={0.8}
                  onPress={() => onAddWidget(def.type)}
                  accessibilityRole='button'
                  accessibilityLabel={`Add ${def.title} widget`}
                  accessibilityHint={def.description}
                >
                  {!!def.icon && <Text style={styles.cardIcon}>{def.icon}</Text>}
                  <Text style={styles.cardTitle}>{def.title}</Text>
                  <Text style={styles.cardDesc} numberOfLines={2}>
                    {def.description}
                  </Text>
                  <View style={styles.addPill}>
                    <Text style={styles.addPillText}>+ Add</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: colors.overlay,
    },
    overlayTouchable: {
      flex: 1,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: "75%",
      paddingTop: 10,
    },
    grabber: {
      alignSelf: "center",
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.surfaceBorder,
      marginBottom: 12,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingHorizontal: 20,
      marginBottom: 16,
    },
    headerActions: {
      flexDirection: "row",
      alignItems: "center",
    },
    editButton: {
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginRight: 14,
    },
    editButtonText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.accent,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
    },
    subtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
      maxWidth: 260,
    },
    close: {
      fontSize: 22,
      color: colors.textSecondary,
    },
    search: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.inputBackground,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      fontSize: 14,
      color: colors.textPrimary,
    },
    filterBar: {
      flexGrow: 0,
      flexShrink: 0,
      marginBottom: 14,
    },
    filterRow: {
      paddingHorizontal: 16,
      gap: 8,
      alignItems: "center",
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.inputBackground,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textSecondary,
    },
    chipTextActive: {
      color: colors.textOnAccent,
    },
    subChip: {
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.inputBorder,
      backgroundColor: colors.surface,
    },
    subChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    grid: {
      paddingHorizontal: 16,
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    card: {
      width: "48%",
      backgroundColor: colors.inputBackground,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.inputBorder,
    },
    cardIcon: {
      fontSize: 26,
      marginBottom: 8,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.textPrimary,
      marginBottom: 4,
    },
    cardDesc: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
      marginBottom: 10,
    },
    addPill: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 12,
    },
    addPillText: {
      color: colors.textOnAccent,
      fontSize: 12,
      fontWeight: "700",
    },
    emptyState: {
      width: "100%",
      alignItems: "center",
      paddingVertical: 30,
    },
    emptyEmoji: {
      fontSize: 32,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: "center",
    },
  })
