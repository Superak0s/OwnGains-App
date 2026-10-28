jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/services/localOnlyFeatures", () => ({
  getLocalOnlyFeatures: async () => ["tracking"],
  describeLocalOnlyFeatures: () => "tracking",
}))

let finishSave: () => void = () => {}
jest.mock("@shared/services/storage", () => ({
  loadFromStorage: async () => null,
  saveToStorage: () => new Promise<void>((resolve) => (finishSave = resolve)),
}))

import { act } from "@testing-library/react-native"
import { renderWithProviders } from "test-utils/renderWithProviders"
import LocalOnlyNotice from "../LocalOnlyNotice"

describe("LocalOnlyNotice", () => {
  it("doesn't start showing after the screen lost focus mid-write", async () => {
    const setTimeoutSpy = jest.spyOn(global, "setTimeout")
    const { unmount } = await renderWithProviders(<LocalOnlyNotice feature='tracking' detail='Stored here.' />)
    unmount()
    await act(async () => finishSave())
    expect(setTimeoutSpy).not.toHaveBeenCalledWith(expect.any(Function), 15_000)
  })
})
