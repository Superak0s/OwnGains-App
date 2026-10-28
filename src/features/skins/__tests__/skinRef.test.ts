import { parseSkinRef } from "../skinRef"

describe("parseSkinRef", () => {
  it.each([
    ["4821", { id: 4821, marketplace: null }],
    [" #4821 ", { id: 4821, marketplace: null }],
    [
      "https://owngains.superak0s.com/marketplace/skins/4821",
      { id: 4821, marketplace: "https://owngains.superak0s.com/marketplace" },
    ],
    [
      `owngains://skin/4821?m=${encodeURIComponent("https://example.com/m")}`,
      { id: 4821, marketplace: "https://example.com/m" },
    ],
    ["owngains://skin/4821", { id: 4821, marketplace: null }],
  ])("parses %s", (input, expected) => {
    expect(parseSkinRef(input)).toEqual(expected)
  })

  it.each(["abc", "0", "", "https://example.com/skins/", "12abc"])("rejects %p", (input) => {
    expect(parseSkinRef(input)).toBeNull()
  })
})
