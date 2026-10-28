import React, { useCallback, useEffect, useState } from "react"
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native"
import ModalSheet from "@shared/components/ModalSheet"
import { useAlert } from "@shared/components/CustomAlert"
import { Button, radius, space, useUi } from "@shared/components/ui"
import { useSkinPreview, type PreviewBoards } from "@shared/context/SkinPreviewContext"
import { userFacingError } from "@shared/services/apiError"
import { trackFeature } from "@shared/services/crashReporting"
import { SKIN_BOARDS } from "../boards"
import { parseSkin, type ParsedSkin } from "../skinFormat"
import { parseSkinRef } from "../skinRef"
import {
  getMarketplaceUrl,
  getSkin,
  normalizeMarketplaceUrl,
  rateSkin,
  recordDownload,
  reportSkin,
  type SkinDetail,
} from "../services/marketplace"
import { showToast } from "@shared/components/toast"
import { useMarketplaceAccount } from "../hooks/useMarketplaceAccount"
import SkinCard, { skinContents } from "./SkinCard"

interface Props {
  readonly visible: boolean
  readonly onClose: () => void
  readonly initialRef?: string
  /** The marketplace a deep link named, when it isn't the configured one. */
  readonly marketplace?: string | null
  readonly fileSkin?: ParsedSkin | null
  readonly onPreviewed?: () => void
}

interface Loaded {
  parsed: ParsedSkin
  detail: SkinDetail | null
  /** Undefined means the configured marketplace. */
  base?: string
}

export default function ImportSkinSheet({ visible, onClose, initialRef, marketplace, fileSkin, onPreviewed }: Props): React.ReactElement {
  const { colors } = useUi()
  const { alert, AlertComponent } = useAlert()
  const { start } = useSkinPreview()
  const [input, setInput] = useState(initialRef ?? "")
  const [loaded, setLoaded] = useState<Loaded | null>(fileSkin ? { parsed: fileSkin, detail: null } : null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [withTheme, setWithTheme] = useState(true)
  const [withBoards, setWithBoards] = useState(true)
  const { canSignIn, signInLine } = useMarketplaceAccount(visible)

  const rate = async (stars: number) => {
    if (!loaded?.detail) return
    try {
      const r = await rateSkin(loaded.detail.id, stars, loaded.base)
      setLoaded({ ...loaded, detail: { ...loaded.detail, rating: { average: r.average, count: r.count }, myRating: r.myRating } })
    } catch (e) {
      showToast(userFacingError(e, "Couldn't save your rating."))
    }
  }

  const report = () => {
    const detail = loaded?.detail
    if (!detail) return
    const send = (reason: string) =>
      void reportSkin(detail.id, reason, loaded.base).then(
        () => showToast("Thanks, the report was sent"),
        (e: unknown) => showToast(userFacingError(e, "Couldn't send the report.")),
      )
    alert(
      "Report this skin",
      "What's wrong with it?",
      [
        { text: "Offensive", onPress: () => send("Offensive") },
        { text: "Spam", onPress: () => send("Spam") },
        { text: "Doesn't work", onPress: () => send("Doesn't work") },
        { text: "Cancel", style: "cancel" },
      ],
      "warning",
    )
  }

  const fetchSkin = useCallback(async (id: number, base?: string) => {
    setBusy(true)
    setError(null)
    try {
      const detail = await getSkin(id, base)
      setLoaded({ parsed: parseSkin(detail.skin), detail, base })
      setWithTheme(true)
      setWithBoards(true)
    } catch (e) {
      setLoaded(null)
      setError(userFacingError(e, "Couldn't load that skin."))
    } finally {
      setBusy(false)
    }
  }, [])

  const load = useCallback(
    async (text: string, from?: string | null) => {
      const ref = parseSkinRef(text)
      if (!ref) return setError("Enter a skin ID or a skin link.")
      const other = from ?? ref.marketplace
      if (!other) return fetchSkin(ref.id)
      let base: string
      try {
        base = normalizeMarketplaceUrl(other)
      } catch (e) {
        return setError(userFacingError(e, "That marketplace address isn't valid."))
      }
      if (base === (await getMarketplaceUrl())) return fetchSkin(ref.id)
      alert(
        "Another marketplace",
        `Load this skin from ${new URL(base).host}?`,
        [{ text: "Cancel", style: "cancel" }, { text: "Load", onPress: () => void fetchSkin(ref.id, base) }],
        "warning",
      )
    },
    [alert, fetchSkin],
  )

  useEffect(() => {
    if (!visible) return
    setLoaded(fileSkin ? { parsed: fileSkin, detail: null } : null)
    setError(null)
    setWithTheme(true)
    setWithBoards(true)
    setInput(initialRef ?? "")
    if (initialRef && !fileSkin) void load(initialRef, marketplace)
    // Only a newly opened sheet resets: load is stable apart from the alert it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [visible, initialRef, marketplace, fileSkin])

  const hasTheme = !!loaded?.parsed.theme
  const hasBoards = !!loaded && Object.keys(loaded.parsed.boards).length > 0
  const name = loaded?.detail?.name ?? loaded?.parsed.themeName ?? "Skin from file"

  const preview = () => {
    if (!loaded) return
    const { parsed, detail, base } = loaded
    if (detail) recordDownload(detail.id, base).catch(() => {})
    const boards: PreviewBoards = {}
    if (withBoards && hasBoards)
      for (const [id, list] of Object.entries(parsed.boards))
        if (list) boards[SKIN_BOARDS[id as keyof typeof SKIN_BOARDS].storageKey] = list
    trackFeature("skins", "preview", {
      source: detail ? "marketplace" : "file",
      theme: withTheme && hasTheme,
      boards: Object.keys(boards).length,
    })
    start({
      name,
      theme: withTheme && parsed.theme ? { id: "preview", name: parsed.themeName ?? name, colors: parsed.theme } : null,
      boards,
    })
    onClose()
    onPreviewed?.()
  }

  const canPreview = (withTheme && hasTheme) || (withBoards && hasBoards)

  return (
    <ModalSheet visible={visible} onClose={onClose} title='Import a skin' showConfirmButton={false} scrollable>
      {!fileSkin && (
        <View style={styles.row}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder='Skin ID or link'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Skin ID or link'
            autoCapitalize='none'
            autoCorrect={false}
            onSubmitEditing={() => void load(input)}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
          />
          <Button label='Load' size='sm' disabled={busy || !input.trim()} onPress={() => void load(input)} />
        </View>
      )}
      {error && <Text style={{ color: colors.error }}>{error}</Text>}
      {loaded && (
        <View style={styles.body}>
          {loaded.detail ? (
            <SkinCard skin={loaded.detail} />
          ) : (
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {name} · {skinContents(hasTheme, hasBoards)}
            </Text>
          )}
          {loaded.detail?.description ? (
            <Text style={{ color: colors.textSecondary }}>{loaded.detail.description}</Text>
          ) : null}
          {loaded.parsed.droppedBoards > 0 && (
            <Text style={{ color: colors.textMuted }}>Some layouts are for screens this app version doesn't have.</Text>
          )}
          <Toggle label='Colors & theme' value={withTheme && hasTheme} disabled={!hasTheme} onChange={setWithTheme} />
          <Toggle label='Widget layouts' value={withBoards && hasBoards} disabled={!hasBoards} onChange={setWithBoards} />
          <Text style={{ color: colors.textMuted }}>
            Preview shows the skin across the app. Nothing is saved until you apply it.
          </Text>
          <Button label='Preview' full disabled={!canPreview} onPress={preview} />
          {loaded.detail && canSignIn && (
            <View style={styles.row}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => void rate(n)}
                  accessibilityRole='button'
                  accessibilityLabel={`Rate ${n} of 5`}
                  accessibilityState={{ selected: loaded.detail?.myRating === n }}
                >
                  <Text style={[styles.star, { color: (loaded.detail?.myRating ?? 0) >= n ? colors.accent : colors.textMuted }]}>★</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.spacer} />
              <Button label='Report' size='sm' variant='quiet' onPress={report} />
            </View>
          )}
          {loaded.detail && canSignIn === false && <Text style={{ color: colors.textMuted }}>{signInLine}</Text>}
        </View>
      )}
      {AlertComponent}
    </ModalSheet>
  )
}

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: {
  readonly label: string
  readonly value: boolean
  readonly disabled: boolean
  readonly onChange: (v: boolean) => void
}): React.ReactElement {
  const { colors } = useUi()
  return (
    <View style={styles.toggle}>
      <Text style={{ color: disabled ? colors.textMuted : colors.textPrimary }}>{label}</Text>
      <Switch value={value} disabled={disabled} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: space.sm, alignItems: "center" },
  input: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  body: { gap: space.md, marginTop: space.md },
  title: { fontSize: 16, fontWeight: "700" },
  star: { fontSize: 26 },
  spacer: { flex: 1 },
  toggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
