import React from "react"
import { fireEvent, screen, waitFor } from "@testing-library/react-native"
import SettingsScreen from "@features/settings/SettingsScreen"
import { renderWithProviders, current } from "test-utils/renderWithProviders"
import { user, emptyAccount, program, noPlanSelected } from "test-utils/fixtures"
import { workoutApi } from "@features/workout/services/index"
import { authService } from "@features/auth/services/index"
import { isServerless, setAppMode } from "@shared/services/appMode"
import { restoreDeviceBackup } from "@utils/deviceBackup"
import * as DocumentPicker from "expo-document-picker"
import { ApiError, ServerUnreachableError } from "@shared/services/apiError"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/context/AuthContext", () => require("test-utils/renderWithProviders").authModule)
jest.mock("@shared/context/WorkoutContext", () => require("test-utils/renderWithProviders").workoutModule)
jest.mock("@shared/context/ThemeContext", () => require("test-utils/renderWithProviders").themeModule)
jest.mock("@shared/context/JointSessionContext", () => require("test-utils/renderWithProviders").jointSessionModule)
jest.mock("@react-navigation/native", () => require("test-utils/renderWithProviders").navigationModule)

jest.mock("@features/tutorial/TutorialMenuSheet", () => () => null)

jest.mock("@shared/services/appMode", () => ({
  isServerless: jest.fn(async () => false),
  setAppMode: jest.fn(async () => {}),
  restartOnboarding: jest.fn(async () => {}),
  onAppModeChange: { subscribe: jest.fn(() => () => {}) },
}))
jest.mock("@features/workout/services/index", () => ({
  workoutApi: {
    deleteAllUserData: jest.fn(async () => ({ success: true })),
    getSessionHistoryPage: jest.fn(async () => ({ sessions: [], nextCursor: null })),
    getSessionHistory: jest.fn(async () => []),
    getAllSessions: jest.fn(async () => []),
  },
}))
jest.mock("@features/plan/services/index", () => ({ programApi: {} }))
jest.mock("@features/friends/services", () => ({
  friendsApi: { getBlockedUsers: jest.fn(async () => []) },
}))
jest.mock("@features/auth/services/index", () => ({
  authService: {
    deleteAccount: jest.fn(async () => {}),
    recordConsent: jest.fn(async () => {}),
    exportAccountData: jest.fn(async () => ({})),
    changePassword: jest.fn(async () => {}),
  },
}))
jest.mock("@shared/services/serverVersion", () => ({
  ...jest.requireActual("@shared/services/serverVersion"),
  checkServerVersion: jest.fn(async () => null),
}))
jest.mock("@utils/deviceBackup", () => ({
  ...jest.requireActual("@utils/deviceBackup"),
  restoreDeviceBackup: jest.fn(async () => ({ photosOmitted: 0 })),
}))
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }))
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation(() => ({ text: async () => mockFileText })),
}))

let mockFileText = ""

const deleteAllUserData = workoutApi.deleteAllUserData as jest.Mock
const deleteAccount = authService.deleteAccount as jest.Mock
const recordConsent = authService.recordConsent as jest.Mock
const restore = restoreDeviceBackup as jest.Mock
const pickDocument = DocumentPicker.getDocumentAsync as jest.Mock

const press = (label: string) => fireEvent.press(screen.getByLabelText(label))
const pressText = (text: string) => fireEvent.press(screen.getByText(text))

const mount = (options: Parameters<typeof renderWithProviders>[1] = {}) =>
  renderWithProviders(<SettingsScreen />, {
    auth: { user },
    workout: { workoutData: program, selectedSplit: "ppl" },
    ...options,
  })

beforeEach(() => {
  jest.clearAllMocks()
  ;(isServerless as jest.Mock).mockResolvedValue(false)
  globalThis.fetch = jest.fn(async () => {
    throw new Error("no network in tests")
  }) as jest.Mock
  jest.spyOn(console, "error").mockImplementation(() => {})
  jest.spyOn(console, "warn").mockImplementation(() => {})
})

describe("SettingsScreen mounts with unusual data", () => {
  it.each([
    ["an empty account", { workout: emptyAccount }],
    ["no plan selected", { workout: noPlanSelected }],
    ["no signed-in user", { auth: { user: null } }],
  ])("does not crash on open with %s", async (_name, options) => {
    await mount(options as Parameters<typeof renderWithProviders>[1])
    expect(await screen.findByLabelText("Clear all data")).toBeTruthy()
  })
})

describe("Clear All Data", () => {
  it("deletes nothing when the confirmation is cancelled", async () => {
    await mount()
    await press("Clear all data")
    await press("Cancel")
    expect(deleteAllUserData).not.toHaveBeenCalled()
    expect(current.workout.clearAllData).not.toHaveBeenCalled()
  })

  it("keeps local data and shows the server's reason when the password is wrong", async () => {
    deleteAllUserData.mockRejectedValueOnce(new ApiError("Incorrect password", 401))
    await mount()
    await press("Clear all data")
    await press("Clear")
    await fireEvent.changeText(screen.getByLabelText("Current password to confirm clearing all data"), "nope")
    await pressText("Clear Everything")

    expect(await screen.findByText("Incorrect password")).toBeTruthy()
    expect(deleteAllUserData).toHaveBeenCalledWith("nope")
    expect(current.workout.clearAllData).not.toHaveBeenCalled()
  })

  it("keeps local data when the server answers success: false", async () => {
    deleteAllUserData.mockResolvedValueOnce({ success: false, error: "Server refused" })
    await mount()
    await press("Clear all data")
    await press("Clear")
    await fireEvent.changeText(screen.getByLabelText("Current password to confirm clearing all data"), "pw")
    await pressText("Clear Everything")

    expect(await screen.findByText("Failed to clear all data")).toBeTruthy()
    expect(current.workout.clearAllData).not.toHaveBeenCalled()
  })

  it("clears offline data without asking for a password", async () => {
    ;(isServerless as jest.Mock).mockResolvedValue(true)
    await mount()
    await waitFor(() => expect(screen.queryByLabelText("Withdraw health data consent")).toBeNull())
    await press("Clear all data")
    await press("Clear")

    await waitFor(() => expect(current.workout.clearAllData).toHaveBeenCalled())
    expect(deleteAllUserData).toHaveBeenCalledWith("")
  })
})

describe("Delete Account", () => {
  const openAndSubmit = async (password: string) => {
    await press("Delete my account permanently")
    await fireEvent.changeText(screen.getByLabelText("Current password to confirm account deletion"), password)
    await pressText("Delete Forever")
  }

  it("deletes nothing when the sheet is cancelled", async () => {
    await mount()
    await press("Delete my account permanently")
    const cancels = screen.getAllByLabelText("Cancel")
    await fireEvent.press(cancels[cancels.length - 1])
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(current.auth.logout).not.toHaveBeenCalled()
  })

  it("keeps the session and local data when the server is unreachable", async () => {
    deleteAccount.mockRejectedValueOnce(new ServerUnreachableError())
    await mount()
    await openAndSubmit("pw")

    expect(await screen.findByText(new ServerUnreachableError().message)).toBeTruthy()
    expect(current.workout.clearAllData).not.toHaveBeenCalled()
    expect(current.auth.logout).not.toHaveBeenCalled()
  })

  it("keeps everything when the server rejects the password", async () => {
    deleteAccount.mockRejectedValueOnce(new ApiError("Incorrect password", 401))
    await mount()
    await openAndSubmit("wrong")

    expect(await screen.findByText("Incorrect password")).toBeTruthy()
    expect(deleteAccount).toHaveBeenCalledWith("wrong")
    expect(current.workout.clearAllData).not.toHaveBeenCalled()
  })

  it("does not delete an offline profile until DELETE is typed", async () => {
    ;(isServerless as jest.Mock).mockResolvedValue(true)
    await mount()
    await waitFor(() => expect(screen.queryByLabelText("Withdraw health data consent")).toBeNull())
    await press("Delete my account permanently")
    await pressText("Delete Forever")
    expect(deleteAccount).not.toHaveBeenCalled()
  })
})

describe("Restore Data", () => {
  const backup = { format: "owngains-backup", version: 1, exportedAt: "2026-10-01T10:00:00.000Z", kv: {} }
  const pickFile = (name: string, text: string) => {
    mockFileText = text
    pickDocument.mockResolvedValueOnce({ canceled: false, assets: [{ uri: `file:///${name}`, name }] })
  }

  it("restores nothing when the file picker is cancelled", async () => {
    pickDocument.mockResolvedValueOnce({ canceled: true, assets: null })
    await mount()
    await press("Restore a backup or import a Strength Level CSV")
    expect(restore).not.toHaveBeenCalled()
  })

  it("restores nothing when the merge/replace prompt is cancelled", async () => {
    pickFile("backup.json", JSON.stringify(backup))
    await mount()
    await press("Restore a backup or import a Strength Level CSV")
    await screen.findByText("Restore Backup")
    await press("Cancel")
    expect(restore).not.toHaveBeenCalled()
  })

  it("refuses a truncated backup instead of importing it as CSV", async () => {
    pickFile("backup.json", '{"format":"owngains-backup","kv":{')
    await mount()
    await press("Restore a backup or import a Strength Level CSV")
    expect(await screen.findByText("Damaged Backup")).toBeTruthy()
    expect(restore).not.toHaveBeenCalled()
  })

  it("shows the error and does not restart setup when a replace fails", async () => {
    restore.mockRejectedValueOnce(new Error("disk full"))
    pickFile("backup.json", JSON.stringify(backup))
    await mount()
    await press("Restore a backup or import a Strength Level CSV")
    await screen.findByText("Restore Backup")
    await press("Replace")

    expect(await screen.findByText("Restore Failed")).toBeTruthy()
    expect(restore).toHaveBeenCalledWith(expect.objectContaining({ format: "owngains-backup" }), "replace")
    expect(screen.queryByText("Backup Restored")).toBeNull()
  })
})

describe("Withdraw Health Consent", () => {
  it("does nothing when the confirmation is cancelled", async () => {
    await mount()
    await press("Withdraw health data consent")
    await press("Cancel")
    expect(recordConsent).not.toHaveBeenCalled()
    expect(setAppMode).not.toHaveBeenCalled()
  })

  it("stays online and tells the user nothing was deleted when the server refuses", async () => {
    recordConsent.mockRejectedValueOnce(new ApiError("Not found", 404))
    await mount()
    await press("Withdraw health data consent")
    await press("Withdraw")

    expect(await screen.findByText(/Nothing was deleted/)).toBeTruthy()
    expect(recordConsent).toHaveBeenCalledWith(expect.any(String), false, true)
    expect(setAppMode).not.toHaveBeenCalled()
  })
})
