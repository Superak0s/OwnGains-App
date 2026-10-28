import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { useTheme, type AppTheme } from "./ThemeContext"
import { saveToStorage } from "@shared/services/storage"
import type { WidgetInstance } from "@shared/types"

/** Widget layouts keyed by the board's storage key. */
export type PreviewBoards = Record<string, WidgetInstance[]>

export interface SkinPreview {
  name: string
  theme: AppTheme | null
  boards: PreviewBoards
}

interface SkinPreviewValue {
  active: boolean
  name: string | null
  boards: PreviewBoards | null
  /** A previewed board held a widget this app version doesn't know. */
  skippedWidgets: boolean
  /** Bumped on every apply so mounted boards reload what was written. */
  appliedVersion: number
  start: (preview: SkinPreview) => void
  discard: () => void
  apply: (userId: string | null) => Promise<void>
  noteSkipped: () => void
}

const noop = () => {}
const inert: SkinPreviewValue = {
  active: false,
  name: null,
  boards: null,
  skippedWidgets: false,
  appliedVersion: 0,
  start: noop,
  discard: noop,
  apply: async () => {},
  noteSkipped: noop,
}

const SkinPreviewContext = createContext<SkinPreviewValue>(inert)

export function SkinPreviewProvider({ children }: { readonly children: ReactNode }) {
  const { setPreviewTheme, saveCustomTheme } = useTheme()
  const [preview, setPreview] = useState<SkinPreview | null>(null)
  const [skippedWidgets, setSkippedWidgets] = useState(false)
  const [appliedVersion, setAppliedVersion] = useState(0)

  const start = useCallback(
    (next: SkinPreview) => {
      setSkippedWidgets(false)
      setPreview(next)
      setPreviewTheme(next.theme)
    },
    [setPreviewTheme],
  )

  const discard = useCallback(() => {
    setPreview(null)
    setSkippedWidgets(false)
    setPreviewTheme(null)
  }, [setPreviewTheme])

  const apply = useCallback(
    async (userId: string | null) => {
      if (!preview) return
      for (const [key, list] of Object.entries(preview.boards))
        if (!(await saveToStorage(key, list, userId))) throw new Error("Couldn't save the skin's widget layouts")
      if (preview.theme)
        await saveCustomTheme({ ...preview.theme, id: `skin-${Date.now()}`, name: preview.name }, { select: true })
      discard()
      setAppliedVersion((v) => v + 1)
    },
    [preview, saveCustomTheme, discard],
  )

  const noteSkipped = useCallback(() => setSkippedWidgets(true), [])

  const value = useMemo<SkinPreviewValue>(
    () => ({
      active: preview !== null,
      name: preview?.name ?? null,
      boards: preview?.boards ?? null,
      skippedWidgets,
      appliedVersion,
      start,
      discard,
      apply,
      noteSkipped,
    }),
    [preview, skippedWidgets, appliedVersion, start, discard, apply, noteSkipped],
  )

  return <SkinPreviewContext.Provider value={value}>{children}</SkinPreviewContext.Provider>
}

/** Inert outside a provider, so a board rendered alone (tests, the gallery) still works. */
export const useSkinPreview = () => useContext(SkinPreviewContext)
