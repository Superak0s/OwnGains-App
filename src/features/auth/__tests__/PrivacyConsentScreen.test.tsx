import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import PrivacyConsentScreen from "@features/auth/PrivacyConsentScreen"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { user } from "test-utils/fixtures"
import { kv, resetMemorySqlite } from "test-utils/memorySqlite"
import { authService } from "@features/auth/services"
import { TERMS_VERSION } from "@features/auth/termsAcceptance"
import {
  recordPrivacyConsent,
  setCrashReportingEnabled,
  setTelemetryEnabled,
} from "@shared/services/crashReporting"
import { ServerUnreachableError } from "@shared/services/apiError"
import type { NativeStackNavigationProp } from "@react-navigation/native-stack"
import type { RootStackParamList } from "@shared/types"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)
jest.mock("@shared/services/appMode", () => ({
  getAppModeSync: jest.fn(() => "online"),
  restartOnboarding: jest.fn(async () => {}),
}))
jest.mock("@shared/services/localOnlyFeatures", () => ({
  getServerStoredFeatures: jest.fn(() => []),
}))
jest.mock("@features/auth/services", () => ({
  authService: { recordConsent: jest.fn(async () => {}) },
}))
jest.mock("@shared/services/crashReporting", () => ({
  setCrashReportingEnabled: jest.fn(async () => {}),
  setTelemetryEnabled: jest.fn(async () => {}),
  recordPrivacyConsent: jest.fn(async () => {}),
  captureException: jest.fn(),
  captureUnreported: jest.fn(),
  isCrashReportingEnabled: jest.fn(() => false),
  isTelemetryEnabled: jest.fn(() => false),
  needsDiagnosticsPrompt: jest.fn(() => true),
  recordDiagnosticsPrompt: jest.fn(async () => {}),
}))

const recordConsent = authService.recordConsent as jest.Mock
const onDone = jest.fn()
const press = (label: string | RegExp) => fireEvent.press(screen.getByLabelText(label))
const termsKey = `@terms_acceptance_user_${user.id}`

const mount = () =>
  renderWithProviders(
    <PrivacyConsentScreen
      navigation={current.navigation as unknown as NativeStackNavigationProp<RootStackParamList, "PrivacyConsent">}
      onDone={onDone}
    />,
    { auth: { user } },
  )

beforeEach(() => {
  resetMemorySqlite()
  jest.clearAllMocks()
})

describe("PrivacyConsentScreen", () => {
  it("saves Reject all as both switches off and records terms and health consent", async () => {
    await mount()
    await press("I am 16 or older and agree to the Terms of Service")
    await press(/storing my health-related data/)
    await press("Turn off crash reports and usage metrics, then continue")

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(setCrashReportingEnabled).toHaveBeenCalledWith(false)
    expect(setTelemetryEnabled).toHaveBeenCalledWith(false)
    expect(recordConsent).toHaveBeenCalledWith(TERMS_VERSION, true)
    expect(JSON.parse(kv[termsKey])).toMatchObject({ version: TERMS_VERSION, healthConsent: true })
    expect(recordPrivacyConsent).toHaveBeenCalledWith(String(user.id))
  })

  it("saves Necessary only as crash reports on and usage metrics off", async () => {
    await mount()
    await press("I am 16 or older and agree to the Terms of Service")
    await press(/storing my health-related data/)
    await press("Allow crash reports only, then continue")

    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(setCrashReportingEnabled).toHaveBeenCalledWith(true)
    expect(setTelemetryEnabled).toHaveBeenCalledWith(false)
  })

  it("does not let an online user continue without health consent", async () => {
    await mount()
    await press("I am 16 or older and agree to the Terms of Service")
    await press("Allow crash reports and usage metrics, then continue")

    expect(recordConsent).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
  })

  it("keeps the screen open and stores no acceptance when the server cannot record consent", async () => {
    recordConsent.mockRejectedValueOnce(new ServerUnreachableError())
    await mount()
    await press("I am 16 or older and agree to the Terms of Service")
    await press(/storing my health-related data/)
    await press("Allow crash reports and usage metrics, then continue")

    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy()
    expect(screen.queryByText(/local storage/)).toBeNull()
    expect(onDone).not.toHaveBeenCalled()
    expect(kv[termsKey]).toBeUndefined()
  })

  it("blames device storage, not the server, when saving the diagnostics choice fails", async () => {
    ;(setCrashReportingEnabled as jest.Mock).mockRejectedValueOnce(new Error("database is locked"))
    await mount()
    await press("I am 16 or older and agree to the Terms of Service")
    await press(/storing my health-related data/)
    await press("Allow crash reports and usage metrics, then continue")

    expect(await screen.findByText(/local storage is unreachable/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })
})
