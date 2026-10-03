import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useIsFocused } from "@react-navigation/native"
import {
  ScrollView,
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
} from "react-native"
import { readJSON, writeJSON } from "@shared/services/offlineHelpers"
import { useTheme } from "../context/ThemeContext"
import type { ThemeColors } from "../context/ThemeContext"
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import { runOnJS } from "react-native-worklets"
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler"
import ModalSheet from "./ModalSheet"
import { useAlert } from "./CustomAlert"
import { log } from "@shared/services/crashReporting"
import { tutorialAnchor } from "@features/tutorial/anchors"

interface TabItem {
  key: string
  label: string
}

interface TabConfig {
  key: string
  visible: boolean
}

interface Props {
  readonly tabs: TabItem[]
  readonly activeTab: string
  readonly onTabChange: (tab: string) => void
  /** Optional badge counts keyed by tab key. A value > 0 shows a red dot. */
  readonly badges?: Record<string, number>
  /** SQLite key to persist order + visibility. */
  readonly storageKey: string
}

const ROW_HEIGHT = 68

interface RowProps {
  readonly tab: TabItem
  readonly cfg: TabConfig
  readonly index: number
  readonly total: number
  readonly visibleCount: number
  readonly accentLightColor: string
  readonly surfaceColor: string
  readonly onToggle: (key: string) => void
  readonly onReorder: (from: number, to: number) => void
}

function DraggableRow({
  tab,
  cfg,
  index,
  total,
  visibleCount,
  accentLightColor,
  surfaceColor,
  onToggle,
  onReorder,
}: RowProps) {
  const { colors } = useTheme()
  const styles = rowStyles(colors)

  const translateY = useSharedValue(0)
  const active = useSharedValue(false)
  const svIndex = useSharedValue(index)
  const svTotal = useSharedValue(total)

  // Never write a shared value during render.
  useEffect(() => {
    svIndex.value = index
    svTotal.value = total
  }, [index, total, svIndex, svTotal])

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          "worklet"
          active.value = true
        })
        .onUpdate((e) => {
          "worklet"
          translateY.value = e.translationY
        })
        .onEnd((e) => {
          "worklet"
          const rawTarget =
            svIndex.value + Math.round(e.translationY / ROW_HEIGHT)
          const target = Math.max(0, Math.min(rawTarget, svTotal.value - 1))
          translateY.value = withSpring(0, { damping: 20, stiffness: 200 })
          active.value = false
          if (target !== svIndex.value) {
            runOnJS(onReorder)(svIndex.value, target)
          }
        })
        .onFinalize(() => {
          "worklet"
          translateY.value = withTiming(0, { duration: 150 })
          active.value = false
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the shared values are stable refs, and rebuilding the gesture on them would reset a drag in progress
    [onReorder],
  )

  const animStyle = useAnimatedStyle(() => {
    "worklet"
    return {
      transform: [{ translateY: translateY.value }],
      zIndex: active.value ? 100 : 1,
      shadowOpacity: withTiming(active.value ? 0.22 : 0, { duration: 150 }),
      shadowRadius: withTiming(active.value ? 10 : 0, { duration: 150 }),
      elevation: active.value ? 8 : 1,
      backgroundColor: active.value ? accentLightColor : surfaceColor,
    }
  })

  const canHide = cfg.visible ? visibleCount > 1 : true

  return (
    <Animated.View style={[styles.row, animStyle]}>
      <GestureDetector gesture={pan}>
        <View style={styles.handle} accessibilityElementsHidden>
          <Text style={styles.handleIcon}>☰</Text>
        </View>
      </GestureDetector>

      {/* Dragging is the fast path. These are the only way to reorder with a
          screen reader or one unsteady touch. */}
      <View style={styles.arrows}>
        <TouchableOpacity
          onPress={() => onReorder(index, index - 1)}
          disabled={index === 0}
          hitSlop={{ left: 8, right: 8 }}
          accessibilityRole='button'
          accessibilityLabel={`Move ${tab.label} up`}
          accessibilityState={{ disabled: index === 0 }}
        >
          <Text
            style={[styles.arrow, index === 0 && styles.arrowDisabled]}
          >
            ▲
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onReorder(index, index + 1)}
          disabled={index === total - 1}
          hitSlop={{ left: 8, right: 8 }}
          accessibilityRole='button'
          accessibilityLabel={`Move ${tab.label} down`}
          accessibilityState={{ disabled: index === total - 1 }}
        >
          <Text
            style={[
              styles.arrow,
              index === total - 1 && styles.arrowDisabled,
            ]}
          >
            ▼
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.preview, !cfg.visible && styles.previewHidden]}>
        <Text
          style={[
            styles.previewLabel,
            !cfg.visible && styles.previewLabelHidden,
          ]}
        >
          {tab.label}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => onToggle(cfg.key)}
        disabled={!canHide}
        style={[
          styles.pill,
          cfg.visible ? styles.pillOn : styles.pillOff,
          !canHide && styles.pillDisabled,
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole='switch'
        accessibilityLabel={`${tab.label} tab visible`}
        accessibilityState={{ checked: cfg.visible, disabled: !canHide }}
        accessibilityHint={
          canHide ? undefined : "At least one tab must remain visible"
        }
      >
        <Text
          style={[
            styles.pillText,
            cfg.visible ? styles.pillTextOn : styles.pillTextOff,
          ]}
        >
          {cfg.visible ? "Visible" : "Hidden"}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  )
}

export default function ScrollTabBar({
  tabs,
  activeTab,
  onTabChange,
  badges = {},
  storageKey,
}: Props) {
  const { colors } = useTheme()
  const isFocused = useIsFocused()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { alert, AlertComponent } = useAlert()

  const [config, setConfig] = useState<TabConfig[]>(
    tabs.map((t) => ({ key: t.key, visible: true })),
  )
  const [showEditor, setShowEditor] = useState(false)

  useEffect(() => {
    ;(async () => {
      const saved = await readJSON<TabConfig[] | null>(storageKey, null)
      if (!saved) return
      const knownKeys = new Set(saved.map((c) => c.key))
      const tabKeys = new Set(tabs.map((t) => t.key))
      setConfig([
        ...saved.filter((c) => tabKeys.has(c.key)),
        ...tabs
          .filter((t) => !knownKeys.has(t.key))
          .map((t) => ({ key: t.key, visible: true })),
      ])
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-running on a new tabs array would discard the saved config
  }, [storageKey])

  const persist = useCallback(
    (next: TabConfig[]) => {
      writeJSON(storageKey, next).catch((e) => {
        log.warn("ScrollTabBar: failed to persist tab config", e)
      })
    },
    [storageKey],
  )

  // Mirrors state so reorder/toggle can compute the next config without
  // putting the persist write and the onTabChange call (both side effects)
  // inside a setState updater, where React may run them twice or mid-render.
  const configRef = useRef(config)
  configRef.current = config

  const handleReorder = useCallback(
    (from: number, to: number) => {
      const next = [...configRef.current]
      const [item] = next.splice(from, 1)
      if (!item) return
      next.splice(to, 0, item)
      setConfig(next)
      persist(next)
    },
    [persist],
  )

  const toggleVisible = useCallback(
    (key: string) => {
      const next = configRef.current.map((c) =>
        c.key === key ? { ...c, visible: !c.visible } : c,
      )
      const firstVisible = next.find((c) => c.visible)
      if (!firstVisible) return
      setConfig(next)
      persist(next)
      if (key === activeTab) onTabChange(firstVisible.key)
    },
    [activeTab, onTabChange, persist],
  )

  const reset = useCallback(() => {
    alert(
      "Reset tabs?",
      "This restores the original tab order and makes every tab visible.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            const next = tabs.map((t) => ({ key: t.key, visible: true }))
            setConfig(next)
            persist(next)
          },
        },
      ],
      "warning",
    )
  }, [tabs, persist, alert])

  const tabMap = new Map(tabs.map((t) => [t.key, t]))
  const visibleConfig = config.filter((c) => c.visible)
  const visibleTabs = visibleConfig
    .map((c) => tabMap.get(c.key))
    .filter(Boolean) as TabItem[]

  return (
    <>
      <ScrollView
        ref={isFocused ? tutorialAnchor("scrollTabs") : undefined}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        accessibilityRole="tablist"
      >
        {visibleTabs.map((tab) => {
          const badgeCount = badges[tab.key] ?? 0
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityLabel={
                badgeCount > 0 ? `${tab.label}, ${badgeCount} new` : tab.label
              }
              accessibilityState={{ selected: isActive }}
              onPress={() => onTabChange(tab.key)}
            >
              <Text
                style={[styles.tabLabel, isActive && styles.tabLabelActive]}
              >
                {tab.label}
              </Text>
              {badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badgeCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          )
        })}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Edit tabs"
          style={styles.editBtn}
          onPress={() => setShowEditor(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.editBtnText}>⋯</Text>
        </TouchableOpacity>
      </ScrollView>
      <ModalSheet
        visible={showEditor}
        onClose={() => setShowEditor(false)}
        title='Customize Tabs'
        subtitle='Drag ☰ to reorder · tap to toggle visibility'
        showCancelButton={false}
        showConfirmButton={false}
        fullHeight
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <ScrollView
            style={styles.editorList}
            contentContainerStyle={styles.editorListContent}
          >
            {config.map((c, index) => {
              const tab = tabMap.get(c.key)
              if (!tab) return null
              return (
                <DraggableRow
                  key={c.key}
                  tab={tab}
                  cfg={c}
                  index={index}
                  total={config.length}
                  visibleCount={visibleConfig.length}
                  accentLightColor={colors.accentLight}
                  surfaceColor={colors.surface}
                  onToggle={toggleVisible}
                  onReorder={handleReorder}
                />
              )
            })}
          </ScrollView>

          <TouchableOpacity
            style={styles.resetBtn}
            onPress={reset}
            accessibilityRole='button'
            accessibilityLabel='Reset tabs to default'
          >
            <Text style={styles.resetBtnText}>Reset to Default</Text>
          </TouchableOpacity>
          {AlertComponent}
        </GestureHandlerRootView>
      </ModalSheet>
    </>
  )
}

const rowStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 14,
      marginBottom: 10,
      gap: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
    },
    handle: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 8,
      backgroundColor: colors.inputBackground,
    },
    handleIcon: { fontSize: 16, color: colors.textSecondary },
    arrows: { justifyContent: "center" },
    arrow: {
      fontSize: 13,
      color: colors.textSecondary,
      paddingVertical: 5,
      paddingHorizontal: 6,
    },
    arrowDisabled: { opacity: 0.25 },
    preview: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
    previewHidden: { opacity: 0.35 },
    previewLabel: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.textPrimary,
    },
    previewLabelHidden: { color: colors.textMuted },
    pill: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1.5,
    },
    pillOn: { backgroundColor: colors.accentLight, borderColor: colors.accent },
    pillOff: {
      backgroundColor: colors.inputBackground,
      borderColor: colors.surfaceBorder,
    },
    pillDisabled: { opacity: 0.4 },
    pillText: { fontSize: 12, fontWeight: "700" },
    pillTextOn: { color: colors.accent },
    pillTextOff: { color: colors.textMuted },
  })

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    scroll: { height: 52, flexGrow: 0, marginBottom: 20 },
    scrollContent: { paddingRight: 4, alignItems: "center" },
    tab: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
      marginRight: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      position: "relative",
    },
    tabActive: { backgroundColor: colors.accent },
    tabLabel: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
    tabLabelActive: { color: colors.textOnAccent },
    badge: {
      position: "absolute",
      top: -4,
      right: -4,
      backgroundColor: colors.error,
      borderRadius: 10,
      minWidth: 20,
      height: 20,
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: 5,
    },
    badgeText: {
      color: colors.textOnAccent,
      fontSize: 11,
      fontWeight: "bold",
    },
    editBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 4,
    },
    editBtnText: { fontSize: 20, color: colors.textMuted, lineHeight: 22 },
    editorList: { flex: 1 },
    editorListContent: { paddingBottom: 12 },
    resetBtn: {
      marginTop: 4,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.surfaceBorder,
      alignItems: "center",
    },
    resetBtnText: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.textSecondary,
    },
  })
