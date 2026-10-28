import React from "react"
import { BackHandler } from "react-native"
import { render } from "@testing-library/react-native"
import SkinPreviewBanner from "../components/SkinPreviewBanner"

const mockDiscard = jest.fn()

jest.mock("@shared/context/SkinPreviewContext", () => ({
  useSkinPreview: () => ({ active: true, name: "Midnight", skippedWidgets: false, apply: jest.fn(), discard: mockDiscard }),
}))
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock("@shared/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }))
jest.mock("@shared/context/ThemeContext", () => {
  const actual = jest.requireActual("@shared/context/ThemeContext")
  return { ...actual, useTheme: () => ({ colors: actual.LIGHT_COLORS }) }
})

describe("SkinPreviewBanner", () => {
  it("lets the back button navigate instead of discarding the preview", async () => {
    const spy = jest.spyOn(BackHandler, "addEventListener")
    await render(<SkinPreviewBanner />)
    for (const [, handler] of spy.mock.calls) (handler as () => boolean)()
    expect(mockDiscard).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
