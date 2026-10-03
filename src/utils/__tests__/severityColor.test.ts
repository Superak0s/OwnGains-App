import { getSeverityColor } from "../severityColor";

describe("getSeverityColor", () => {
  it.each([
    [0, "#6BCB77"],
    [2, "#6BCB77"],
    [3, "#FFD93D"],
    [4, "#FFD93D"],
    [5, "#FFA94D"],
    [6, "#FFA94D"],
    [7, "#FF8787"],
    [8, "#FF8787"],
    [9, "#FF6B6B"],
    [10, "#FF6B6B"],
  ])("maps %i to %s across five bands", (value, color) => {
    expect(getSeverityColor(value)).toBe(color);
    expect(getSeverityColor(value, 5)).toBe(color);
  });

  it.each([
    [0, "#6BCB77"],
    [3, "#6BCB77"],
    [4, "#FFD93D"],
    [6, "#FFD93D"],
    [7, "#FF6B6B"],
    [10, "#FF6B6B"],
  ])("maps %i to %s across three bands", (value, color) => {
    expect(getSeverityColor(value, 3)).toBe(color);
  });
});
