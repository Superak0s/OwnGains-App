import React from "react"
import { StyleSheet, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native"
import { Text } from "@shared/components/Text"
import { radius, space, useUi } from "@shared/components/ui"
import type { ThemeColors } from "@shared/context/ThemeContext"
import type { SkinSummary } from "../services/marketplace"

export const ratingText = (r: SkinSummary["rating"]) =>
  r.average === null ? "No ratings yet" : `${r.average.toFixed(1)} ★ (${r.count})`

export function skinContents(hasTheme: boolean, hasBoards: boolean, hasFont = false): string {
  const parts = [hasTheme && "Theme", hasFont && "Font", hasBoards && "Widget layouts"].filter((p) => p !== false)
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : (parts[0] ?? "")
}

/** The same four colors, in the same order, as the marketplace's `swatch`. */
export const swatchOf = (theme: ThemeColors | null) =>
  theme ? [theme.background, theme.surface, theme.accent, theme.textPrimary] : []

/** A miniature screen painted in a skin's swatch (background, surface, accent, text). */
export function SkinPreview({
  swatch,
  style,
}: {
  readonly swatch: readonly string[]
  readonly style?: StyleProp<ViewStyle>
}): React.ReactElement {
  const { colors } = useUi()
  if (swatch.length === 0)
    return (
      <View style={[styles.preview, styles.empty, { backgroundColor: colors.separator }, style]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]} numberOfLines={2} adjustsFontSizeToFit>
          Layouts only
        </Text>
      </View>
    )
  const [background, surface = colors.surface, accent = colors.accent, text = colors.textPrimary] = swatch
  return (
    <View style={[styles.preview, { backgroundColor: background }, style]}>
      <View style={[styles.heading, { backgroundColor: text }]} />
      <View style={[styles.block, { backgroundColor: surface }]}>
        <View style={[styles.dot, { backgroundColor: accent }]} />
        <View style={[styles.textLine, { backgroundColor: text }]} />
      </View>
      <View style={[styles.block, { backgroundColor: surface }]}>
        <View style={[styles.textLine, { backgroundColor: text }]} />
      </View>
      <View style={[styles.pill, { backgroundColor: accent }]} />
    </View>
  )
}

export default function SkinCard({
  skin,
  onPress,
}: {
  readonly skin: SkinSummary
  readonly onPress: () => void
}): React.ReactElement {
  const { colors } = useUi()
  const author = skin.author ?? "Deleted user"
  const rating = skin.rating.average === null ? "No ratings" : `${skin.rating.average.toFixed(1)} ★`
  return (
    <TouchableOpacity
      style={[styles.tile, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}
      onPress={onPress}
      accessibilityRole='button'
      accessibilityLabel={`${skin.name} by ${author}, ${ratingText(skin.rating)}, ${skin.downloads} downloads`}
    >
      <SkinPreview swatch={skin.swatch} style={styles.tilePreview} />
      <View style={styles.tileMeta}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {skin.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
          by {author}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {rating} · {skin.downloads} downloads
        </Text>
      </View>
    </TouchableOpacity>
  )
}

/** A row in My skins. The actions sit outside the touchable, which would hide them from screen readers. */
export function SkinRow({
  skin,
  onPress,
  children,
}: {
  readonly skin: SkinSummary
  readonly onPress?: () => void
  readonly children: React.ReactNode
}): React.ReactElement {
  const { colors } = useUi()
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]}>
      <TouchableOpacity
        style={styles.rowMain}
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole='button'
        accessibilityLabel={`Open skin ${skin.name}`}
      >
        <SkinPreview swatch={skin.swatch} style={styles.thumb} />
        <View style={styles.rowText}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
            {skin.name}
          </Text>
          {skin.takenDown ? (
            <Text style={[styles.meta, { color: colors.error }]}>Removed by the marketplace: {skin.takenDown.reason}</Text>
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
              {ratingText(skin.rating)} · {skin.downloads} downloads
            </Text>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.rowActions}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  preview: { padding: space.sm, gap: 5, overflow: "hidden" },
  empty: { alignItems: "center", justifyContent: "center" },
  emptyText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  heading: { height: 6, width: "55%", borderRadius: 3 },
  block: { flex: 1, borderRadius: 6, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, gap: 5 },
  dot: { width: 9, height: 9, borderRadius: radius.pill },
  textLine: { height: 4, width: "40%", borderRadius: 2, opacity: 0.5 },
  pill: { height: 9, width: "40%", borderRadius: radius.pill },
  tile: { width: "48%", borderRadius: radius.lg, borderWidth: 1, overflow: "hidden" },
  tilePreview: { height: 110 },
  tileMeta: { padding: space.sm, gap: 2 },
  name: { fontSize: 15, fontWeight: "700" },
  meta: { fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.sm, borderRadius: radius.lg, borderWidth: 1 },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md },
  thumb: { width: 52, height: 64, borderRadius: radius.sm, padding: 5, gap: 3 },
  rowText: { flex: 1, gap: 2 },
  rowActions: { gap: space.xs },
})
