import React, { useState } from "react"
import { StyleSheet, Text, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useSkinPreview } from "@shared/context/SkinPreviewContext"
import { useAuth } from "@shared/context/AuthContext"
import { Button, space, radius, useUi } from "@shared/components/ui"
import { showToast } from "@shared/components/toast"
import { captureUnreported, trackFeature } from "@shared/services/crashReporting"

// Clears the floating tab bar so headers and tabs stay usable while the preview is explored.
const TAB_BAR_CLEARANCE = 73 + space.md

/** Floats over every screen while a skin is previewed, with the only ways out: apply or discard. */
export default function SkinPreviewBanner(): React.ReactElement | null {
  const { active, name, skippedWidgets, apply, discard } = useSkinPreview()
  const { user } = useAuth()
  const { colors } = useUi()
  const insets = useSafeAreaInsets()
  const [applying, setApplying] = useState(false)

  if (!active) return null

  const onApply = async () => {
    setApplying(true)
    try {
      await apply(user?.id != null ? String(user.id) : null)
      trackFeature("skins", "apply")
      showToast(`${name} applied`)
    } catch (e) {
      captureUnreported(e, { feature: "skins", stage: "apply" })
      showToast(`Couldn't apply ${name}, try again`)
    } finally {
      setApplying(false)
    }
  }

  return (
    <View
      style={[styles.root, { bottom: insets.bottom + TAB_BAR_CLEARANCE, backgroundColor: colors.surfaceElevated, borderColor: colors.accent }]}
      accessibilityLiveRegion='polite'
    >
      <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
        Previewing {name}
      </Text>
      {skippedWidgets && (
        <Text style={[styles.note, { color: colors.textSecondary }]}>Some widgets need a newer app version</Text>
      )}
      <View style={styles.actions}>
        <Button label='Discard' variant='quiet' size='sm' onPress={discard} />
        <Button label={applying ? "Applying…" : "Apply"} size='sm' disabled={applying} onPress={onApply} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: space.xs,
    elevation: 8,
  },
  title: { fontSize: 15, fontWeight: "700" },
  note: { fontSize: 13 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.xs },
})
