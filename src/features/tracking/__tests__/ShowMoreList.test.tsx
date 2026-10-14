import { Text } from "react-native"
import { fireEvent, render, screen } from "@testing-library/react-native"
import { ShowMoreList } from "../ui"

jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

const items = [
  { day: "Today", ml: 250 },
  { day: "Today", ml: 500 },
  { day: "Yesterday", ml: 300 },
]

const renderList = () =>
  render(
    <ShowMoreList
      items={items}
      collapsible
      groupBy={(i) => i.day}
      groupMeta={(day) => `${day.reduce((s, i) => s + i.ml, 0)} ml`}
      renderItem={(i) => <Text>{`${i.ml} entry`}</Text>}
    />,
  )

it("starts with every day collapsed and shows its count and total", async () => {
  await renderList()
  expect(screen.queryByText("250 entry")).toBeNull()
  expect(screen.getByText("2 entries · 750 ml")).toBeTruthy()
  expect(screen.getByText("1 entry · 300 ml")).toBeTruthy()
})

it("expands and collapses one day at a time", async () => {
  await renderList()
  await fireEvent.press(screen.getByText("Today"))
  expect(screen.getByText("250 entry")).toBeTruthy()
  expect(screen.getByText("500 entry")).toBeTruthy()
  expect(screen.queryByText("300 entry")).toBeNull()
  await fireEvent.press(screen.getByText("Today"))
  expect(screen.queryByText("250 entry")).toBeNull()
})
