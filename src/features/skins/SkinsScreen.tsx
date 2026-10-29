import React, { useCallback, useEffect, useState } from "react"
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import type { NativeStackScreenProps } from "@react-navigation/native-stack"
import * as DocumentPicker from "expo-document-picker"
import { File as ExpoFile } from "expo-file-system"
import { useAlert } from "@shared/components/CustomAlert"
import { Button, Chip, IconButton, Placeholder, radius, space, useUi } from "@shared/components/ui"
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
import SkinCard from "./components/SkinCard"
import PublishSkinSheet from "./components/PublishSkinSheet"
import { useMarketplaceAccount } from "./hooks/useMarketplaceAccount"

type Props = NativeStackScreenProps<RootStackParamList, "Skins">

const SORTS: { id: SkinSort; label: string }[] = [
  { id: "popular", label: "Popular" },
  { id: "rating", label: "Top rated" },
  { id: "new", label: "New" },
]

interface SheetState {
  initialRef?: string
  marketplace?: string | null
  fileSkin?: ParsedSkin | null
}

export default function SkinsScreen({ navigation, route }: Props): React.ReactElement {
  const { colors } = useUi()
  const { savedTheme } = useTheme()
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
      const doc = buildSkin(savedTheme, await storedBoards(userId))
      const result = await writeJsonExport("owngains-skin", doc)
      trackFeature("skins", "export", { destination: result.destination })
      alert("Skin exported", `Your skin was ${DESTINATION_TEXT[result.destination]}.`, [{ text: "OK" }], "success")
    } catch (e) {
      captureUnreported(e, { feature: "skins", stage: "export" })
      alert("Export failed", userFacingError(e, "Couldn't write the skin file."), [{ text: "OK" }], "error")
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={["top"]}>
      <View style={styles.header}>
        <IconButton glyph='‹' label='Back' onPress={() => navigation.goBack()} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Skins</Text>
      </View>
      <View style={styles.actions}>
        <Button label='Import by ID or link' size='sm' variant='quiet' onPress={() => setSheet({})} />
        <Button label='Import from file' size='sm' variant='quiet' onPress={() => void importFile()} />
        <Button label='Export to file' size='sm' variant='quiet' onPress={() => void exportFile()} />
        {canSignIn && <Button label='Publish' size='sm' variant='quiet' onPress={() => setPublishing({})} />}
        <Button
          label='Marketplace address'
          size='sm'
          variant='quiet'
          onPress={() => {
            setUrlError(null)
            setDraftUrl(marketplace ?? DEFAULT_MARKETPLACE_URL)
          }}
        />
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder='Search skins'
        placeholderTextColor={colors.textMuted}
        accessibilityLabel='Search skins'
        style={[styles.search, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
      />
      {canSignIn && (
        <View style={styles.sorts}>
          <Chip label='Browse' selected={!mine} onPress={() => setMine(false)} accessibilityRole='radio' />
          <Chip label='My skins' selected={mine} onPress={() => setMine(true)} accessibilityRole='radio' />
        </View>
      )}
      <View style={styles.sorts}>
        {SORTS.map((s) => (
          <Chip key={s.id} label={s.label} selected={sort === s.id} onPress={() => setSort(s.id)} accessibilityRole='radio' />
        ))}
      </View>
      {error && skins.length === 0 ? (
        <Placeholder icon='📡' text={error} action={{ label: "Try again", onPress: () => void fetchPage(1) }} />
      ) : (
        <FlatList
          data={skins}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View>
              <SkinCard
                skin={item}
                onPress={item.takenDown ? undefined : () => setSheet({ initialRef: String(item.id) })}
              />
              {item.takenDown && (
                <Text style={{ color: colors.error }}>
                  Removed by the marketplace: {item.takenDown.reason}
                </Text>
              )}
              {mine && (
                <View style={styles.actions}>
                  {!item.takenDown && (
                    <Button label='Update' size='sm' variant='quiet' onPress={() => setPublishing({ existing: item })} />
                  )}
                  <Button label='Delete' size='sm' variant='danger' onPress={() => remove(item)} />
                </View>
              )}
            </View>
          )}
          onEndReached={() => {
            if (hasMore && !loading) void fetchPage(page + 1)
          }}
          ListEmptyComponent={loading ? undefined : <Placeholder icon='🎨' text='No skins found.' />}
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
          style={[styles.search, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
        />
        {urlError && <Text style={{ color: colors.error }}>{urlError}</Text>}
        <Button label='Use the official marketplace' size='sm' variant='quiet' onPress={() => void saveUrl(null)} />
      </ModalSheet>
      {AlertComponent}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space.lg },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  title: { fontSize: 22, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  search: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm, marginTop: space.md },
  sorts: { flexDirection: "row", gap: space.sm, marginVertical: space.md },
  list: { gap: space.md, paddingBottom: space.xl },
})
