jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

import { Button } from "react-native"
import { act, fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import { useAlert } from "../CustomAlert"

function Retry({ onRetry }: { onRetry: () => void }) {
  const { alert, AlertComponent } = useAlert()
  const show = () =>
    alert("Failed", "Try again?", [
      {
        text: "Retry",
        onPress: () => {
          onRetry()
          show()
        },
      },
    ])
  return (
    <>
      <Button title='Open' onPress={show} />
      {AlertComponent}
    </>
  )
}

describe("useAlert", () => {
  it("keeps buttons working when a button raises an identical alert", async () => {
    const onRetry = jest.fn()
    await renderWithProviders(<Retry onRetry={onRetry} />)
    await act(async () => fireEvent.press(screen.getByText("Open")))
    await act(async () => fireEvent.press(screen.getByLabelText("Retry")))
    await act(async () => fireEvent.press(screen.getByLabelText("Retry")))
    expect(onRetry).toHaveBeenCalledTimes(2)
  })
})
