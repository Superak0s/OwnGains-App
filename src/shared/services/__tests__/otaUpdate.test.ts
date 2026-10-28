const mockUpdates = {
  isEnabled: true,
  setUpdateRequestHeadersOverride: jest.fn(),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
}
const mockDistribution = { GITHUB_BUILD: false }
jest.mock("expo-updates", () => mockUpdates)
jest.mock("@shared/distribution", () => mockDistribution)

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
