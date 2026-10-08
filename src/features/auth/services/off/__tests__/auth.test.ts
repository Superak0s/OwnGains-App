import { authService } from "../auth"
import { tokenStorage } from "@shared/services/tokenStorage"
import { kv, resetMemorySqlite } from "test-utils/memorySqlite"

jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { set: jest.fn(async () => {}), get: jest.fn(async () => null), clear: jest.fn(async () => {}) },
}))
jest.mock("@utils/deviceBackup", () => ({
  buildDeviceBackup: jest.fn(async () => ({})),
  deletePhotoFilesFor: jest.fn(async () => {}),
}))

beforeEach(() => {
  resetMemorySqlite()
  jest.clearAllMocks()
})

describe("offline authService", () => {
  it("records consent, strict or not, without reaching the network", async () => {
    globalThis.fetch = jest.fn()
    await expect(authService.recordConsent("3", false, true)).resolves.toBeUndefined()
    await expect(authService.recordConsent("3", true)).resolves.toBeUndefined()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("keeps the profile's height and body-fat settings when the user logs out", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", heightCm: 180, bfFormulaSex: "male" })
    await authService.logout()
    expect(tokenStorage.clear).toHaveBeenCalled()
    expect(JSON.parse(kv["@offline_user"])).toMatchObject({ heightCm: 180, bfFormulaSex: "male" })
  })

  it("renames the existing profile on sign-in instead of replacing its data", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "", heightCm: 170 })
    const result = await authService.signin("renamed", "")
    expect(result.user).toMatchObject({ id: "local", username: "renamed", heightCm: 170 })
  })
})
