import React, { createContext, useContext } from "react"
import { StyleSheet, Text as RNText, TextInput as RNTextInput, type StyleProp, type TextStyle } from "react-native"

/** Android's built-in font families, so a skin can change the font without shipping font files. */
export const FONTS = {
  default: { label: "Default", family: undefined },
  serif: { label: "Serif", family: "serif" },
  mono: { label: "Mono", family: "monospace" },
  condensed: { label: "Condensed", family: "sans-serif-condensed" },
  casual: { label: "Casual", family: "casual" },
} as const

export type FontId = keyof typeof FONTS

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const
const MIN_SCALE = 0.9
const MAX_SCALE = 1.3

export interface Typography {
  font: FontId
  scale: number
}

export const DEFAULT_TYPOGRAPHY: Typography = { font: "default", scale: 1 }

export const isDefaultTypography = (t: Typography) => t.font === "default" && t.scale === 1

/** Coerces stored or downloaded typography. A font this app version doesn't know becomes the default. */
export function normalizeTypography(v: unknown): Typography {
  const o = typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {}
  const font = typeof o.font === "string" && Object.keys(FONTS).includes(o.font) ? (o.font as FontId) : "default"
  const scale =
    typeof o.scale === "number" && Number.isFinite(o.scale) ? Math.min(MAX_SCALE, Math.max(MIN_SCALE, o.scale)) : 1
  return { font, scale }
}

export const TypographyContext = createContext<Typography>(DEFAULT_TYPOGRAPHY)

function useTypeStyle(style: StyleProp<TextStyle>, maxFontSizeMultiplier?: number | null): StyleProp<TextStyle> {
  const { font, scale } = useContext(TypographyContext)
  const fontFamily = FONTS[font].family
  // A maxFontSizeMultiplier marks a layout too tight to grow with the system font size, so it caps the skin's scale too.
  const k = maxFontSizeMultiplier && maxFontSizeMultiplier >= 1 ? Math.min(scale, maxFontSizeMultiplier) : scale
  if (!fontFamily && k === 1) return style
  const flat = k === 1 ? null : StyleSheet.flatten(style)
  return [
    fontFamily ? { fontFamily } : null,
    style,
    flat?.fontSize ? { fontSize: flat.fontSize * k } : null,
    flat?.lineHeight ? { lineHeight: flat.lineHeight * k } : null,
  ]
}

/** react-native's Text in the active skin's font and text size. */
export function Text(props: React.ComponentProps<typeof RNText>): React.ReactNode {
  const style = useTypeStyle(props.style, props.maxFontSizeMultiplier)
  return <RNText {...props} style={style} />
}

/** react-native's TextInput in the active skin's font and text size. */
export function TextInput(props: React.ComponentProps<typeof RNTextInput>): React.ReactNode {
  const style = useTypeStyle(props.style, props.maxFontSizeMultiplier)
  return <RNTextInput {...props} style={style} />
}
