import React from "react"
import { fireEvent, screen } from "@testing-library/react-native"
import SignupScreen from "@features/auth/SignupScreen"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { ServerUnreachableError } from "@shared/services/apiError"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "@features/auth/types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("../../../../modules/autofill", () => ({ commitAutofill: jest.fn() }))

const PASSWORD = "Correct-Horse-Battery-9"
const unreachable = new ServerUnreachableError().message

const mount = (signup: jest.Mock) =>
  renderWithProviders(
    <SignupScreen
      navigation={current.navigation as unknown as NativeStackNavigationProp<RootStackParamList, "Signup">}
    />,
    { auth: { signup } },
  )

const fillAndSubmit = async () => {
  await fireEvent.changeText(screen.getByPlaceholderText("Choose a username"), "newbie")
  await fireEvent.changeText(screen.getByPlaceholderText("your.email@example.com"), "New@Example.com ")
  await fireEvent.changeText(screen.getByPlaceholderText("Create a password"), PASSWORD)
  await fireEvent.changeText(screen.getByPlaceholderText("Re-enter your password"), PASSWORD)
  await fireEvent.press(screen.getByLabelText("I am 16 or older and agree to the Terms of Service"))
  await fireEvent.press(screen.getByLabelText("Create account"))
}

describe("SignupScreen", () => {
  it("tells the user the server is unreachable and keeps the typed passwords", async () => {
    const signup = jest.fn(async () => ({ success: false, error: unreachable }))
    await mount(signup)
    await fillAndSubmit()

    expect(await screen.findByText(unreachable)).toBeTruthy()
    expect(signup).toHaveBeenCalledWith("newbie", "new@example.com", PASSWORD, "")
    expect(screen.getByPlaceholderText("Create a password").props.value).toBe(PASSWORD)
  })

  it("shows the server's reason when the username is taken", async () => {
    const signup = jest.fn(async () => ({ success: false, error: "Username already taken" }))
    await mount(signup)
    await fillAndSubmit()

    expect(await screen.findByText("Username already taken")).toBeTruthy()
  })

  it("does not create an account before the age and terms box is ticked", async () => {
    const signup = jest.fn()
    await mount(signup)
    await fireEvent.changeText(screen.getByPlaceholderText("Choose a username"), "newbie")
    await fireEvent.changeText(screen.getByPlaceholderText("your.email@example.com"), "n@example.com")
    await fireEvent.changeText(screen.getByPlaceholderText("Create a password"), PASSWORD)
    await fireEvent.changeText(screen.getByPlaceholderText("Re-enter your password"), PASSWORD)
    await fireEvent.press(screen.getByLabelText("Create account"))

    expect(signup).not.toHaveBeenCalled()
  })
})
