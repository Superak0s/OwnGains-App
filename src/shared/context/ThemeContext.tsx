import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from "react"
import { getStorageItem, setStorageItem } from "@shared/services/sqliteStorage"
import {
  ActivityIndicator,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native"
import themesData from "./themes.json"
import { isDarkColor } from "@utils/color"
import { captureException, metric, trackFeature } from "@shared/services/crashReporting"

export {
  isDarkColor,
  isValidHex,
  toRgbHex,
  darken,
  contrastRatio,
} from "@utils/color"

const STORAGE_KEY = "app_theme_v1"

export interface ThemeColors {
  background: string
  surface: string
  surfaceElevated: string
  surfaceBorder: string

  textPrimary: string
  textSecondary: string
  textMuted: string
  textOnAccent: string

  accent: string
  accentLight: string
  accentDark: string

  success: string
  successLight: string
  error: string
  errorLight: string
  warning: string
  warningLight: string
  info: string
  infoLight: string

  separator: string
  shadow: string
  overlay: string
  inputBackground: string
  inputBorder: string
  badgeBackground: string

  chartColor: string
  chartColorDark: string
}

// Used only if themes.json is missing/unreadable, or if a theme entry in
// themes.json is missing one or more color keys. Day-to-day edits should
// happen in themes.json, not here. Kept equal to the bundled "light"
// palette so it clears the same contrast minimums. An independently tuned
// fallback silently drifted below WCAG AA.
export const FALLBACK_COLORS: ThemeColors = {
  background: "#f8fafc",
  surface: "#ffffff",
  surfaceElevated: "#ffffff",
  surfaceBorder: "#c3cedc",

  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#64748b",
  textOnAccent: "#ffffff",

  accent: "#1d4ed8",
  accentLight: "#1d4ed81f",
  accentDark: "#1e40af",

  success: "#047857",
  successLight: "#d1fae5",
  error: "#b91c1c",
  errorLight: "#fee2e2",
  warning: "#d97706",
  warningLight: "#fef3c7",
  info: "#1d4ed8",
  infoLight: "#dbeafe",

  separator: "#e2e8f0",
  shadow: "#000000",
  overlay: "rgba(15,23,42,0.5)",
  inputBackground: "#ffffff",
  inputBorder: "#c3cedc",
  badgeBackground: "#f1f5f9",

  chartColor: "#1d4ed8",
  chartColorDark: "#1e40af",
}

const REQUIRED_COLOR_KEYS = Object.keys(FALLBACK_COLORS) as Array<
  keyof ThemeColors
>

interface RawTheme {
  id: string
  name: string
  description?: string
  author?: string
  colors: Record<string, unknown>
}

function warnInvalidTheme(reason: string, ...message: unknown[]): void {
  metric.count("theme.config_invalid", 1, { attributes: { reason } })
  console.warn("[ThemeContext]", ...message)
}

/**
 * Missing or invalid keys fall back to FALLBACK_COLORS so a typo in
 * themes.json never crashes the app.
 */
function normalizeColors(
  raw: Record<string, unknown> | undefined | null,
  themeId: string,
): ThemeColors {
  const result = {} as ThemeColors
  const missing: string[] = []

  for (const key of REQUIRED_COLOR_KEYS) {
    const value = raw?.[key]
    if (typeof value === "string") {
      result[key] = value
    } else {
      missing.push(key)
      result[key] = FALLBACK_COLORS[key]
    }
  }

  if (missing.length > 0) {
    warnInvalidTheme(
      "missing_colors",
      `Theme "${themeId}" in themes.json is missing color key(s): ${missing.join(
        ", ",
      )}. Using fallback values for those keys.`,
    )
  }

  return result
}

function loadBuiltInThemes(): AppTheme[] {
  const raw = Array.isArray(themesData) ? (themesData as RawTheme[]) : []
  const seen = new Set<string>()
  const result: AppTheme[] = []

  for (const entry of raw) {
    if (!entry || typeof entry.id !== "string" || !entry.id) {
      warnInvalidTheme(
        "invalid_entry",
        "Skipping invalid entry in themes.json:",
        entry,
      )
      continue
    }
    if (entry.id === "system") {
      warnInvalidTheme(
        "reserved_id",
        '"system" is a reserved theme id and is handled automatically, skipping this entry in themes.json.',
      )
      continue
    }
    if (seen.has(entry.id)) {
      warnInvalidTheme(
        "duplicate_id",
        `Duplicate theme id "${entry.id}" in themes.json, keeping the first occurrence.`,
      )
      continue
    }
    seen.add(entry.id)

    result.push({
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description,
      author: entry.author,
      colors: normalizeColors(entry.colors, entry.id),
    })
  }

  if (result.length === 0) {
    warnInvalidTheme(
      "no_themes",
      "No valid themes found in themes.json, falling back to one built-in light theme.",
    )
    result.push({
      id: "light",
      name: "☀️ Light",
      description: "Clean white theme",
      colors: FALLBACK_COLORS,
    })
  }

  return result
}

const PRESET_THEMES: AppTheme[] = loadBuiltInThemes()

function findPreset(id: string): AppTheme | undefined {
  return PRESET_THEMES.find((t) => t.id === id)
}

// The two presets referenced by id from code rather than data: LIGHT_COLORS
// backs the "system" theme and the theme editor's starting palette, DARK_COLORS
// the system theme's dark resolution. Every other theme is looked up by id.
export const LIGHT_COLORS: ThemeColors =
  findPreset("light")?.colors ?? FALLBACK_COLORS
export const DARK_COLORS: ThemeColors =
  findPreset("dark")?.colors ?? FALLBACK_COLORS

// User-created themes use arbitrary ids, so the built-ins are only a hint.
// `string & {}` keeps them in autocomplete instead of collapsing to `string`.
type ThemeId =
  | "light"
  | "dark"
  | "yellow"
  | "red"
  | "green"
  | "blue"
  | "pink"
  | "system"
  | (string & {})

export interface AppTheme {
  id: ThemeId
  name: string
  description?: string
  author?: string
  colors: ThemeColors
}

const BUILT_IN_THEMES: AppTheme[] = [
  {
    id: "system",
    name: "System Default",
    description: "Follows your device's light/dark mode setting",
    // resolved at runtime
    colors: LIGHT_COLORS,
  },
  ...PRESET_THEMES,
]

interface ThemeContextValue {
  theme: AppTheme
  colors: ThemeColors
  isDark: boolean
  /** The stored theme ID (may be "system") */
  activeThemeId: ThemeId
  allThemes: AppTheme[]

  setTheme: (id: ThemeId) => Promise<void>
  saveCustomTheme: (theme: AppTheme) => Promise<void>
  deleteCustomTheme: (id: string) => Promise<void>

  /** User-set chart color override (null = use theme default) */
  chartColorOverride: string | null
  chartColorDarkOverride: string | null
  setChartColorOverride: (
    color: string | null,
    dark?: string | null,
  ) => Promise<void>

  /** Resolved chart colors (override > theme default) */
  resolvedChartColor: string
  resolvedChartColorDark: string
}


const ThemeContext = createContext<ThemeContextValue | null>(null)

interface PersistedState {
  activeThemeId: ThemeId
  customThemes: AppTheme[]
  chartColorOverride?: string | null
  chartColorDarkOverride?: string | null
}

const DEFAULT_STATE: PersistedState = {
  activeThemeId: "system",
  customThemes: [],
  chartColorOverride: null,
  chartColorDarkOverride: null,
}

async function loadState(): Promise<PersistedState> {
  try {
    const raw = await getStorageItem(STORAGE_KEY)
    if (!raw) return DEFAULT_STATE
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      ...DEFAULT_STATE,
      ...parsed,
      customThemes: Array.isArray(parsed.customThemes)
        ? parsed.customThemes
        : [],
    }
  } catch (error) {
    // Falling back to defaults silently discards the user's custom themes.
    metric.count("theme.state_load_failed")
    captureException(error, { stage: "loadThemeState" })
    return DEFAULT_STATE
  }
}

async function saveState(state: PersistedState): Promise<void> {
  try {
    await setStorageItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    metric.count("theme.state_save_failed")
    captureException(error, { stage: "saveThemeState" })
  }
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const systemScheme = useColorScheme()

  const [activeThemeId, setActiveThemeId] = useState<ThemeId>("system")
  const [customThemes, setCustomThemes] = useState<AppTheme[]>([])
  const [chartColorOverride, setChartColorOverride] = useState<
    string | null
  >(null)
  const [chartColorDarkOverride, setChartColorDarkOverride] = useState<
    string | null
  >(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    loadState().then(
      ({
        activeThemeId: id,
        customThemes: custom,
        chartColorOverride: co,
        chartColorDarkOverride: cod,
      }) => {
        setActiveThemeId(id)
        setCustomThemes(custom)
        setChartColorOverride(co ?? null)
        setChartColorDarkOverride(cod ?? null)
        setLoaded(true)
      },
    )
  }, [])

  const allThemes: AppTheme[] = useMemo(
    () => [...BUILT_IN_THEMES, ...customThemes],
    [customThemes],
  )

  const theme = useMemo<AppTheme>(() => {
    if (activeThemeId === "system") {
      const systemColors = systemScheme === "dark" ? DARK_COLORS : LIGHT_COLORS
      return {
        id: "system",
        name: "System Default",
        colors: systemColors,
      }
    }
    const found = allThemes.find((t) => t.id === activeThemeId)
    if (found) return found
    return BUILT_IN_THEMES[1] ?? BUILT_IN_THEMES[0]
  }, [activeThemeId, allThemes, systemScheme])
  const colors = theme.colors
  const isDark = isDarkColor(colors.background)

  const resolvedChartColor = chartColorOverride ?? colors.chartColor
  const resolvedChartColorDark = chartColorDarkOverride ?? colors.chartColorDark

  // Every writer persists the whole record. Writing only the fields it sets
  // would blank the others (a theme change used to wipe the chart colours).
  const persist = useCallback(
    (next: Partial<PersistedState>) =>
      saveState({
        activeThemeId,
        customThemes,
        chartColorOverride,
        chartColorDarkOverride,
        ...next,
      }),
    [activeThemeId, customThemes, chartColorOverride, chartColorDarkOverride],
  )

  const applyChartColorOverride = useCallback(
    async (color: string | null, dark: string | null = null) => {
      setChartColorOverride(color)
      setChartColorDarkOverride(dark)
      await persist({
        chartColorOverride: color,
        chartColorDarkOverride: dark,
      })
    },
    [persist],
  )

  const setTheme = useCallback(
    async (id: ThemeId) => {
      setActiveThemeId(id)
      await persist({ activeThemeId: id })
      const isCustom = customThemes.some((t) => t.id === id)
      trackFeature("theme", "select", { theme: isCustom ? "custom" : id })
    },
    [persist, customThemes],
  )

  const saveCustomTheme = useCallback(
    async (newTheme: AppTheme) => {
      const updated = customThemes.some((t) => t.id === newTheme.id)
        ? customThemes.map((t) => (t.id === newTheme.id ? newTheme : t))
        : [...customThemes, newTheme]

      setCustomThemes(updated)
      await persist({ customThemes: updated })
    },
    [customThemes, persist],
  )

  const deleteCustomTheme = useCallback(
    async (id: string) => {
      const updated = customThemes.filter((t) => t.id !== id)
      setCustomThemes(updated)
      const nextId = activeThemeId === id ? "system" : activeThemeId
      setActiveThemeId(nextId)
      await persist({ activeThemeId: nextId, customThemes: updated })
    },
    [customThemes, activeThemeId, persist],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      colors,
      isDark,
      activeThemeId,
      allThemes,
      setTheme,
      saveCustomTheme,
      deleteCustomTheme,
      chartColorOverride,
      chartColorDarkOverride,
      setChartColorOverride: applyChartColorOverride,
      resolvedChartColor,
      resolvedChartColorDark,
    }),
    [
      theme,
      colors,
      isDark,
      activeThemeId,
      allThemes,
      setTheme,
      saveCustomTheme,
      deleteCustomTheme,
      chartColorOverride,
      chartColorDarkOverride,
      applyChartColorOverride,
      resolvedChartColor,
      resolvedChartColorDark,
    ],
  )

  // The stored palette sets the whole app's background, so painting one
  // before it loads would flash the wrong colour on every cold start.
  if (!loaded) {
    const pending = systemScheme === "dark" ? DARK_COLORS : LIGHT_COLORS
    return (
      <View
        style={[bootStyles.root, { backgroundColor: pending.background }]}
        accessibilityRole='progressbar'
        accessibilityLabel='Loading theme'
      >
        <ActivityIndicator color={pending.accent} />
      </View>
    )
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  )
}

const bootStyles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center" },
})

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used inside <ThemeProvider>")
  }
  return ctx
}
