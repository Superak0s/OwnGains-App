import React from "react"
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { radius, space, useUi } from "@shared/components/ui"
import type { SkinSummary } from "../services/marketplace"

const stars = (r: SkinSummary["rating"]) => (r.average === null ? "No ratings yet" : `${r.average.toFixed(1)} ★ (${r.count})`)

export const skinContents = (hasTheme: boolean, hasBoards: boolean) =>
  [hasTheme && "Theme", hasBoards && "Widget layouts"].filter(Boolean).join(" and ")

export default function SkinCard({
  skin,
  onPress,
}: {
  readonly skin: SkinSummary
  readonly onPress?: () => void
}): React.ReactElement {
  const { colors } = useUi()
  const body = (
    <>
      {skin.swatch.length > 0 && (
        <View style={styles.swatch}>
          {skin.swatch.map((c, i) => (
            <View key={`${c}-${i}`} style={[styles.chip, { backgroundColor: c }]} />
          ))}
        </View>
      )}
      <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
        {skin.name}
      </Text>
      <Text style={[styles.meta, { color: colors.textSecondary }]}>
        by {skin.author ?? "Deleted user"} · {stars(skin.rating)}
      </Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {skin.downloads} downloads · {skin.uniqueDownloads} unique · {skinContents(skin.hasTheme, skin.hasBoards)}
      </Text>
    </>
  )
  const style = [styles.card, { backgroundColor: colors.surface, borderColor: colors.surfaceBorder }]
  if (!onPress) return <View style={style}>{body}</View>
  return (
    <TouchableOpacity style={style} onPress={onPress} accessibilityRole='button' accessibilityLabel={`Open skin ${skin.name}`}>
      {body}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { padding: space.md, borderRadius: radius.lg, borderWidth: 1, gap: space.xs },
  swatch: { flexDirection: "row", height: 24, borderRadius: radius.sm, overflow: "hidden", marginBottom: space.xs },
  chip: { flex: 1 },
  name: { fontSize: 16, fontWeight: "700" },
  meta: { fontSize: 13 },
})
