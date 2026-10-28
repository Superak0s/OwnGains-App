import { DARK_COLORS, LIGHT_COLORS, type AppTheme } from "@shared/context/ThemeContext"
import { buildSkin, parseSkin, SkinFormatError } from "../skinFormat"

const theme: AppTheme = { id: "custom-1", name: "Mine", colors: DARK_COLORS }
const home = [
  { id: "a", type: "todayWorkout", size: "large" as const, order: 0, title: "Today" },
  { id: "b", type: "streak", size: "small" as const, order: 1 },
]

describe("skin format", () => {
  it("round-trips buildSkin output with fresh widget ids", () => {
    const parsed = parseSkin(buildSkin(theme, { home }))
    expect(parsed.theme).toEqual(DARK_COLORS)
    expect(parsed.themeName).toBe("Mine")
    expect(parsed.boards.home?.map(({ id: _id, ...w }) => w)).toEqual(home.map(({ id: _id, ...w }) => w))
    expect(parsed.boards.home?.[0].id).not.toBe("a")
    expect(parsed.boards.home?.[0].size).toBe("large")
  })

  it("never puts widget ids in the document", () => {
    expect(JSON.stringify(buildSkin(null, { home }))).not.toContain('"id"')
  })

  it("drops unknown boards and counts them", () => {
    const parsed = parseSkin({ format: 1, boards: { home: [], "future.board": [] } })
    expect(parsed.droppedBoards).toBe(1)
    expect(Object.keys(parsed.boards)).toEqual(["home"])
  })

  it("fills missing colors from the matching fallback palette", () => {
    const dark = parseSkin({ format: 1, theme: { name: "D", colors: { background: "#000000" } } })
    expect(dark.theme?.textMuted).toBe(DARK_COLORS.textMuted)
    const light = parseSkin({ format: 1, theme: { name: "L", colors: { background: "#ffffff", junk: "#fff" } } })
    expect(light.theme?.textMuted).toBe(LIGHT_COLORS.textMuted)
    expect(light.theme).not.toHaveProperty("junk")
  })

  it("rejects bad input with a readable message", () => {
    expect(() => parseSkin({ format: 2 })).toThrow(SkinFormatError)
    expect(() => parseSkin({ format: 1, boards: { home: [{ type: "x", size: "huge", order: 0 }] } })).toThrow(
      /size/,
    )
    expect(() => parseSkin({ format: 1, theme: { name: "x", colors: { accent: "url(evil)" } } })).toThrow(SkinFormatError)
    expect(() => parseSkin({ format: 1 })).toThrow(/theme or widget/)
  })

  it("rejects a skin over 64KB", () => {
    const big = { format: 1, theme: { name: "x".repeat(70_000), colors: {} } }
    expect(() => parseSkin(big)).toThrow(/too large/)
  })
  it("keeps one widget per type on a board", () => {
    const w = (order: number) => ({ type: "streak", size: "small", order })
    expect(parseSkin({ format: 1, boards: { home: [w(0), w(1)] } }).boards.home).toHaveLength(1)
  })
})
