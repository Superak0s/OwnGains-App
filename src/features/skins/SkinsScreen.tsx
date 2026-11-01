import React, { useCallback, useEffect, useState } from "react"
import { FlatList, StyleSheet, TouchableOpacity, View } from "react-native"
import { Text, TextInput } from "@shared/components/Text"
import { SafeAreaView } from "react-native-safe-area-context"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import * as DocumentPicker from "expo-document-picker"
import { File as ExpoFile } from "expo-file-system"
import { useAlert } from "@shared/components/CustomAlert"
import { Button, IconButton, Placeholder, Row, radius, space, useUi } from "@shared/components/ui"
import { useAuth } from "@shared/context/AuthContext"
import { useTheme } from "@shared/context/ThemeContext"
import { userFacingError } from "@shared/services/apiError"
import { captureUnreported, trackFeature } from "@shared/services/crashReporting"
import type { RootStackParamList } from "@shared/types"
import { DESTINATION_TEXT, writeJsonExport } from "@utils/writeJsonExport"
import { storedBoards } from "./boards"
import { buildSkin, parseSkin, type ParsedSkin } from "./skinFormat"
import {
  DEFAULT_MARKETPLACE_URL,
  getMarketplaceUrl,
  deleteSkin,
  listSkins,
  setMarketplaceUrl,
  type SkinSort,
  type SkinSummary,
} from "./services/marketplace"
import ModalSheet from "@shared/components/ModalSheet"
import ImportSkinSheet from "./components/ImportSkinSheet"
import SkinCard, { SkinPreview, SkinRow, swatchOf } from "./components/SkinCard"
import PublishSkinSheet from "./components/PublishSkinSheet"
import { useMarketplaceAccount } from "./hooks/useMarketplaceAccount"

type Props = NativeStackScreenProps<RootStackParamList, "Skins">

const SORTS: { id: SkinSort; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "rating", label: "Top rated" },
  { id: "new", label: "New" },
]

const TABS = [
  { label: "Browse", mine: false },
  { label: "My skins", mine: true },
] as const

type Menu = "add" | "more" | "sort"

interface MenuItem {
  title: string
  meta?: string
  onPress: () => void
}

interface SheetState {
  initialRef?: string
  marketplace?: string | null
  fileSkin?: ParsedSkin | null
}

export default function SkinsScreen({ navigation, route }: Props): React.ReactElement {
  const { colors } = useUi()
  const { savedTheme, typography } = useTheme()
  const { user } = useAuth()
  const userId = user?.id == null ? null : String(user.id)
  const { alert, AlertComponent } = useAlert()
  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<SkinSort>("popular")
  const [skins, setSkins] = useState<SkinSummary[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const { canSignIn } = useMarketplaceAccount()
  const [mine, setMine] = useState(false)
  const [publishing, setPublishing] = useState<{ existing?: SkinSummary } | null>(null)
  const [marketplace, setMarketplace] = useState<string | null>(null)
  const [draftUrl, setDraftUrl] = useState<string | null>(null)
  const [urlError, setUrlError] = useState<string | null>(null)
  const [menu, setMenu] = useState<Menu | null>(null)

  useEffect(() => {
    void getMarketplaceUrl().then(setMarketplace)
  }, [])

  const saveUrl = async (url: string | null) => {
    try {
      await setMarketplaceUrl(url)
      setMarketplace(await getMarketplaceUrl())
      setDraftUrl(null)
    } catch (e) {
      setUrlError(userFacingError(e, "That address isn't valid."))
    }
  }

  const fetchPage = useCallback(
    async (next: number) => {
      setLoading(true)
      setError(null)
      try {
        const res = await listSkins({ q: query.trim() || undefined, sort, page: next, mine })
        setSkins((prev) => (next === 1 ? res.skins : [...prev, ...res.skins]))
        setPage(next)
        setHasMore(res.hasMore)
      } catch (e) {
        setError(userFacingError(e, "Couldn't reach the skin marketplace."))
      } finally {
        setLoading(false)
      }
    },
    [query, sort, mine],
  )

  useEffect(() => {
    if (marketplace === null) return
    const t = setTimeout(() => void fetchPage(1), 300)
    return () => clearTimeout(t)
  }, [fetchPage, marketplace])

  useEffect(() => {
    if (!route.params?.importRef) return
    setSheet({ initialRef: route.params.importRef, marketplace: route.params.marketplace ?? null })
    navigation.setParams({ importRef: undefined, marketplace: undefined })
  }, [route.params, navigation])

  const remove = (skin: SkinSummary) =>
    alert(
      `Delete ${skin.name}?`,
      "It disappears from the marketplace. Anyone who already applied it keeps their copy.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            void deleteSkin(skin.id).then(
              () => setSkins((prev) => prev.filter((s) => s.id !== skin.id)),
              (e: unknown) => alert("Delete failed", userFacingError(e, "Couldn't delete the skin."), [{ text: "OK" }], "error"),
            ),
        },
      ],
      "warning",
    )

  const importFile = async () => {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "*/*"], copyToCacheDirectory: true })
      const uri = picked.canceled ? null : picked.assets?.[0]?.uri
      if (!uri) return
      setSheet({ fileSkin: parseSkin(JSON.parse(await new ExpoFile(uri).text())) })
    } catch (e) {
      alert("Can't open this skin", userFacingError(e, "The file isn't a valid OwnGains skin."), [{ text: "OK" }], "error")
    }
  }

  const exportFile = async () => {
    try {
      const doc = buildSkin(savedTheme, await storedBoards(userId), typography)
      const result = await writeJsonExport("owngains-skin", doc)
      trackFeature("skins", "export", { destination: result.destination })
      alert("Skin exported", `Your skin was ${DESTINATION_TEXT[result.destination]}.`, [{ text: "OK" }], "success")
    } catch (e) {
      captureUnreported(e, { feature: "skins", stage: "export" })
      alert("Export failed", userFacingError(e, "Couldn't write the skin file."), [{ text: "OK" }], "error")
    }
  }

  const open = (skin: SkinSummary) => setSheet({ initialRef: String(skin.id) })
  const showMine = canSignIn && mine
  const sortLabel = SORTS.find((s) => s.id === sort)?.label ?? ""
  const menus: Record<Menu, { title: string; items: MenuItem[] }> = {
    add: {
      title: "Add a skin",
      items: [
        { title: "Paste an ID or link", meta: "From a friend or the marketplace website", onPress: () => setSheet({}) },
        { title: "Open a skin file", meta: "A skin someone exported", onPress: () => void importFile() },
      ],
    },
    more: {
      title: "Skins",
      items: [
        { title: "Export my skin to a file", meta: "Your theme and widget layouts", onPress: () => void exportFile() },
        {
          title: "Marketplace address",
          meta: marketplace ? new URL(marketplace).host : undefined,
          onPress: () => {
            setUrlError(null)
            setDraftUrl(marketplace ?? DEFAULT_MARKETPLACE_URL)
          },
        },
      ],
    },
    sort: {
      title: "Sort by",
      items: SORTS.map((s) => ({ title: s.label, meta: s.id === sort ? "Current" : undefined, onPress: () => setSort(s.id) })),
    },
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <IconButton glyph='‹' label='Back' onPress={() => navigation.goBack()} />
        <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole='header'>
          Skins
        </Text>
        <IconButton glyph='＋' label='Add a skin' onPress={() => setMenu("add")} />
        <IconButton glyph='⋯' label='More skin options' onPress={() => setMenu("more")} />
      </View>
      {canSignIn && (
        <View style={[styles.segment, { backgroundColor: colors.separator }]} accessibilityRole='radiogroup'>
          {TABS.map((t) => {
            const on = mine === t.mine
            return (
              <TouchableOpacity
                key={t.label}
                style={[styles.segmentItem, on && { backgroundColor: colors.surface }]}
                onPress={() => setMine(t.mine)}
                accessibilityRole='radio'
                accessibilityState={{ checked: on }}
              >
                <Text style={[styles.segmentText, { color: on ? colors.textPrimary : colors.textSecondary }]}>{t.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      )}
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder='Search skins'
          placeholderTextColor={colors.textMuted}
          accessibilityLabel='Search skins'
          style={[styles.search, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
        />
        <Button
          label={`${sortLabel} ▾`}
          accessibilityLabel={`Sort by ${sortLabel}`}
          size='sm'
          variant='quiet'
          onPress={() => setMenu("sort")}
        />
      </View>
      {error && skins.length === 0 ? (
        <Placeholder icon='📡' text={error} action={{ label: "Try again", onPress: () => void fetchPage(1) }} />
      ) : (
        <FlatList
          // numColumns can't change on a mounted FlatList.
          key={showMine ? "mine" : "browse"}
          data={skins}
          numColumns={showMine ? 1 : 2}
          columnWrapperStyle={showMine ? undefined : styles.column}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            showMine ? (
              <View style={[styles.share, { backgroundColor: colors.accent }]}>
                <SkinPreview swatch={swatchOf(savedTheme.colors)} style={styles.shareThumb} />
                <View style={styles.shareText}>
                  <Text style={[styles.shareTitle, { color: colors.textOnAccent }]}>Share your current look</Text>
                  <Text style={{ color: colors.textOnAccent }}>Your theme and widget layouts</Text>
                </View>
                <Button label='Publish' size='sm' variant='quiet' tone={colors.textOnAccent} onPress={() => setPublishing({})} />
              </View>
            ) : undefined
          }
          renderItem={({ item }) =>
            showMine ? (
              <SkinRow skin={item} onPress={item.takenDown ? undefined : () => open(item)}>
                {!item.takenDown && (
                  <Button label='Update' size='sm' variant='quiet' onPress={() => setPublishing({ existing: item })} />
                )}
                <Button label='Delete' size='sm' variant='danger' onPress={() => remove(item)} />
              </SkinRow>
            ) : (
              <SkinCard skin={item} onPress={() => open(item)} />
            )
          }
          onEndReached={() => {
            if (hasMore && !loading) void fetchPage(page + 1)
          }}
          ListEmptyComponent={
            loading ? undefined : (
              <Placeholder icon='🎨' text={showMine ? "You haven't published a skin yet." : "No skins found."} />
            )
          }
        />
      )}
      <ImportSkinSheet
        visible={sheet !== null}
        onClose={() => setSheet(null)}
        initialRef={sheet?.initialRef}
        marketplace={sheet?.marketplace}
        fileSkin={sheet?.fileSkin}
        onPreviewed={() => navigation.goBack()}
      />
      <PublishSkinSheet
        visible={publishing !== null}
        onClose={() => setPublishing(null)}
        existing={publishing?.existing}
        onPublished={() => void fetchPage(1)}
      />
      <ModalSheet
        visible={draftUrl !== null}
        onClose={() => setDraftUrl(null)}
        title='Marketplace address'
        subtitle='Skins are browsed from here. The official marketplace is the default, even for self-hosted servers.'
        confirmText='Save'
        onConfirm={() => void saveUrl(draftUrl ?? "")}
      >
        <TextInput
          value={draftUrl ?? ""}
          onChangeText={setDraftUrl}
          autoCapitalize='none'
          autoCorrect={false}
          keyboardType='url'
          accessibilityLabel='Marketplace address'
          style={[styles.field, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
        />
        {urlError && <Text style={{ color: colors.error }}>{urlError}</Text>}
        <Button label='Use the official marketplace' size='sm' variant='quiet' onPress={() => void saveUrl(null)} />
      </ModalSheet>
      <ModalSheet
        visible={menu !== null}
        onClose={() => setMenu(null)}
        title={menu ? menus[menu].title : undefined}
        showCancelButton={false}
        showConfirmButton={false}
      >
        <View style={styles.menu}>
          {menu &&
            menus[menu].items.map((item, i, all) => (
              <Row
                key={item.title}
                title={item.title}
                meta={item.meta}
                last={i === all.length - 1}
                onPress={() => {
                  setMenu(null)
                  item.onPress()
                }}
              />
            ))}
        </View>
      </ModalSheet>
      {AlertComponent}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  title: { flex: 1, fontSize: 22, fontWeight: "800" },
  segment: { flexDirection: "row", borderRadius: radius.md, padding: 3, marginBottom: space.md },
  segmentItem: { flex: 1, alignItems: "center", paddingVertical: space.sm, borderRadius: radius.sm },
  segmentText: { fontSize: 14, fontWeight: "700" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md },
  field: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  search: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  column: { justifyContent: "space-between" },
  list: { gap: space.md, paddingBottom: space.xl },
  share: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.lg },
  shareThumb: { width: 52, height: 64, borderRadius: radius.sm, padding: 5, gap: 3 },
  shareText: { flex: 1, gap: 2 },
  shareTitle: { fontSize: 15, fontWeight: "700" },
  menu: { paddingHorizontal: space.md },
})
