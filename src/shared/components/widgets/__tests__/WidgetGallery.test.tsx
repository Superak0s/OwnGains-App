import { render, screen } from "@testing-library/react-native"
import WidgetGallery from "@shared/components/widgets/WidgetGallery"

jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))

it("names an untitled widget by its description instead of reading out undefined", async () => {
  await render(
    <WidgetGallery
      visible
      onClose={jest.fn()}
      availableWidgets={[
        { type: "weight", description: "Latest weigh-in", availableSizes: ["medium"], defaultSize: "medium" },
      ]}
      onAddWidget={jest.fn()}
      hasPlacedWidgets={false}
      onEditWidgets={jest.fn()}
    />,
  )

  expect(screen.getByRole("button", { name: "Add widget: Latest weigh-in" })).toBeTruthy()
})
