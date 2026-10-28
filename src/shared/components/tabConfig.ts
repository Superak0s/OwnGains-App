export interface TabConfig {
  key: string
  visible: boolean
}

/** The bar's config with the saved entries it doesn't know put back at their saved positions. */
export function keepUnshown(saved: TabConfig[], next: TabConfig[]): TabConfig[] {
  const shown = new Set(next.map((c) => c.key))
  const merged = [...next]
  saved.forEach((c, i) => {
    if (!shown.has(c.key)) merged.splice(Math.min(i, merged.length), 0, c)
  })
  return merged
}

/** The tab to switch to when the active one is hidden, else null. */
export function redirectFromHidden(config: TabConfig[], activeTab: string): string | null {
  if (!config.some((c) => c.key === activeTab && !c.visible)) return null
  return config.find((c) => c.visible)?.key ?? null
}
