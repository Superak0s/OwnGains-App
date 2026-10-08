jest.mock("@shared/services/sqliteStorage", () => ({
  ...require("test-utils/memorySqlite"),
  clearUserData: jest.fn(async () => {}),
}))
jest.mock("@shared/services/tokenStorage", () => ({
  tokenStorage: { set: jest.fn(async () => {}), get: jest.fn(async () => null), clear: jest.fn(async () => {}) },
}))
jest.mock("@utils/deviceBackup", () => ({
  buildDeviceBackup: jest.fn(async () => ({})),
  deletePhotoFilesFor: jest.fn(async () => {}),
}))

type AuthModule = typeof import("../auth")
let authService: AuthModule["authService"]
let tokenStorage: { set: jest.Mock; get: jest.Mock; clear: jest.Mock }
let sqlite: { clearUserData: jest.Mock }
let kv: Record<string, string>
let backup: { buildDeviceBackup: jest.Mock; deletePhotoFilesFor: jest.Mock }

const storedProfile = () => JSON.parse(kv["@offline_user"])

// The service caches the profile at module level, so each test loads a fresh copy.
beforeEach(() => {
  jest.isolateModules(() => {
    kv = require("test-utils/memorySqlite").kv
    authService = require("../auth").authService
    tokenStorage = require("@shared/services/tokenStorage").tokenStorage
    sqlite = require("@shared/services/sqliteStorage")
    backup = require("@utils/deviceBackup")
  })
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
    expect(storedProfile()).toMatchObject({ heightCm: 180, bfFormulaSex: "male" })
  })

  it("renames the existing profile on sign-in instead of replacing its data", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "", heightCm: 170 })
    const result = await authService.signin("renamed", "")
    expect(result.user).toMatchObject({ id: "local", username: "renamed", heightCm: 170 })
    expect(storedProfile().username).toBe("renamed")
  })

  it("keeps the profile name when sign-in is submitted with an empty name", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    const result = await authService.signin("", "")
    expect(result.user?.username).toBe("me")
  })

  it("creates a profile and a session on first sign-in with no stored profile", async () => {
    const result = await authService.signin("newbie", "")
    expect(result).toMatchObject({ success: true, user: { id: "local", username: "newbie", email: "" } })
    expect(storedProfile().username).toBe("newbie")
    expect(tokenStorage.set).toHaveBeenCalledWith(expect.stringMatching(/^offline/))
  })

  it("stores the signup profile under the local id and leaves out a missing name", async () => {
    const result = await authService.signup("tester", "t@example.com", "pw")
    expect(result.success).toBe(true)
    expect(storedProfile()).toEqual({ id: "local", username: "tester", email: "t@example.com" })
    expect(tokenStorage.set).toHaveBeenCalled()
  })

  it("rejects getCurrentUser when there is no local profile, so boot sends the user to login", async () => {
    await expect(authService.getCurrentUser()).rejects.toThrow("No local profile found")
  })

  it("treats a corrupt stored profile as no profile instead of crashing boot", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {})
    kv["@offline_user"] = "{not json"
    await expect(authService.getStoredUser()).resolves.toBeNull()
  })

  it("merges a profile update into the stored profile and never stores the current password", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "", heightCm: 170 })
    const updated = await authService.updateProfile({ name: "Me", currentPassword: "secret" })
    expect(updated).toMatchObject({ username: "me", name: "Me", heightCm: 170 })
    expect(kv["@offline_user"]).not.toContain("secret")
    await expect(authService.getCurrentUser()).resolves.toMatchObject({ name: "Me" })
  })

  it("creates a default profile when updating with none stored", async () => {
    await authService.updateProfile({ heightCm: 182 })
    expect(storedProfile()).toEqual({ id: "local", username: "me", email: "", heightCm: 182 })
  })

  it("reports signed in from the session token, not from the profile row", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    tokenStorage.get.mockResolvedValueOnce(null)
    await expect(authService.isAuthenticated()).resolves.toBe(false)
    tokenStorage.get.mockResolvedValueOnce("offline_1")
    await expect(authService.isAuthenticated()).resolves.toBe(true)
  })

  it("deletes photo files before the rows that reference them, then the profile and session", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    await authService.getStoredUser()

    await authService.deleteAccount("")

    expect(backup.deletePhotoFilesFor).toHaveBeenCalledWith("local")
    expect(backup.deletePhotoFilesFor.mock.invocationCallOrder[0]).toBeLessThan(
      sqlite.clearUserData.mock.invocationCallOrder[0],
    )
    expect(kv["@offline_user"]).toBeUndefined()
    expect(tokenStorage.clear).toHaveBeenCalled()
    await expect(authService.getStoredUser()).resolves.toBeNull()
  })

  it("keeps the profile when deleting photo files fails", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    backup.deletePhotoFilesFor.mockRejectedValueOnce(new Error("disk"))
    await expect(authService.deleteAccount("")).rejects.toThrow("disk")
    expect(sqlite.clearUserData).not.toHaveBeenCalled()
    expect(kv["@offline_user"]).toBeDefined()
  })

  it("refuses a password change for an offline profile", async () => {
    await expect(authService.changePassword("a", "b")).rejects.toThrow("not password protected")
  })

  it("includes the profile in the account export", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    await authService.exportAccountData()
    expect(backup.buildDeviceBackup).toHaveBeenCalledWith("local", { profile: expect.objectContaining({ username: "me" }) })
  })

  it("issues no new session token when there is no profile to refresh", async () => {
    await expect(authService.refreshToken()).resolves.toBeNull()
    expect(tokenStorage.set).not.toHaveBeenCalled()
  })

  it("issues and stores a new session token for an existing profile", async () => {
    kv["@offline_user"] = JSON.stringify({ id: "local", username: "me", email: "" })
    const token = await authService.refreshToken()
    expect(token).toMatch(/^offline/)
    expect(tokenStorage.set).toHaveBeenCalledWith(token)
  })
})
