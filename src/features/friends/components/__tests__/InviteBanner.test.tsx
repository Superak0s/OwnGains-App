import { render, screen } from "@testing-library/react-native"
import { StyleSheet } from "react-native"
import { LIGHT_COLORS, contrastRatio } from "@shared/context/ThemeContext"
import { InviteBanner } from "../InviteBanner"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

it("keeps the invite title readable on the light theme background", async () => {
  await render(<InviteBanner invite={{ fromUsername: "sam" }} onAccept={jest.fn()} onDecline={jest.fn()} />)

  const { color } = StyleSheet.flatten(screen.getByText("Joint Session Invite").props.style)

  expect(contrastRatio(color as string, LIGHT_COLORS.background)).toBeGreaterThanOrEqual(4.5)
})
