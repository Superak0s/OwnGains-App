import React from "react"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { getSkin, recordDownload } from "../services/marketplace"
import { parseSkin } from "../skinFormat"
import ImportSkinSheet from "../components/ImportSkinSheet"

const mockStart = jest.fn()

jest.mock("../services/marketplace", () => ({
  getSkin: jest.fn(),
  recordDownload: jest.fn(async () => ({})),
  getMarketplaceUrl: jest.fn(async () => "https://owngains.superak0s.com/marketplace"),
  canAuthenticate: jest.fn(async () => false),
}))
jest.mock("@shared/context/SkinPreviewContext", () => ({ useSkinPreview: () => ({ start: mockStart }) }))
jest.mock("@shared/context/ThemeContext", () => {
  const actual = jest.requireActual("@shared/context/ThemeContext")
  return { ...actual, useTheme: () => ({ colors: actual.LIGHT_COLORS }) }
})
jest.mock("@shared/components/ModalSheet", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}))

const detail = (skin: object) => ({
  id: 4821,
  name: "Midnight",
  description: "",
  author: null,
  version: 1,
  hasTheme: true,
  hasBoards: "boards" in skin,
  swatch: ["#000000"],
  downloads: 1200,
  uniqueDownloads: 840,
  rating: { average: 4.5, count: 10 },
  updatedAt: "2026-10-26",
  skin,
  myRating: null,
  url: "https://owngains.superak0s.com/marketplace/skins/4821",
  mine: false,
})
const theme = { name: "Midnight", colors: { background: "#000000", accent: "#123456" } }
const both = { format: 1, theme, boards: { home: [{ type: "streak", size: "large", order: 0 }] } }

beforeEach(() => jest.clearAllMocks())

async function load(skin: object) {
  ;(getSkin as jest.Mock).mockResolvedValue(detail(skin))
  await render(<ImportSkinSheet visible onClose={jest.fn()} />)
  await fireEvent.changeText(screen.getByLabelText("Skin ID or link"), "4821")
  await fireEvent.press(screen.getByText("Load"))
}

describe("ImportSkinSheet", () => {
  it("loads a skin by id and shows its unique downloads", async () => {
    await load(both)
    expect(getSkin).toHaveBeenCalledWith(4821, undefined)
    expect(await screen.findByText("Midnight")).toBeTruthy()
    expect(screen.getByText(/840 unique/)).toBeTruthy()
  })

  it("disables widget layouts for a theme-only skin", async () => {
    await load({ format: 1, theme })
    await screen.findByText("Midnight")
    expect(screen.getByLabelText("Widget layouts").props.disabled).toBe(true)
  })

  it("previews only the chosen parts and counts the download", async () => {
    await load(both)
    await screen.findByText("Midnight")
    await fireEvent(screen.getByLabelText("Widget layouts"), "valueChange", false)
    await fireEvent.press(screen.getByText("Preview"))
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ name: "Midnight", boards: {} }))
    expect(mockStart.mock.calls[0][0].theme.colors.accent).toBe("#123456")
    expect(recordDownload).toHaveBeenCalledWith(4821, undefined)
  })

  it("leaves the Skins screen on preview so the skin can be seen across the app", async () => {
    const onPreviewed = jest.fn()
    await render(<ImportSkinSheet visible onClose={jest.fn()} onPreviewed={onPreviewed} fileSkin={parseSkin(both)} />)
    await fireEvent.press(screen.getByText("Preview"))
    expect(onPreviewed).toHaveBeenCalled()
  })

  it("never counts a download for a skin read from a file", async () => {
    await render(<ImportSkinSheet visible onClose={jest.fn()} fileSkin={parseSkin(both)} />)
    await fireEvent.press(screen.getByText("Preview"))
    expect(mockStart).toHaveBeenCalledWith(expect.objectContaining({ boards: { homeWidgets: expect.any(Array) } }))
    expect(recordDownload).not.toHaveBeenCalled()
  })
})
