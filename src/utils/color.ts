export function isValidHex(hex: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(hex)
}

/** Six-digit form of any accepted hex, so channel math never reads #rgb
 *  shorthand or an alpha pair as color data. Null when the input isn't hex. */
export function toRgbHex(hex: string): string | null {
  if (!isValidHex(hex)) return null
  const body = hex.slice(1)
  if (body.length === 3) {
    return `#${body
      .split("")
      .map((c) => c + c)
      .join("")}`
  }
  return `#${body.slice(0, 6)}`
}

function channels(hex: string): [number, number, number] | null {
  const rgb = toRgbHex(hex)
  if (!rgb) return null
  const n = Number.parseInt(rgb.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

export function darken(hex: string, amount = 0.2): string {
  const rgb = channels(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb.map((c) => Math.max(0, Math.trunc(c * (1 - amount))))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`
}

export function isDarkColor(hex: string): boolean {
  const rgb = channels(hex)
  if (!rgb) return false
  const [r, g, b] = rgb
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

function relativeLuminance(hex: string): number {
  const rgb = channels(hex)
  if (!rgb) return 0
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Alpha is
 *  ignored, so an 8-digit hex is rated as if it were fully opaque. */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg)
  const b = relativeLuminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
