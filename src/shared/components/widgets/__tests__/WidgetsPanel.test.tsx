import { StyleSheet, Text } from "react-native"
import { render, screen } from "@testing-library/react-native"
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel"
import type { WidgetDefinition, WidgetInstance } from "@shared/types"

jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

const registry: Record<"chart", WidgetDefinition<"chart">> = {
  chart: {
    type: "chart",
    description: "",
    availableSizes: ["medium", "large"],
    defaultSize: "medium",
  },
}

const cardMinHeight = (id: string): number => {
  const card = screen.getByText(id).parent?.parent
  return StyleSheet.flatten(card?.props.style).minHeight as number
}

it("makes a large card taller than a medium card's 220px chart content", async () => {
  const widgets: WidgetInstance<"chart">[] = [
    { id: "m", type: "chart", size: "medium", order: 0 },
    { id: "l", type: "chart", size: "large", order: 1 },
  ]
  await render(
    <WidgetsPanel
      widgets={widgets}
      editMode={false}
      onCycleSize={jest.fn()}
      onRemove={jest.fn()}
      onReorder={jest.fn()}
      registry={registry}
      renderContent={(w) => <Text>{w.id}</Text>}
    />,
  )
  expect(cardMinHeight("l")).toBeGreaterThan(220 + 40 + 30)
  expect(cardMinHeight("l")).toBeGreaterThan(cardMinHeight("m"))
})
