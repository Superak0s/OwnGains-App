jest.mock("@shared/services/sqliteStorage", () =>
  require("test-utils/memorySqlite"),
);

import { getStorageItem } from "@shared/services/sqliteStorage";
import {
  Guide,
  guidesForImage,
  parseGuides,
  saveGuides,
} from "../exerciseGuides";

const guide = (over: Partial<Guide> = {}): Guide => ({
  id: "g1",
  axis: "h",
  pos: 0.5,
  color: "#FFF",
  dashed: false,
  opacity: 1,
  width: 2,
  scope: 0,
  ...over,
});

describe("parseGuides", () => {
  it("drops malformed entries and non-arrays", () => {
    expect(parseGuides(null)).toEqual([]);
    expect(parseGuides("not json")).toEqual([]);
    expect(parseGuides('{"axis":"h"}')).toEqual([]);
    expect(
      parseGuides(
        JSON.stringify([
          guide(),
          { ...guide(), axis: "z" },
          { ...guide(), pos: 2 },
        ]),
      ),
    ).toEqual([guide()]);
  });

  it("defaults the thickness of guides saved before it existed", () => {
    const { width: _width, ...legacy } = guide();
    expect(parseGuides(JSON.stringify([legacy]))).toEqual([guide()]);
  });
});

describe("guidesForImage", () => {
  it("keeps guides scoped to the image plus the shared ones", () => {
    const own = guide({ id: "own", scope: 1 });
    const other = guide({ id: "other", scope: 0 });
    const shared = guide({ id: "shared", scope: "all" });
    expect(guidesForImage([own, other, shared], 1)).toEqual([own, shared]);
  });
});

describe("saveGuides", () => {
  it("round-trips through storage", async () => {
    await saveGuides("Bench_Press", [guide({ dashed: true, opacity: 0.4 })]);
    expect(
      parseGuides(await getStorageItem("exercise_guides:Bench_Press")),
    ).toEqual([guide({ dashed: true, opacity: 0.4 })]);
  });
});
