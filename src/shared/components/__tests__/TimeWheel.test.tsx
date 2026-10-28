jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

import { fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import TimeWheel, { settledIndex } from "../TimeWheel"

const at = (h: number, m: number) => new Date(2026, 9, 21, h, m, 0, 0)
const scrollEnd = (column: "hours" | "minutes", y: number) =>
  fireEvent(screen.getByTestId(`time-wheel-${column}`), "momentumScrollEnd", {
    nativeEvent: { contentOffset: { x: 0, y } },
  })

describe("settledIndex", () => {
  it("rounds to the nearest row and clamps to the column", () => {
    expect(settledIndex(59, 24)).toBe(1)
    expect(settledIndex(61, 24)).toBe(2)
    expect(settledIndex(-30, 24)).toBe(0)
    expect(settledIndex(5000, 24)).toBe(23)
  })
})

describe("TimeWheel", () => {
  it("sets the hour and keeps the minutes when the hour column settles", async () => {
    const onChange = jest.fn()
    await renderWithProviders(<TimeWheel value={at(8, 30)} onChange={onChange} />)
    scrollEnd("hours", 21 * 40)
    expect(onChange).toHaveBeenCalledWith(at(21, 30))
  })

  it("sets minutes in 5-minute steps", async () => {
    const onChange = jest.fn()
    await renderWithProviders(<TimeWheel value={at(8, 0)} onChange={onChange} />)
    scrollEnd("minutes", 9 * 40)
    expect(onChange).toHaveBeenCalledWith(at(8, 45))
  })

  it("saves the shown minute when the hour changes on an off-step time", async () => {
    const onChange = jest.fn()
    await renderWithProviders(<TimeWheel value={at(8, 3)} onChange={onChange} />)
    scrollEnd("hours", 9 * 40)
    expect(onChange).toHaveBeenCalledWith(at(9, 5))
  })

  it("does not report a change when the column settles on the current time", async () => {
    const onChange = jest.fn()
    await renderWithProviders(<TimeWheel value={at(8, 0)} onChange={onChange} />)
    scrollEnd("hours", 8 * 40)
    expect(onChange).not.toHaveBeenCalled()
  })
})
