const mockUpdates = {
  isEnabled: true,
  setUpdateRequestHeadersOverride: jest.fn(),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}
const mockDistribution = { GITHUB_BUILD: false }
jest.mock("expo-updates", () => mockUpdates)
jest.mock("@shared/distribution", () => mockDistribution)
const mockShowToast = jest.fn()
jest.mock("@shared/components/toast", () => ({ showToast: mockShowToast }))

function load(): typeof import("../otaUpdate") {
  let mod!: typeof import("../otaUpdate")
  jest.isolateModules(() => {
    mod = require("../otaUpdate")
  })
  return mod
}

describe("fetchOtaUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdates.isEnabled = true
    mockDistribution.GITHUB_BUILD = false
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true })
  })

  it("downloads an available update once", async () => {
    const { fetchOtaUpdate } = load()
    await fetchOtaUpdate()
    await fetchOtaUpdate()
    expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1)
    expect(mockUpdates.checkForUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it("tells the user while downloading and when done", async () => {
    await load().fetchOtaUpdate()
    expect(mockShowToast.mock.calls.map(([m]) => m)).toEqual([
      "Downloading app update…",
      "Update downloaded. It installs next time you reopen the app.",
    ])
  })

  it("downloads once when checks overlap", async () => {
    const { fetchOtaUpdate } = load()
    await Promise.all([fetchOtaUpdate(), fetchOtaUpdate()])
    expect(mockUpdates.fetchUpdateAsync).toHaveBeenCalledTimes(1)
  })

  it("keeps the native play channel on Play builds", async () => {
    await load().fetchOtaUpdate()
    expect(mockUpdates.setUpdateRequestHeadersOverride).not.toHaveBeenCalled()
  })

  it("switches GitHub builds to the github channel before checking", async () => {
    mockDistribution.GITHUB_BUILD = true
    await load().fetchOtaUpdate()
    expect(mockUpdates.setUpdateRequestHeadersOverride).toHaveBeenCalledWith({ "expo-channel-name": "github" })
  })

  it("does not download when nothing is newer", async () => {
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false })
    await load().fetchOtaUpdate()
    expect(mockUpdates.fetchUpdateAsync).not.toHaveBeenCalled()
  })

  it("does nothing when expo-updates is disabled", async () => {
    mockUpdates.isEnabled = false
    await load().fetchOtaUpdate()
    expect(mockUpdates.checkForUpdateAsync).not.toHaveBeenCalled()
  })
})

describe("applyOtaOnResume", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockUpdates.isEnabled = true
    mockUpdates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true })
  })

  it("reloads into a downloaded update", async () => {
    const mod = load()
    await mod.fetchOtaUpdate()
    expect(await mod.applyOtaOnResume(false)).toBe(true)
    expect(mockUpdates.reloadAsync).toHaveBeenCalledTimes(1)
  })

  it("waits while a workout is in progress", async () => {
    const mod = load()
    await mod.fetchOtaUpdate()
    mockShowToast.mockClear()
    expect(await mod.applyOtaOnResume(true)).toBe(false)
    await mod.applyOtaOnResume(true)
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled()
    expect(mockShowToast).toHaveBeenCalledTimes(1)
    expect(mockShowToast).toHaveBeenCalledWith("Update pending. It installs after your workout.")
  })

  it("does not reload without a download", async () => {
    expect(await load().applyOtaOnResume(false)).toBe(false)
    expect(mockUpdates.reloadAsync).not.toHaveBeenCalled()
  })
})
