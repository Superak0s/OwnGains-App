jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(async () => null),
  setStorageItem: jest.fn(async () => undefined),
}))

import { deriveColors } from "../ThemeEditorModal"
import {
  DARK_COLORS,
  LIGHT_COLORS,
} from "@shared/context/ThemeContext"
import { contrastRatio } from "@utils/color"

const fromPreset = (c: typeof LIGHT_COLORS) =>
  deriveColors(c.background, c.surface, c.accent, c.textPrimary)

describe.each([
  ["light", LIGHT_COLORS],
  ["dark", DARK_COLORS],
])("custom theme derived from the %s preset", (_name, preset) => {
  const t = fromPreset(preset)

  it.each(["success", "error", "warning"] as const)(
    "keeps %s readable on the surface",
    (key) => {
      expect(contrastRatio(t[key], t.surface)).toBeGreaterThanOrEqual(3)
    },
  )

  // PermissionRow paints textPrimary straight onto successLight, so the chip
  // backgrounds have to track the background's lightness, not the light preset.
  it.each(["successLight", "errorLight", "warningLight"] as const)(
    "keeps body text readable on the %s chip",
    (key) => {
      expect(contrastRatio(t.textPrimary, t[key])).toBeGreaterThanOrEqual(4.5)
    },
  )
})

describe("invalid input", () => {
  it("falls back to the matching preset instead of emitting bad hex", () => {
    const t = deriveColors("nope", "", "#zz", "#12")
    expect(t.background).toBe(LIGHT_COLORS.background)
    expect(t.surface).toBe(LIGHT_COLORS.surface)
    expect(t.accent).toBe(LIGHT_COLORS.accent)
    expect(t.textPrimary).toBe(LIGHT_COLORS.textPrimary)
  })

  it("still derives a dark palette when only the background parses", () => {
    const t = deriveColors(DARK_COLORS.background, "junk", "junk", "junk")
    expect(t.surface).toBe(DARK_COLORS.surface)
    expect(t.success).toBe(DARK_COLORS.success)
  })
})
