jest.mock("@shared/services/sqliteStorage", () => ({
  getStorageItemSync: jest.fn(() => null),
  setStorageErrorHandler: jest.fn(),
  getStorageItem: jest.fn(async () => null),
  setStorageItem: jest.fn(async () => undefined),
}));

import { isDarkColor, FALLBACK_COLORS } from "../ThemeContext";

describe("isDarkColor", () => {
  it("classifies the built-in theme backgrounds", () => {
    expect(isDarkColor("#000000")).toBe(true);
    expect(isDarkColor("#801c1c")).toBe(true);
    expect(isDarkColor("#f5f5f5")).toBe(false);
    expect(isDarkColor("#fde06a")).toBe(false);
    expect(isDarkColor("#b2f1a1")).toBe(false);
  });

  it("uses luminance, not lexical order", () => {
    expect(isDarkColor("#0000ff")).toBe(true);
    expect(isDarkColor("#ffff00")).toBe(false);
  });

  it("handles shorthand and malformed input", () => {
    expect(isDarkColor("#000")).toBe(true);
    expect(isDarkColor("#fff")).toBe(false);
    expect(isDarkColor("nope")).toBe(false);
  });
});

import themes from "../themes.json";
import { contrastRatio as contrast } from "@utils/color";

// Bright, high-nit phone screens wash out low-contrast pairs, so every built-in
// palette has to meet these minimums, even if it looks fine on a dim emulator.
const PAIRS: Array<[string, string, number]> = [
  ["textPrimary", "background", 7],
  ["textPrimary", "surface", 7],
  ["textPrimary", "surfaceElevated", 7],
  ["textPrimary", "inputBackground", 7],
  ["textPrimary", "badgeBackground", 7],
  ["textSecondary", "surface", 4.5],
  ["textSecondary", "background", 4.5],
  ["textMuted", "surface", 4.5],
  ["textMuted", "background", 4.5],
  ["textOnAccent", "accent", 4.5],
  ["textOnAccent", "error", 4.5],
  ["accent", "surface", 3],
  ["accent", "background", 3],
  ["success", "surface", 3],
  ["error", "surface", 3],
  ["warning", "surface", 3],
  ["info", "surface", 3],
  ["surfaceBorder", "surface", 1.5],
  ["inputBorder", "inputBackground", 1.5],
  ["separator", "background", 1.15],
];

const PALETTES: Array<readonly [string, Record<string, string>]> = [
  ...themes.map((t) => [t.id, t.colors] as const),
  ["fallback", FALLBACK_COLORS as unknown as Record<string, string>] as const,
];

describe.each(PALETTES)(
  "theme %s contrast",
  (_id, colors: Record<string, string>) => {
    it.each(PAIRS)("%s on %s is at least %s:1", (fg, bg, min) => {
      expect(contrast(colors[fg], colors[bg])).toBeGreaterThanOrEqual(min);
    });
  },
);
