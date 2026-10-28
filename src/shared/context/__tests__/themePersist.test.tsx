import { create, act } from "react-test-renderer"
import { ThemeProvider, useTheme, DARK_COLORS } from "../ThemeContext"
import { getStorageItem } from "@shared/services/sqliteStorage"

jest.mock("react-native/Libraries/Utilities/useColorScheme", () => ({ __esModule: true, default: () => "light" }))
jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))

beforeEach(() => require("test-utils/memorySqlite").resetMemorySqlite())

function Harness({ out }: { out: { current: ReturnType<typeof useTheme> | null } }) {
  out.current = useTheme()
  return null
}

describe("ThemeProvider persistence", () => {
  it("keeps a saved theme when it is selected right after, from the same render", async () => {
    const out: { current: ReturnType<typeof useTheme> | null } = { current: null }
    await act(async () => {
      create(
        <ThemeProvider>
          <Harness out={out} />
        </ThemeProvider>,
      )
    })
    const { saveCustomTheme, setTheme } = out.current!
    const theme = { id: "custom-1", name: "Mine", colors: DARK_COLORS }

    await act(async () => {
      await saveCustomTheme(theme)
      await setTheme(theme.id)
    })

    const stored = JSON.parse((await getStorageItem("app_theme_v1"))!)
    expect(stored.activeThemeId).toBe("custom-1")
    expect(stored.customThemes.map((t: { id: string }) => t.id)).toEqual(["custom-1"])
  })
})
