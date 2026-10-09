import React from "react"
import { StyleSheet } from "react-native"
import { screen } from "@testing-library/react-native"
import TrainingSummaryTab from "@features/analytics/components/TrainingSummaryTab"
import { renderWithProviders } from "test-utils/renderWithProviders"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

test("period chips stay on one line and the tab adds no horizontal padding of its own", async () => {
  await renderWithProviders(<TrainingSummaryTab />)

  for (const label of ["Last 90 Days", "Last 30 Days", "This Week", "Custom"]) {
    expect(screen.getByText(label).props.numberOfLines).toBe(1)
  }

  let node = screen.getByText("Last 90 Days").parent
  while (node && !StyleSheet.flatten(node.props.style)?.paddingBottom) node = node.parent
  expect(node).toBeTruthy()
  expect(StyleSheet.flatten(node?.props.style)).not.toHaveProperty("paddingHorizontal")
})
