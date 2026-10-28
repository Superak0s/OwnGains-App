import React from "react"
import { create, act } from "react-test-renderer"
import { ThemeProvider, useTheme, DARK_COLORS, LIGHT_COLORS } from "../ThemeContext"
import { SkinPreviewProvider, useSkinPreview } from "../SkinPreviewContext"
import { getStorageItem } from "@shared/services/sqliteStorage"
import { loadFromStorage } from "@shared/services/storage"
import type { WidgetInstance } from "@shared/types"

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({ __esModule: true, default: () => "light" }))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

beforeEach(() => require("test-utils/memorySqlite").resetMemorySqlite())

type Grab = { theme: ReturnType<typeof useTheme>; preview: ReturnType<typeof useSkinPreview> }

function Harness({ out }: { out: { current: Grab | null } }) {
  out.current = { theme: useTheme(), preview: useSkinPreview() }
  return null
}

async function mount() {
  const out: { current: Grab | null } = { current: null }
  await act(async () => {
    create(
      <ThemeProvider>
        <SkinPreviewProvider>
          <Harness out={out} />
        </SkinPreviewProvider>
      </ThemeProvider>,
    )
  })
  return out
}

const skinTheme = { id: "preview", name: "Night", colors: { ...DARK_COLORS, accent: "#123456" } }
const board: WidgetInstance[] = [{ id: "w1", type: "streak", size: "large", order: 0 }]

describe("SkinPreviewContext", () => {
  it("shows the skin's colors while previewing and restores them on discard without saving", async () => {
    const out = await mount()
    const before = out.current!.theme.colors
    expect(before).toEqual(LIGHT_COLORS)
    await act(async () => out.current!.preview.start({ name: "Night", theme: skinTheme, boards: { homeWidgets: board } }))
    expect(out.current!.theme.colors.accent).toBe("#123456")
    expect(out.current!.preview).toMatchObject({ active: true, name: "Night" })
    await act(async () => out.current!.preview.discard())
    expect(out.current!.theme.colors).toEqual(before)
    expect(out.current!.preview.active).toBe(false)
    expect(await getStorageItem("app_theme_v1")).toBeNull()
    expect(await loadFromStorage("homeWidgets", "u1")).toBeNull()
  })

  it("saves the theme and boards on apply", async () => {
    const out = await mount()
    await act(async () => out.current!.preview.start({ name: "Night", theme: skinTheme, boards: { homeWidgets: board } }))
    await act(async () => out.current!.preview.apply("u1"))
    expect(out.current!.preview).toMatchObject({ active: false, appliedVersion: 1 })
    expect(out.current!.theme.activeThemeId).toMatch(/^skin-/)
    expect(out.current!.theme.colors.accent).toBe("#123456")
    expect(out.current!.theme.allThemes.some((t) => t.id === out.current!.theme.activeThemeId)).toBe(true)
    expect(await loadFromStorage("homeWidgets", "u1")).toEqual(board)
  })
})
