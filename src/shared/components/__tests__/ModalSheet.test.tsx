jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)

import { fireEvent, screen } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import ModalSheet from "../ModalSheet"

describe("ModalSheet confirm", () => {
  it("still confirms after the previous confirm threw", async () => {
    const onConfirm = jest
      .fn()
      .mockImplementationOnce(() => {
        throw new Error("boom")
      })
      .mockImplementation(() => {})
    await renderWithProviders(
      <ModalSheet visible onClose={jest.fn()} confirmText='Save' onConfirm={onConfirm} />,
    )
    fireEvent.press(screen.getByText("Save"))
    fireEvent.press(screen.getByText("Save"))
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})
