import React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { canAuthenticate, publishSkin } from "../services/marketplace"
import PublishSkinSheet from "../components/PublishSkinSheet"

jest.mock("../services/marketplace", () => ({
  canAuthenticate: jest.fn(async () => true),
  getMarketplaceUrl: jest.fn(async () => "https://owngains.superak0s.com/marketplace"),
  DEFAULT_MARKETPLACE_URL: "https://owngains.superak0s.com/marketplace",
  publishSkin: jest.fn(async () => ({ id: 7, url: "https://owngains.superak0s.com/marketplace/skins/7" })),
  updateSkin: jest.fn(),
}))
jest.mock("@shared/services/storage", () => {
  const actual = jest.requireActual("@shared/services/storage")
  const layout = [{ id: "w", type: "streak", size: "small", order: 0 }]
  return {
    ...actual,
    loadFromStorage: jest.fn(async (key: string) =>
      [actual.STORAGE_KEYS.HOME_WIDGETS, actual.STORAGE_KEYS.PLAN_WIDGETS, actual.STORAGE_KEYS.WORKOUT_WIDGETS].includes(key)
        ? layout
        : null,
    ),
  }
})
jest.mock("@shared/context/AuthContext", () => ({ useAuth: () => ({ user: { id: 1 } }) }))
jest.mock("@shared/context/ThemeContext", () => {
  const actual = jest.requireActual("@shared/context/ThemeContext")
  return {
    ...actual,
    useTheme: () => ({
      colors: actual.LIGHT_COLORS,
      theme: { id: "previewed", name: "Theirs", colors: actual.DARK_COLORS },
      savedTheme: { id: "x", name: "Mine", colors: actual.LIGHT_COLORS },
    }),
  }
})
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}))

beforeEach(() => jest.clearAllMocks())

const publishButton = () => screen.getByRole("button", { name: "Publish" })

describe("PublishSkinSheet", () => {
  it("stays disabled until it has a name and something to share", async () => {
    await render(<PublishSkinSheet visible onClose={jest.fn()} />)
    await screen.findByLabelText("Home")
    expect(publishButton().props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(screen.getByLabelText("Skin name"), "Night")
    expect(publishButton().props.accessibilityState.disabled).toBe(true)
    await fireEvent(screen.getByLabelText("Include my theme"), "valueChange", true)
    expect(publishButton().props.accessibilityState.disabled).toBe(false)
  })

  it("sends exactly the boards that were checked", async () => {
    await render(<PublishSkinSheet visible onClose={jest.fn()} />)
    await fireEvent.changeText(await screen.findByLabelText("Skin name"), "Night")
    await fireEvent(await screen.findByLabelText("Home"), "valueChange", true)
    await fireEvent(screen.getByLabelText("Plan"), "valueChange", true)
    await fireEvent.press(publishButton())
    const body = (publishSkin as jest.Mock).mock.calls[0][0]
    expect(Object.keys(body.skin.boards).sort()).toEqual(["home", "plan"])
    expect(body.skin.theme).toBeUndefined()
    expect(await screen.findByText(/skins\/7/)).toBeTruthy()
  })

  it("shares the user's own theme, not a skin being previewed", async () => {
    await render(<PublishSkinSheet visible onClose={jest.fn()} />)
    await fireEvent.changeText(await screen.findByLabelText("Skin name"), "Night")
    await fireEvent(screen.getByLabelText("Include my theme"), "valueChange", true)
    await fireEvent.press(publishButton())
    const { theme } = (publishSkin as jest.Mock).mock.calls[0][0].skin
    expect(theme.name).toBe("Mine")
  })

  it("asks to sign in instead of offering Publish without an account", async () => {
    ;(canAuthenticate as jest.Mock).mockResolvedValue(false)
    await render(<PublishSkinSheet visible onClose={jest.fn()} />)
    expect(await screen.findByText("Sign in to the official server to publish and rate skins.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull()
  })
})
