import { keepUnshown, redirectFromHidden } from "../tabConfig"

describe("redirectFromHidden", () => {
  it("moves off an active tab the saved config hides", () => {
    const config = [
      { key: "friends", visible: false },
      { key: "requests", visible: true },
    ]
    expect(redirectFromHidden(config, "friends")).toBe("requests")
    expect(redirectFromHidden(config, "requests")).toBeNull()
  })
})

describe("keepUnshown", () => {
  it("puts saved tabs the bar doesn't show back at their saved position", () => {
    const saved = [
      { key: "a", visible: true },
      { key: "health", visible: false },
      { key: "b", visible: true },
    ]
    const next = [
      { key: "b", visible: true },
      { key: "a", visible: true },
    ]
    expect(keepUnshown(saved, next)).toEqual([
      { key: "b", visible: true },
      { key: "health", visible: false },
      { key: "a", visible: true },
    ])
  })
})
