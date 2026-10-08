import React from "react"
import { fireEvent, screen } from "@testing-library/react-native"
import LoginScreen from "@features/auth/LoginScreen"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { ServerUnreachableError } from "@shared/services/apiError"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "@features/auth/types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("../../../../modules/autofill", () => ({ commitAutofill: jest.fn() }))
jest.mock("@shared/services/lanDiscovery", () => ({ scanForLanServer: jest.fn(async () => null) }))
jest.mock("@shared/services/appMode", () => ({
  getAppMode: jest.fn(async () => "online"),
  onAppModeChange: { subscribe: jest.fn(() => () => {}) },
  restartOnboarding: jest.fn(async () => {}),
}))

const unreachable = new ServerUnreachableError().message

const mount = (signin: jest.Mock) =>
  renderWithProviders(
    <LoginScreen
      navigation={current.navigation as unknown as NativeStackNavigationProp<RootStackParamList, "Login">}
    />,
    { auth: { signin } },
  )

const submit = async (password = "secret") => {
  await fireEvent.changeText(screen.getByPlaceholderText("Enter username or email"), " tester ")
  await fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), password)
  await fireEvent.press(screen.getByLabelText("Sign in"))
}

describe("LoginScreen", () => {
  it("tells the user the server is unreachable instead of blaming the password", async () => {
    const signin = jest.fn(async () => ({ success: false, error: unreachable }))
    await mount(signin)
    await submit()

    expect(await screen.findByText(unreachable)).toBeTruthy()
    expect(screen.queryByText("Invalid username or password")).toBeNull()
    expect(signin).toHaveBeenCalledWith("tester", "secret")
  })

  it("keeps the typed password after a network failure so retrying needs no retyping", async () => {
    const signin = jest.fn(async () => ({ success: false, error: unreachable }))
    await mount(signin)
    await submit("secret")
    await screen.findByText(unreachable)

    expect(screen.getByPlaceholderText("Enter your password").props.value).toBe("secret")
  })

  it("shows the server's own message for a wrong password", async () => {
    const signin = jest.fn(async () => ({ success: false, error: "Wrong password for tester" }))
    await mount(signin)
    await submit("wrong")

    expect(await screen.findByText("Wrong password for tester")).toBeTruthy()
  })

  it("does not call the server with an empty password", async () => {
    const signin = jest.fn()
    await mount(signin)
    await fireEvent.changeText(screen.getByPlaceholderText("Enter username or email"), "tester")
    await fireEvent.press(screen.getByLabelText("Sign in"))

    expect(await screen.findByText("Missing details")).toBeTruthy()
    expect(signin).not.toHaveBeenCalled()
  })
})
