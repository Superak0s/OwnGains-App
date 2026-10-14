import React, { useMemo } from "react"
import { View, Text, TouchableOpacity, StyleSheet } from "react-native"
import { useTheme } from "@shared/context/ThemeContext"
import { useAlert } from "@shared/components/CustomAlert"
import { WidgetSizeContext } from "./widgetSize"
import { moveWidget, type MoveDirection } from "./moveWidget"
import type { ThemeColors } from "@shared/context/ThemeContext"
import type {
  WidgetDefinition,
  WidgetInstance,
  WidgetSize,
} from "@shared/types"

interface WidgetsPanelProps<T extends string> {
  readonly widgets: WidgetInstance<T>[]
  readonly editMode: boolean
  readonly onCycleSize: (id: string) => void
  readonly onRemove: (id: string) => void
  readonly onReorder: (orderedIds: string[]) => void
  readonly renderContent: (instance: WidgetInstance<T>) => React.ReactNode
  /** Per-screen widget-kind registry (icon, title, sizes, ...). */
  readonly registry: Record<T, WidgetDefinition<T>>
  readonly getCardBackgroundColor?: (
    instance: WidgetInstance<T>,
  ) => string | undefined
  readonly getHeaderTextColor?: (
    instance: WidgetInstance<T>,
  ) => string | undefined
  /** Raw style merged in last, so a screen can fuse several widgets into
   *  one continuous card without changing the shared default look. */
  readonly getCardStyleOverride?: (
    instance: WidgetInstance<T>,
  ) => object | undefined
  /** Paint the container behind the cards. Percentage-width siblings don't
   *  always sum to the container's pixel width once Yoga rounds each one,
   *  so a matching container color hides the 1px gap that rounding leaves. */
  readonly containerBackgroundColor?: string
  /** Must match the fused widgets' own outer radius, or the container's
   *  square corners show through behind them. */
  readonly containerBorderRadius?: number
  /** Full-width content rendered inside the container after the widgets. */
  readonly footer?: React.ReactNode
}

const WIDTH_BY_SIZE: Record<WidgetSize, "48%" | "100%"> = {
  small: "48%",
  medium: "100%",
  large: "100%",
}

// medium and large share a width (both full-row), so size only reads as a
// visible change if it also grows the card's height.
const MIN_HEIGHT_BY_SIZE: Record<WidgetSize, number> = {
  small: 70,
  medium: 70,
  large: 160,
}

const SIZE_LABEL: Record<WidgetSize, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
}

const ARROW: Record<MoveDirection, string> = {
  left: "◀",
  up: "▲",
  down: "▼",
  right: "▶",
}

const SMALL_MOVE_ROWS: MoveDirection[][] = [
  ["left", "right"],
  ["up", "down"],
]
const FULL_MOVE_ROWS: MoveDirection[][] = [["up", "down"]]

export default function WidgetsPanel<T extends string>({
  widgets,
  editMode,
  onCycleSize,
  onRemove,
  onReorder,
  renderContent,
  registry,
  getCardBackgroundColor,
  getHeaderTextColor,
  getCardStyleOverride,
  containerBackgroundColor,
  containerBorderRadius,
  footer,
}: WidgetsPanelProps<T>): React.JSX.Element | null {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { alert, AlertComponent } = useAlert()

  if (widgets.length === 0) return null

  const confirmRemove = (instance: WidgetInstance<T>) => {
    alert(
      `Remove ${registry[instance.type]?.title ?? "this widget"}?`,
      "You can add it back any time from the widget gallery.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => onRemove(instance.id),
        },
      ],
      "warning",
    )
  }

  return (
    <View
      style={[
        styles.container,
        containerBackgroundColor
          ? { backgroundColor: containerBackgroundColor }
          : null,
        containerBorderRadius == null
          ? null
          : { borderRadius: containerBorderRadius, overflow: "hidden" },
      ]}
    >
      {widgets.map((instance) => {
        const def = registry[instance.type]
        if (!def) return null
        const bgOverride = getCardBackgroundColor?.(instance)
        const headerTextColor = getHeaderTextColor?.(instance)
        const headerTextStyle = headerTextColor
          ? { color: headerTextColor }
          : null
        const controlBorderStyle = headerTextColor
          ? { borderColor: headerTextColor }
          : null
        const styleOverride = getCardStyleOverride?.(instance)

        const title = def.title || "widget"
        const moveRows =
          instance.size === "small" ? SMALL_MOVE_ROWS : FULL_MOVE_ROWS
        const sizes = def.availableSizes
        const nextSize =
          sizes[(sizes.indexOf(instance.size) + 1) % sizes.length]

        const inner = (
          <>
            <View style={styles.widgetHeader}>
              {def.icon && (
                <Text
                  style={[styles.widgetIcon, headerTextStyle]}
                >
                  {def.icon}
                </Text>
              )}
              {def.title && (
                <Text
                  style={[styles.widgetTitle, headerTextStyle]}
                  numberOfLines={1}
                  accessibilityRole='header'
                >
                  {def.title}
                </Text>
              )}
            </View>
            {editMode && (
              <View style={styles.editControls}>
                <View style={styles.editRow}>
                  {sizes.length > 1 && (
                    <TouchableOpacity
                      onPress={() => onCycleSize(instance.id)}
                      style={[styles.sizeButton, controlBorderStyle]}
                      accessibilityRole='button'
                      accessibilityLabel={`${title} size, ${SIZE_LABEL[instance.size]}`}
                      accessibilityHint={`Changes it to ${SIZE_LABEL[nextSize]}`}
                    >
                      <Text style={[styles.sizeButtonText, headerTextStyle]}>
                        {SIZE_LABEL[instance.size]}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.headerSpacer} />
                  <TouchableOpacity
                    onPress={() => confirmRemove(instance)}
                    style={[styles.removeButton, controlBorderStyle]}
                    accessibilityRole='button'
                    accessibilityLabel={`Remove ${title}`}
                  >
                    <Text style={[styles.removeButtonText, headerTextStyle]}>
                      ✕
                    </Text>
                  </TouchableOpacity>
                </View>
                {moveRows.map((row) => (
                  <View key={row.join()} style={styles.editRow}>
                    {row.map((dir) => {
                      const next = moveWidget(widgets, instance.id, dir)
                      return (
                        <TouchableOpacity
                          key={dir}
                          onPress={() => next && onReorder(next)}
                          disabled={!next}
                          style={[
                            styles.moveButton,
                            controlBorderStyle,
                            !next && styles.moveButtonDisabled,
                          ]}
                          accessibilityRole='button'
                          accessibilityState={{ disabled: !next }}
                          accessibilityLabel={`Move ${title} ${dir}`}
                        >
                          <Text style={[styles.moveButtonText, headerTextStyle]}>
                            {ARROW[dir]}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                ))}
              </View>
            )}
            <View style={styles.widgetBody}>
              <WidgetSizeContext.Provider value={instance.size}>
                {renderContent(instance)}
              </WidgetSizeContext.Provider>
            </View>
          </>
        )

        return (
          <View
            key={instance.id}
            style={[
              styles.widget,
              {
                width: WIDTH_BY_SIZE[instance.size],
                minHeight: MIN_HEIGHT_BY_SIZE[instance.size],
              },
              editMode && styles.widgetEditing,
              bgOverride ? { backgroundColor: bgOverride } : null,
              styleOverride ?? null,
            ]}
          >
            {inner}
          </View>
        )
      })}
      {footer}
      {AlertComponent}
    </View>
  )
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      marginBottom: 20,
      position: "relative",
    },
    widget: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.surfaceBorder,
      borderStyle: "solid",
      minHeight: 70,
    },
    widgetEditing: {
      borderColor: colors.accent,
      borderStyle: "dashed",
    },
    widgetHeader: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 8,
    },
    widgetIcon: {
      fontSize: 16,
      marginRight: 6,
    },
    widgetTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.textSecondary,
      flexShrink: 1,
    },
    headerSpacer: {
      flex: 1,
    },
    editControls: {
      gap: 8,
      marginBottom: 10,
    },
    editRow: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    moveButton: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    moveButtonDisabled: {
      opacity: 0.25,
    },
    moveButtonText: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.accent,
    },
    sizeButton: {
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.accent,
      justifyContent: "center",
    },
    sizeButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.accent,
    },
    removeButton: {
      width: 44,
      height: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.error,
      alignItems: "center",
      justifyContent: "center",
    },
    removeButtonText: {
      fontSize: 16,
      color: colors.error,
      fontWeight: "700",
    },
    widgetBody: {
      flexGrow: 1,
    },
  })
