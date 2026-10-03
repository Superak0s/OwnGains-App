import { keyboardLift } from "../ModalSheet"

describe("keyboardLift", () => {
  it("lifts a short sheet by the full keyboard height", () => {
    // sheet 350 tall in an 800 window, keyboard 250 tall
    expect(keyboardLift(250, 800, 350)).toBe(250)
  })

  it("clamps a tall sheet so its header stays on screen", () => {
    // sheet 720 tall in an 800 window can only move up 80
    expect(keyboardLift(250, 800, 720)).toBe(80)
  })

  it("never lifts more than the keyboard height", () => {
    expect(keyboardLift(100, 800, 100)).toBe(100)
  })

  it("returns 0 when the sheet is at least as tall as the window", () => {
    expect(keyboardLift(250, 800, 800)).toBe(0)
  })
})
