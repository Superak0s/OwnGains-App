import fs from "fs";
import path from "path";
import { ANCHOR_IDS } from "../anchors";
import { CHAPTERS } from "../chapters";

const ROOT = path.resolve(__dirname, "../../../..");
const files: string[] = [path.join(ROOT, "App.tsx")];
const walk = (dir: string) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "__tests__") walk(full);
    else if (/\.tsx?$/.test(entry.name)) files.push(full);
  }
};
walk(path.join(ROOT, "src"));
const source = files.map((f) => fs.readFileSync(f, "utf8")).join("\n");

it("every anchor id is registered on a real control", () => {
  const missing = ANCHOR_IDS.filter((id) => !source.includes(`tutorialAnchor("${id}")`));
  expect(missing).toEqual([]);
});

it("tab anchors are registered by the tab bar", () => {
  expect(source).toContain("tutorialAnchor(`tab.${");
});

it("every spotlight in the script uses a registered id", () => {
  const known = new Set<string>(ANCHOR_IDS);
  const used = Object.values(CHAPTERS).flatMap((c) =>
    c.steps.flatMap((s) => (s.kind === "spotlight" ? [s.anchor] : [])),
  );
  expect(used.filter((id) => !id.startsWith("tab.") && !known.has(id))).toEqual([]);
});
