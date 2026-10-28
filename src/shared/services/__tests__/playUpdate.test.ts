jest.mock("sp-react-native-in-app-updates", () => ({
  __esModule: true,
  default: jest.fn(),
  IAUUpdateKind: { IMMEDIATE: 1 },
}))
jest.mock("../apiClient", () => ({ apiCall: jest.fn() }))
jest.mock("../appMode", () => ({ isServerless: jest.fn() }))

import { apiCall } from "../apiClient"
import { isServerless } from "../appMode"
import { forcePlayUpdate } from "../playUpdate"

const fake = (shouldUpdate: boolean) => ({
  checkNeedsUpdate: jest.fn().mockResolvedValue({ shouldUpdate }),
  startUpdate: jest.fn().mockResolvedValue(undefined),
})

describe("forcePlayUpdate", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(isServerless as jest.Mock).mockResolvedValue(false)
    ;(apiCall as jest.Mock).mockResolvedValue({ minAppVersion: "0.6.0" })
  })

  it("starts an immediate update when below the server minimum and Play has one", async () => {
    const u = fake(true)
    await forcePlayUpdate("0.5.1", u as never)
    expect(u.startUpdate).toHaveBeenCalledWith({ updateType: 1 })
  })

  it("does nothing when the server sets no minimum", async () => {
    ;(apiCall as jest.Mock).mockResolvedValue({})
    const u = fake(true)
    await forcePlayUpdate("0.5.1", u as never)
    expect(u.checkNeedsUpdate).not.toHaveBeenCalled()
  })

  it("does nothing when at or above the minimum", async () => {
    const u = fake(true)
    await forcePlayUpdate("0.6.0", u as never)
    expect(u.checkNeedsUpdate).not.toHaveBeenCalled()
  })

  it("does nothing when Play has no newer version", async () => {
    const u = fake(false)
    await forcePlayUpdate("0.5.1", u as never)
    expect(u.startUpdate).not.toHaveBeenCalled()
  })

  it("does nothing offline", async () => {
    ;(isServerless as jest.Mock).mockResolvedValue(true)
    const u = fake(true)
    await forcePlayUpdate("0.5.1", u as never)
    expect(apiCall).not.toHaveBeenCalled()
  })
})
