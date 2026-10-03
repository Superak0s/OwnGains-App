import { moveWidget } from "../moveWidget"
import type { WidgetInstance, WidgetSize } from "@shared/types"

type Kind = "k"

const board = (spec: string): WidgetInstance<Kind>[] =>
  spec.split(" ").map((token, index) => {
    const [id, size] = token.split(":")
    return {
      id,
      type: "k" as Kind,
      size: (size === "L" ? "large" : "small") as WidgetSize,
      order: index,
    }
  })

const allSmall = board("a:S b:S c:S d:S")

describe("moveWidget", () => {
  it("swaps half-width neighbours within their row", () => {
    expect(moveWidget(allSmall, "a", "right")).toEqual(["b", "a", "c", "d"])
    expect(moveWidget(allSmall, "d", "left")).toEqual(["a", "b", "d", "c"])
  })

  it("keeps the column when moving between rows", () => {
    expect(moveWidget(allSmall, "d", "up")).toEqual(["a", "d", "b", "c"])
    expect(moveWidget(allSmall, "a", "down")).toEqual(["b", "c", "a", "d"])
  })

  it("refuses moves off the edge of the grid", () => {
    expect(moveWidget(allSmall, "a", "left")).toBeNull()
    expect(moveWidget(allSmall, "a", "up")).toBeNull()
    expect(moveWidget(allSmall, "b", "right")).toBeNull()
    expect(moveWidget(allSmall, "d", "down")).toBeNull()
  })

  it("treats full-width widgets as a row of their own", () => {
    const mixed = board("a:S b:L c:S d:S")
    expect(moveWidget(mixed, "a", "down")).toEqual(["b", "a", "c", "d"])
    expect(moveWidget(mixed, "d", "up")).toEqual(["a", "d", "b", "c"])
    expect(moveWidget(mixed, "b", "left")).toBeNull()
  })

  it("returns null for an unknown id", () => {
    expect(moveWidget(allSmall, "zz", "up")).toBeNull()
  })
})
