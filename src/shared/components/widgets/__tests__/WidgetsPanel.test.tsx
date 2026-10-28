import { StyleSheet, Text } from "react-native"
import { fireEvent, render, screen } from "@testing-library/react-native"
import WidgetsPanel from "@shared/components/widgets/WidgetsPanel"
import type { WidgetDefinition, WidgetInstance } from "@shared/types"

jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

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

it("shows a placed widget's own name, icon and subtitle over the registry defaults", async () => {
  const titled = { chart: { ...registry.chart, title: "Chart", icon: "📈" } }
  await render(
    <WidgetsPanel
      widgets={[{ id: "c", type: "chart", size: "medium", order: 0, title: "Bench", icon: "🏋", subtitle: "Last 8 weeks" }]}
      editMode={false}
      onCycleSize={jest.fn()}
      onRemove={jest.fn()}
      onReorder={jest.fn()}
      registry={titled}
      renderContent={() => null}
    />,
  )
  expect(screen.getByText("Bench")).toBeTruthy()
  expect(screen.getByText("🏋")).toBeTruthy()
  expect(screen.getByText("Last 8 weeks")).toBeTruthy()
  expect(screen.queryByText("Chart")).toBeNull()
})

it("saves what the user types in the customize sheet", async () => {
  const onCustomize = jest.fn()
  await render(
    <WidgetsPanel
      widgets={[{ id: "c", type: "chart", size: "medium", order: 0 }]}
      editMode
      onCycleSize={jest.fn()}
      onRemove={jest.fn()}
      onReorder={jest.fn()}
      onCustomize={onCustomize}
      registry={registry}
      renderContent={() => null}
    />,
  )
  await fireEvent.press(screen.getByLabelText("Customize widget"))
  await fireEvent.changeText(screen.getByLabelText("Name"), "Squat")
  await fireEvent.press(screen.getByText("Save"))
  expect(onCustomize).toHaveBeenCalledWith("c", { title: "Squat", icon: undefined, subtitle: undefined })
})
