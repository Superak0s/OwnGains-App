jest.mock("@shared/services/sqliteStorage", () => require("test-utils/memorySqlite"))
jest.mock("../crashReporting", () => ({ trackFeature: jest.fn() }))

import { saveToStorage } from "../storage"
import {
  APP_ROLE_KEY,
  effectiveRole,
  getAppRole,
  onAppRoleChange,
  restoreAppRole,
  setAppRole,
} from "../appRole"

describe("appRole", () => {
  it("starts as personal before anything is restored", () => {
    expect(getAppRole()).toBe("personal")
  })

  it("remembers the role per user", async () => {
    await restoreAppRole("u1")
    await setAppRole("trainer")
    await restoreAppRole("u2")
    expect(getAppRole()).toBe("personal")
    await restoreAppRole("u1")
    expect(getAppRole()).toBe("trainer")
  })

  it("tells subscribers about a switch", async () => {
    await restoreAppRole("u3")
    const seen: string[] = []
    const off = onAppRoleChange.subscribe((r) => seen.push(r))
    await setAppRole("trainer")
    off()
    expect(seen).toEqual(["trainer"])
  })

  it("restores a stored value it doesn't know as personal", async () => {
    await saveToStorage(APP_ROLE_KEY, "admin", "u4")
    await restoreAppRole("u4")
    expect(getAppRole()).toBe("personal")
  })

  it("shows the personal app in offline mode without forgetting the choice", () => {
    expect(effectiveRole("trainer", "offline")).toBe("personal")
    expect(effectiveRole("trainer", "online")).toBe("trainer")
    expect(effectiveRole("personal", "online")).toBe("personal")
  })
})
