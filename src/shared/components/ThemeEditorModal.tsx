import { Fragment, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native"
import {
  useTheme,
  type AppTheme,
  type ThemeColors,
  LIGHT_COLORS,
  DARK_COLORS,
  isDarkColor,
  isValidHex,
  toRgbHex,
  darken,
  contrastRatio,
} from "../context/ThemeContext"
import { useAlert } from "./CustomAlert"
import ModalSheet from "./ModalSheet"
import { generateId } from "@utils/format"

type Tab = "browse" | "create"

interface ColorRow {
  key: keyof ThemeColors
  label: string
  description: string
}

interface ThemeEditorModalProps {
  readonly visible: boolean
  readonly onClose: () => void
}

const COLOR_ROWS: ColorRow[] = [
  {
    key: "background",
    label: "Background",
    description: "Main screen background",
  },
  { key: "surface", label: "Surface", description: "Cards and panels" },
  {
    key: "surfaceElevated",
    label: "Surface Elevated",
    description: "Modals and elevated cards",
  },
  {
    key: "surfaceBorder",
    label: "Border",
    description: "Card and input borders",
  },
  {
    key: "textPrimary",
    label: "Text Primary",
    description: "Headings and body copy",
  },
  {
    key: "textSecondary",
    label: "Text Secondary",
    description: "Subtitles and labels",
  },
  {
    key: "textMuted",
    label: "Text Muted",
    description: "Placeholders and hints",
  },
  { key: "accent", label: "Accent", description: "Buttons and highlights" },
  {
    key: "accentLight",
    label: "Accent Tint",
    description: "Soft accent backgrounds",
  },
  {
    key: "accentDark",
    label: "Accent Dark",
    description: "Pressed accent / shadows",
  },
  { key: "success", label: "Success", description: "Positive states" },
  {
    key: "successLight",
    label: "Success Light",
    description: "Success chip background",
  },
  { key: "error", label: "Error", description: "Errors and destructive" },
  {
    key: "errorLight",
    label: "Error Light",
    description: "Error chip background",
  },
  { key: "warning", label: "Warning", description: "Caution states" },
  {
    key: "warningLight",
    label: "Warning Light",
    description: "Warning chip background",
  },
  {
    key: "inputBackground",
    label: "Input Background",
    description: "Text field backgrounds",
  },
  {
    key: "inputBorder",
    label: "Input Border",
    description: "Text field borders",
  },
  { key: "separator", label: "Separator", description: "Divider lines" },
]

const BUILT_IN_IDS = new Set(["system", "light", "dark"])

const HEX_HINT = "Use #rgb, #rrggbb or #rrggbbaa"

// Body text has to clear WCAG AA against both the page and card backgrounds.
const MIN_BODY_CONTRAST = 4.5

const safeHex = (value: string, fallback: string) =>
  isValidHex(value) ? value : fallback

const withHash = (text: string) => (text.startsWith("#") ? text : `#${text}`)

function withAlpha(hex: string, alpha: number): string {
  const rgb = toRgbHex(hex)
  if (!rgb) return hex
  const a = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")
  return `${rgb}${a}`
}

// Semantic colours are taken from whichever built-in preset matches the
// background's lightness. The light set on a dark background renders status
// chips at ~1.2:1. Invalid hex falls back to that preset rather than reaching
// the renderer, which throws on an unparseable colour.
export function deriveColors(
  bgInput: string,
  surfaceInput: string,
  accentInput: string,
  textInput: string,
): ThemeColors {
  const base = isDarkColor(safeHex(bgInput, LIGHT_COLORS.background))
    ? DARK_COLORS
    : LIGHT_COLORS
  const bg = safeHex(bgInput, base.background)
  const surface = safeHex(surfaceInput, base.surface)
  const accent = safeHex(accentInput, base.accent)
  const textPrimary = safeHex(textInput, base.textPrimary)

  return {
    background: bg,
    surface,
    surfaceElevated: surface,
    surfaceBorder: withAlpha(textPrimary, 0.28),
    textPrimary,
    textSecondary: withAlpha(textPrimary, 0.78),
    textMuted: withAlpha(textPrimary, 0.62),
    textOnAccent: isDarkColor(accent) ? "#ffffff" : "#10131f",
    accent,
    accentLight: withAlpha(accent, 0.15),
    accentDark: darken(accent, 0.15),
    success: base.success,
    successLight: base.successLight,
    error: base.error,
    errorLight: base.errorLight,
    warning: base.warning,
    warningLight: base.warningLight,
    info: accent,
    infoLight: withAlpha(accent, 0.12),
    separator: withAlpha(textPrimary, 0.16),
    shadow: "#000000",
    overlay: base.overlay,
    inputBackground: withAlpha(textPrimary, 0.05),
    inputBorder: withAlpha(textPrimary, 0.28),
    badgeBackground: withAlpha(textPrimary, 0.14),
    chartColor: accent,
    chartColorDark: darken(accent, 0.15),
  }
}

function ThemeCard({
  theme,
  isActive,
  onSelect,
  onDelete,
}: {
  readonly theme: AppTheme
  readonly isActive: boolean
  readonly onSelect: () => void
  readonly onDelete?: () => void
}) {
  const { colors: ui } = useTheme()
  const c = theme.colors
  const isBuiltIn = BUILT_IN_IDS.has(theme.id)

  return (
    <View
      style={[
        cardStyles.container,
        {
          backgroundColor: ui.surface,
          borderColor: isActive ? c.accent : ui.surfaceBorder,
        },
        isActive && { borderWidth: 2.5, backgroundColor: c.accentLight },
      ]}
    >
      <View style={[cardStyles.preview, { backgroundColor: c.background }]}>
        <View style={[cardStyles.previewBar, { backgroundColor: c.surface }]}>
          <View
            style={[cardStyles.previewDot, { backgroundColor: c.accent }]}
          />
          <View
            style={[
              cardStyles.previewLine,
              { backgroundColor: c.textMuted, width: 40 },
            ]}
          />
        </View>
        <View style={[cardStyles.previewCard, { backgroundColor: c.surface }]}>
          <View
            style={[
              cardStyles.previewLine,
              { backgroundColor: c.textPrimary, width: 60, marginBottom: 4 },
            ]}
          />
          <View
            style={[
              cardStyles.previewLine,
              { backgroundColor: c.textMuted, width: 44 },
            ]}
          />
        </View>
        <View style={[cardStyles.previewBtn, { backgroundColor: c.accent }]} />
      </View>

      <View style={cardStyles.info}>
        <View style={cardStyles.titleRow}>
          <Text style={[cardStyles.name, { color: ui.textPrimary }]}>
            {theme.name}
          </Text>
          {isActive && (
            <View
              style={[cardStyles.activeBadge, { backgroundColor: c.accent }]}
            >
              <Text
                style={[cardStyles.activeBadgeText, { color: c.textOnAccent }]}
              >
                Active
              </Text>
            </View>
          )}
        </View>
        {theme.description ? (
          <Text style={[cardStyles.desc, { color: ui.textSecondary }]}>
            {theme.description}
          </Text>
        ) : null}
        {theme.author ? (
          <Text style={[cardStyles.author, { color: ui.textMuted }]}>
            by {theme.author}
          </Text>
        ) : null}

        <View style={cardStyles.actions}>
          <TouchableOpacity
            style={[
              cardStyles.btn,
              { backgroundColor: isActive ? ui.badgeBackground : c.accent },
            ]}
            onPress={onSelect}
            disabled={isActive}
            accessibilityRole='button'
            accessibilityLabel={isActive ? "Theme selected" : "Apply theme"}
            accessibilityState={{ disabled: isActive, selected: isActive }}
          >
            <Text
              style={[
                cardStyles.btnText,
                { color: isActive ? ui.textSecondary : c.textOnAccent },
              ]}
            >
              {isActive ? "Selected" : "Apply"}
            </Text>
          </TouchableOpacity>

          {!isBuiltIn && onDelete && (
            <TouchableOpacity
              style={[cardStyles.iconBtn, { backgroundColor: ui.errorLight }]}
              onPress={onDelete}
              hitSlop={8}
              accessibilityRole='button'
              accessibilityLabel='Delete theme'
            >
              <Text style={cardStyles.iconBtnText}>🗑️</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )
}

const cardStyles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 14,
    overflow: "hidden",
    flexDirection: "row",
  },
  preview: {
    width: 90,
    padding: 8,
    justifyContent: "space-between",
  },
  previewBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 4,
    padding: 4,
    marginBottom: 4,
    gap: 4,
  },
  previewDot: { width: 6, height: 6, borderRadius: 3 },
  previewLine: { height: 4, borderRadius: 2 },
  previewCard: {
    borderRadius: 6,
    padding: 6,
    marginBottom: 4,
  },
  previewBtn: {
    height: 14,
    borderRadius: 7,
  },
  info: { flex: 1, padding: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  name: { fontSize: 15, fontWeight: "700", flex: 1 },
  activeBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  activeBadgeText: { fontSize: 10, fontWeight: "700" },
  desc: { fontSize: 12, marginBottom: 4, lineHeight: 16 },
  author: { fontSize: 11, marginBottom: 8, fontStyle: "italic" },
  actions: { flexDirection: "row", gap: 8, alignItems: "center" },
  btn: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  btnText: { fontSize: 13, fontWeight: "700" },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { fontSize: 16 },
})

function ColorPickerRow({
  row,
  value,
  onChange,
}: {
  readonly row: ColorRow
  readonly value: string
  readonly onChange: (key: keyof ThemeColors, val: string) => void
}) {
  const { colors } = useTheme()
  const [localVal, setLocalVal] = useState(value)
  // The row remains mounted when a preset swap rewrites every token, so the
  // draft has to follow the prop or the input keeps showing the old palette.
  const [syncedValue, setSyncedValue] = useState(value)
  if (value !== syncedValue) {
    setSyncedValue(value)
    setLocalVal(value)
  }
  const valid = isValidHex(localVal)

  const commit = () => {
    if (isValidHex(localVal)) onChange(row.key, localVal)
    else setLocalVal(value)
  }

  return (
    <View style={pickerStyles.wrap}>
      <View style={pickerStyles.row}>
      <View
        style={[
          pickerStyles.swatch,
          {
            backgroundColor: valid ? localVal : value,
            borderColor: colors.surfaceBorder,
          },
        ]}
      />
      <View style={pickerStyles.labelCol}>
        <Text style={[pickerStyles.label, { color: colors.textPrimary }]}>
          {row.label}
        </Text>
        <Text style={[pickerStyles.desc, { color: colors.textMuted }]}>
          {row.description}
        </Text>
      </View>
      <TextInput
        style={[
          pickerStyles.input,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.inputBorder,
            color: colors.textPrimary,
          },
          !valid && { borderColor: colors.error },
        ]}
        value={localVal}
        onChangeText={(t) => {
          const v = withHash(t)
          setLocalVal(v)
          if (isValidHex(v)) onChange(row.key, v)
        }}
        onBlur={commit}
        placeholder='#rrggbb'
        placeholderTextColor={colors.textMuted}
        autoCapitalize='none'
        autoCorrect={false}
        maxLength={9}
      />
      </View>
      {!valid && (
        <Text style={[pickerStyles.errorText, { color: colors.error }]}>
          {HEX_HINT}
        </Text>
      )}
    </View>
  )
}

const pickerStyles = StyleSheet.create({
  wrap: { marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center" },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 8,
    marginRight: 10,
    borderWidth: 1,
  },
  labelCol: { flex: 1 },
  label: { fontSize: 13, fontWeight: "600" },
  desc: { fontSize: 11 },
  input: {
    width: 90,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  errorText: { fontSize: 11, fontWeight: "600", marginTop: 4 },
})

export default function ThemeEditorModal({
  visible,
  onClose,
}: ThemeEditorModalProps) {
  const {
    colors,
    allThemes,
    activeThemeId,
    setTheme,
    saveCustomTheme,
    deleteCustomTheme,
  } = useTheme()
  const { alert, AlertComponent } = useAlert()

  const [tab, setTab] = useState<Tab>("browse")

  const [themeName, setThemeName] = useState("")
  const [themeAuthor, setThemeAuthor] = useState("")
  const [themeDesc, setThemeDesc] = useState("")
  const [basePreset, setBasePreset] = useState<"light" | "dark">("light")

  const [bgColor, setBgColor] = useState(LIGHT_COLORS.background)
  const [surfaceColor, setSurfaceColor] = useState(LIGHT_COLORS.surface)
  const [accentColor, setAccentColor] = useState(LIGHT_COLORS.accent)
  const [textColor, setTextColor] = useState(LIGHT_COLORS.textPrimary)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [advancedColors, setAdvancedColors] =
    useState<ThemeColors>(LIGHT_COLORS)
  const [saving, setSaving] = useState(false)

  const previewColors = showAdvanced
    ? advancedColors
    : deriveColors(bgColor, surfaceColor, accentColor, textColor)

  const quickFields = [
    { label: "Background", val: bgColor, set: setBgColor },
    { label: "Surface", val: surfaceColor, set: setSurfaceColor },
    { label: "Accent", val: accentColor, set: setAccentColor },
    { label: "Text", val: textColor, set: setTextColor },
  ]
  const invalidQuick = quickFields.filter((f) => !isValidHex(f.val))

  const bodyContrast = Math.min(
    contrastRatio(previewColors.textPrimary, previewColors.background),
    contrastRatio(previewColors.textPrimary, previewColors.surface),
  )

  const inputColors = {
    backgroundColor: colors.inputBackground,
    borderColor: colors.inputBorder,
    color: colors.textPrimary,
  }

  const textFields: Array<{
    label: string
    value: string
    set: (val: string) => void
    placeholder: string
    multiline?: boolean
  }> = [
    {
      label: "THEME NAME *",
      value: themeName,
      set: setThemeName,
      placeholder: "My Awesome Theme",
    },
    {
      label: "AUTHOR (optional)",
      value: themeAuthor,
      set: setThemeAuthor,
      placeholder: "@yourusername",
    },
    {
      label: "DESCRIPTION (optional)",
      value: themeDesc,
      set: setThemeDesc,
      placeholder: "A brief description of your theme…",
      multiline: true,
    },
  ]

  const builtInThemes = allThemes.filter((t) => BUILT_IN_IDS.has(t.id))
  const customThemes = allThemes.filter((t) => !BUILT_IN_IDS.has(t.id))

  const resetCreate = () => {
    setThemeName("")
    setThemeAuthor("")
    setThemeDesc("")
    setBasePreset("light")
    setBgColor(LIGHT_COLORS.background)
    setSurfaceColor(LIGHT_COLORS.surface)
    setAccentColor(LIGHT_COLORS.accent)
    setTextColor(LIGHT_COLORS.textPrimary)
    setShowAdvanced(false)
    setAdvancedColors(LIGHT_COLORS)
  }

  const applyPreset = (preset: "light" | "dark") => {
    const c = preset === "light" ? LIGHT_COLORS : DARK_COLORS
    setBasePreset(preset)
    setBgColor(c.background)
    setSurfaceColor(c.surface)
    setAccentColor(c.accent)
    setTextColor(c.textPrimary)
    setAdvancedColors(c)
  }

  const handleAdvancedChange = (key: keyof ThemeColors, val: string) => {
    setAdvancedColors((prev) => ({ ...prev, [key]: val }))
  }

  const handleSaveCustom = async () => {
    if (!themeName.trim()) {
      alert(
        "Name required",
        "Please give your theme a name.",
        [{ text: "OK" }],
        "error",
      )
      return
    }
    if (!showAdvanced && invalidQuick.length > 0) {
      alert(
        "Invalid color",
        `Check ${invalidQuick.map((f) => f.label).join(", ")}. ${HEX_HINT}.`,
        [{ text: "OK" }],
        "error",
      )
      return
    }
    setSaving(true)
    const finalColors = showAdvanced
      ? advancedColors
      : deriveColors(bgColor, surfaceColor, accentColor, textColor)

    const newTheme: AppTheme = {
      id: generateId("custom"),
      name: themeName.trim(),
      description: themeDesc.trim() || undefined,
      author: themeAuthor.trim() || undefined,
      colors: finalColors,
    }

    try {
      await saveCustomTheme(newTheme)
      await setTheme(newTheme.id)
      resetCreate()
      setTab("browse")
      alert(
        "Theme saved!",
        `"${newTheme.name}" is now active.`,
        [{ text: "🎉 Awesome" }],
        "success",
      )
    } catch {
      alert(
        "Could not save theme",
        "Something went wrong saving your theme. Please try again.",
        [{ text: "OK" }],
        "error",
      )
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (theme: AppTheme) => {
    alert(
      `Delete "${theme.name}"?`,
      activeThemeId === theme.id
        ? "This theme will be permanently removed and the app will switch back to System Default."
        : "This theme will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteCustomTheme(theme.id).catch(() => {
              alert(
                "Couldn't delete theme",
                "The theme is still saved on this device. Please try again.",
                [{ text: "OK" }],
                "error",
              )
            })
          },
        },
      ],
      "warning",
    )
  }

  return (
    <ModalSheet
      visible={visible}
      onClose={onClose}
      title='🎨 Themes'
      showCancelButton={false}
      showConfirmButton={false}
      fullHeight
    >
      <View
        style={[s.tabBar, { borderBottomColor: colors.surfaceBorder }]}
        accessibilityRole='tablist'
      >
        {(["browse", "create"] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[
              s.tab,
              tab === t && {
                borderBottomColor: colors.accent,
                borderBottomWidth: 2.5,
              },
            ]}
            onPress={() => setTab(t)}
            accessibilityRole='tab'
            accessibilityLabel={t === "browse" ? "Browse themes" : "Create theme"}
            accessibilityState={{ selected: tab === t }}
          >
            <Text
              style={[
                s.tabText,
                { color: tab === t ? colors.accent : colors.textMuted },
                tab === t && s.tabTextActive,
              ]}
            >
              {t === "browse" ? "Browse" : "Create"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps='handled'
        showsVerticalScrollIndicator={false}
      >
        {tab === "browse" && (
          <View>
            <Text style={[s.sectionHeader, { color: colors.textSecondary }]}>
              BUILT-IN
            </Text>
            {builtInThemes.map((t) => (
              <ThemeCard
                key={t.id}
                theme={t}
                isActive={activeThemeId === t.id}
                onSelect={() => setTheme(t.id)}
              />
            ))}

            {customThemes.length > 0 && (
              <>
                <Text
                  style={[
                    s.sectionHeader,
                    { color: colors.textSecondary, marginTop: 8 },
                  ]}
                >
                  CUSTOM
                </Text>
                {customThemes.map((t) => (
                  <ThemeCard
                    key={t.id}
                    theme={t}
                    isActive={activeThemeId === t.id}
                    onSelect={() => setTheme(t.id)}
                    onDelete={() => handleDelete(t)}
                  />
                ))}
              </>
            )}

            <TouchableOpacity
              style={[
                s.createCta,
                {
                  borderColor: colors.accent,
                  backgroundColor: colors.accentLight,
                },
              ]}
              onPress={() => setTab("create")}
            >
              <Text style={[s.createCtaText, { color: colors.accent }]}>
                ✨ Create a custom theme
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {tab === "create" && (
          <View>
            <View
              style={[
                s.previewStrip,
                { backgroundColor: previewColors.background },
              ]}
            >
              <View
                style={[
                  s.previewStripBar,
                  { backgroundColor: previewColors.surface },
                ]}
              >
                <View
                  style={[
                    s.previewStripDot,
                    { backgroundColor: previewColors.accent },
                  ]}
                />
                <Text
                  style={[
                    s.previewStripTitle,
                    { color: previewColors.textPrimary },
                  ]}
                >
                  {themeName || "My Theme"}
                </Text>
              </View>
              <View
                style={[
                  s.previewStripCard,
                  {
                    backgroundColor: previewColors.surface,
                    borderColor: previewColors.surfaceBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    s.previewStripHeading,
                    { color: previewColors.textPrimary },
                  ]}
                >
                  Workout Day 1
                </Text>
                <Text
                  style={[
                    s.previewStripSub,
                    { color: previewColors.textSecondary },
                  ]}
                >
                  3 exercises · 45 min
                </Text>
                <View
                  style={[
                    s.previewStripBtn,
                    { backgroundColor: previewColors.accent },
                  ]}
                >
                  <Text
                    style={{
                      color: previewColors.textOnAccent,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    Start
                  </Text>
                </View>
              </View>
            </View>

            {bodyContrast < MIN_BODY_CONTRAST && (
              <Text style={[s.contrastWarning, { color: colors.warning }]}>
                {`⚠ Text on background is ${bodyContrast.toFixed(
                  1,
                )}:1, under the ${MIN_BODY_CONTRAST}:1 minimum. This theme will be hard to read.`}
              </Text>
            )}

            {textFields.map(({ label, value, set, placeholder, multiline }) => (
              <Fragment key={label}>
                <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
                  {label}
                </Text>
                <TextInput
                  style={[s.textInput, multiline && s.textArea, inputColors]}
                  value={value}
                  onChangeText={set}
                  placeholder={placeholder}
                  placeholderTextColor={colors.textMuted}
                  multiline={multiline}
                  numberOfLines={multiline ? 2 : undefined}
                />
              </Fragment>
            ))}

            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              START FROM
            </Text>
            <View style={s.presetRow}>
              {(["light", "dark"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    s.presetChip,
                    {
                      borderColor: colors.inputBorder,
                      backgroundColor: colors.surface,
                    },
                    basePreset === p && {
                      borderColor: colors.accent,
                      backgroundColor: colors.accentLight,
                    },
                  ]}
                  onPress={() => applyPreset(p)}
                >
                  <Text style={{ fontSize: 18 }}>
                    {p === "light" ? "☀️" : "🌙"}
                  </Text>
                  <Text
                    style={[
                      s.presetChipLabel,
                      {
                        color:
                          basePreset === p ? colors.accent : colors.textPrimary,
                      },
                    ]}
                  >
                    {p === "light" ? "Light" : "Dark"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!showAdvanced && (
              <>
            <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>
              QUICK COLORS
            </Text>
            <Text style={[s.hint, { color: colors.textMuted }]}>
              These four values auto-generate the rest of the palette.
            </Text>

            <View
              style={[
                s.quickColorsCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.surfaceBorder,
                },
              ]}
            >
              {quickFields.map(({ label, val, set }) => (
                <View key={label}>
                  <View style={s.quickColorRow}>
                    <View
                      style={[
                        s.quickSwatch,
                        {
                          backgroundColor: safeHex(
                            val,
                            colors.inputBackground,
                          ),
                        },
                      ]}
                    />
                    <Text
                      style={[s.quickColorLabel, { color: colors.textPrimary }]}
                    >
                      {label}
                    </Text>
                    <TextInput
                      style={[
                        s.quickColorInput,
                        inputColors,
                        !isValidHex(val) && { borderColor: colors.error },
                      ]}
                      value={val}
                      onChangeText={(t) => set(withHash(t))}
                      placeholder='#rrggbb'
                      placeholderTextColor={colors.textMuted}
                      autoCapitalize='none'
                      autoCorrect={false}
                      maxLength={9}
                    />
                  </View>
                  {!isValidHex(val) && (
                    <Text style={[s.errorText, { color: colors.error }]}>
                      {HEX_HINT}
                    </Text>
                  )}
                </View>
              ))}
            </View>
              </>
            )}

            <TouchableOpacity
              style={[s.advancedToggle, { borderColor: colors.surfaceBorder }]}
              accessibilityRole='button'
              accessibilityState={{ expanded: showAdvanced }}
              onPress={() => {
                if (!showAdvanced) {
                  setAdvancedColors(
                    deriveColors(bgColor, surfaceColor, accentColor, textColor),
                  )
                }
                setShowAdvanced(!showAdvanced)
              }}
            >
              <Text style={[s.advancedToggleText, { color: colors.accent }]}>
                {showAdvanced ? "⬆ Hide" : "⬇ Show"} Advanced Color Editor
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View
                style={[
                  s.advancedCard,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.surfaceBorder,
                  },
                ]}
              >
                <Text
                  style={[
                    s.fieldLabel,
                    { color: colors.textSecondary, marginBottom: 12 },
                  ]}
                >
                  ALL COLOR TOKENS
                </Text>
                {COLOR_ROWS.map((row) => (
                  <ColorPickerRow
                    key={row.key}
                    row={row}
                    value={advancedColors[row.key]}
                    onChange={handleAdvancedChange}
                  />
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                s.saveBtn,
                { backgroundColor: colors.accent },
                saving && { opacity: 0.6 },
              ]}
              onPress={handleSaveCustom}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <Text style={[s.saveBtnText, { color: colors.textOnAccent }]}>
                  ✓ Save & Apply Theme
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {AlertComponent}
    </ModalSheet>
  )
}

const s = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderBottomWidth: 2.5,
    borderBottomColor: "transparent",
  },
  tabText: { fontSize: 14, fontWeight: "600" },
  tabTextActive: { fontWeight: "800" },
  content: { paddingTop: 8, paddingBottom: 32 },
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  createCta: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 18,
    alignItems: "center",
    marginTop: 8,
  },
  createCtaText: { fontSize: 15, fontWeight: "700" },

  previewStrip: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
  },
  previewStripBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  previewStripDot: { width: 10, height: 10, borderRadius: 5 },
  previewStripTitle: { fontSize: 14, fontWeight: "700" },
  previewStripCard: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  previewStripHeading: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  previewStripSub: { fontSize: 12, marginBottom: 12 },
  previewStripBtn: {
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },

  fieldLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.7,
    marginBottom: 6,
    marginTop: 16,
  },
  hint: { fontSize: 12, marginBottom: 10, lineHeight: 17 },
  textInput: {
    borderRadius: 12,
    borderWidth: 1.5,
    padding: 14,
    fontSize: 15,
  },
  textArea: { minHeight: 60, textAlignVertical: "top" },

  presetRow: { flexDirection: "row", gap: 12 },
  presetChip: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
  },
  presetChipLabel: { fontSize: 14, fontWeight: "700" },

  quickColorsCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
  },
  quickColorRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  quickSwatch: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: "#00000020",
  },
  quickColorLabel: { flex: 1, fontSize: 13, fontWeight: "600" },
  quickColorInput: {
    width: 100,
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  advancedToggle: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  advancedToggleText: { fontSize: 14, fontWeight: "700" },

  advancedCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    marginTop: 12,
  },

  saveBtn: {
    marginTop: 20,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 16, fontWeight: "800" },
  errorText: { fontSize: 11, fontWeight: "600", marginTop: 4 },
  contrastWarning: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginBottom: 16,
    marginTop: -8,
  },
})
