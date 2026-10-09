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

let mockOfficial = false
jest.mock("@shared/services/config", () => ({
  ...jest.requireActual("@shared/services/config"),
  isOfficialServer: () => mockOfficial,
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

  describe("Continue with Google", () => {
    beforeEach(() => {
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = "web-client"
    })
    afterEach(() => {
      mockOfficial = false
      delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    })

    it("is offered on the official server", async () => {
      mockOfficial = true
      await mount(jest.fn())
      expect(screen.getByLabelText("Continue with Google")).toBeTruthy()
    })

    it("is hidden on any other server", async () => {
      await mount(jest.fn())
      expect(screen.queryByLabelText("Continue with Google")).toBeNull()
    })

    it("is hidden on the official server when the build has no client ID", async () => {
      mockOfficial = true
      delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      await mount(jest.fn())
      expect(screen.queryByLabelText("Continue with Google")).toBeNull()
    })
  })
})
