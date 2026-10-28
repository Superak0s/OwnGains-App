import React, { useEffect, useState } from "react"
import { Share, StyleSheet, Switch, Text, TextInput, View } from "react-native"
import ModalSheet from "@shared/components/ModalSheet"
import { Button, radius, space, useUi } from "@shared/components/ui"
import { useAuth } from "@shared/context/AuthContext"
import { useTheme } from "@shared/context/ThemeContext"
import { userFacingError } from "@shared/services/apiError"
import type { WidgetInstance } from "@shared/types"
import { SKIN_BOARDS, storedBoards, type SkinBoardId } from "../boards"
import { buildSkin } from "../skinFormat"
import { publishSkin, updateSkin, type SkinSummary } from "../services/marketplace"
import { useMarketplaceAccount } from "../hooks/useMarketplaceAccount"

interface Props {
  readonly visible: boolean
  readonly onClose: () => void
  /** Publishes a new version of this skin instead of a new one. */
  readonly existing?: SkinSummary
  readonly onPublished?: () => void
}

export default function PublishSkinSheet({ visible, onClose, existing, onPublished }: Props): React.ReactElement {
  const { colors } = useUi()
  const { savedTheme } = useTheme()
  const { user } = useAuth()
  const { canSignIn, signInLine } = useMarketplaceAccount(visible)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [withTheme, setWithTheme] = useState(false)
  const [available, setAvailable] = useState<Partial<Record<SkinBoardId, WidgetInstance[]>>>({})
  const [chosen, setChosen] = useState<Set<SkinBoardId>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [link, setLink] = useState<string | null>(null)

  useEffect(() => {
    if (!visible) return
    setName(existing?.name ?? "")
    setDescription(existing?.description ?? "")
    setWithTheme(false)
    setChosen(new Set())
    setError(null)
    setLink(null)
    void storedBoards(user?.id == null ? null : String(user.id)).then(setAvailable)
  }, [visible, existing, user?.id])

  const toggle = (id: SkinBoardId, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const ready = name.trim().length > 0 && (withTheme || chosen.size > 0) && !busy

  const publish = async () => {
    setBusy(true)
    setError(null)
    try {
      const boards = Object.fromEntries([...chosen].map((id) => [id, available[id] ?? []]))
      const body = { name: name.trim(), description: description.trim(), skin: buildSkin(withTheme ? savedTheme : null, boards) }
      const res = existing ? await updateSkin(existing.id, body) : await publishSkin(body)
      setLink(res.url)
      onPublished?.()
    } catch (e) {
      setError(userFacingError(e, "Couldn't publish the skin."))
    } finally {
      setBusy(false)
    }
  }

  const boardIds = (Object.keys(available) as SkinBoardId[]).filter((id) => available[id]?.length)

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title={existing ? `Update ${existing.name}` : "Publish a skin"}
      showConfirmButton={false}
      scrollable
    >
      {canSignIn === false && <Text style={{ color: colors.textSecondary }}>{signInLine}</Text>}
      {canSignIn && link && (
        <View style={styles.body}>
          <Text style={{ color: colors.textPrimary }}>Your skin is live at {link}</Text>
          <Button label='Share link' full onPress={() => void Share.share({ message: link })} />
        </View>
      )}
      {canSignIn && !link && (
        <View style={styles.body}>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={60}
            placeholder='Name'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Skin name'
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
          />
          <TextInput
            value={description}
            onChangeText={setDescription}
            maxLength={500}
            multiline
            placeholder='Description (optional)'
            placeholderTextColor={colors.textMuted}
            accessibilityLabel='Skin description'
            style={[styles.input, styles.multiline, { color: colors.textPrimary, borderColor: colors.surfaceBorder }]}
          />
          <Row label='Include my theme' value={withTheme} onChange={setWithTheme} />
          {boardIds.length > 0 && <Text style={{ color: colors.textMuted }}>Widget layouts</Text>}
          {boardIds.map((id) => (
            <Row key={id} label={SKIN_BOARDS[id].label} value={chosen.has(id)} onChange={(on) => toggle(id, on)} />
          ))}
          <Text style={{ color: colors.textMuted }}>
            Published skins are public, and stay public without your name if you delete your account.
          </Text>
          {error && <Text style={{ color: colors.error }}>{error}</Text>}
          <Button label={existing ? "Update" : "Publish"} full disabled={!ready} onPress={() => void publish()} />
        </View>
      )}
    </ModalSheet>
  )
}

function Row({
  label,
  value,
  onChange,
}: {
  readonly label: string
  readonly value: boolean
  readonly onChange: (v: boolean) => void
}): React.ReactElement {
  const { colors } = useUi()
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.textPrimary }}>{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  )
}

const styles = StyleSheet.create({
  body: { gap: space.md },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
})
