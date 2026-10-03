jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: jest.fn(),
    runSync: jest.fn(),
    getAllSync: jest.fn(() => []),
    getFirstSync: jest.fn(() => null),
  }),
}));

import fs from "fs";
import path from "path";

// The on/off dispatch split only works if both versions expose the same
// exports. dispatchProxy routes by name, so an export present in one and
// missing in the other fails silently at runtime in exactly one app mode.
const FEATURES_DIR = path.join(__dirname, "..", "..", "..", "features");

const stripExtension = (file: string) => file.replace(/\.(ts|tsx)$/, "");

const listModules = (dir: string): string[] =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((entry: string) => /\.(ts|tsx)$/.test(entry))
        .map(stripExtension)
    : [];

const pairs = fs
  .readdirSync(FEATURES_DIR)
  .flatMap((feature: string) => {
    const servicesDir = path.join(FEATURES_DIR, feature, "services");
    const onDir = path.join(servicesDir, "on");
    const offDir = path.join(servicesDir, "off");
    const onModules = listModules(onDir);
    const offModules = new Set(listModules(offDir));
    return onModules
      .filter((name) => offModules.has(name))
      .map((name) => ({
        feature,
        name,
        onPath: path.join(onDir, name),
        offPath: path.join(offDir, name),
      }));
  });

// Some features export loose functions, others export one namespace object
// (workoutApi). dispatchProxy routes whichever form it is given, so both are
// flattened to comparable "surface" names.
const callableSurface = (mod: Record<string, unknown>): string[] => {
  const names: string[] = [];
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value === "function") {
      names.push(key);
    } else if (value && typeof value === "object") {
      for (const [method, inner] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (typeof inner === "function") names.push(`${key}.${method}`);
      }
    }
  }
  return names.sort();
};

describe("on/off service contract", () => {
  it("discovers service pairs to compare", () => {
    expect(pairs.length).toBeGreaterThan(0);
  });

  // Only on -> off is enforced: dispatchProxy is typed from the `on` module, so
  // an entry the server version exposes but the offline one lacks is a
  // call that silently breaks in offline mode. Offline-only helpers are fine.
  for (const { feature, name, onPath, offPath } of pairs) {
    it(`${feature}/${name} exists offline`, () => {
      const off = new Set(callableSurface(require(offPath)));
      const missing = callableSurface(require(onPath)).filter(
        (entry) => !off.has(entry),
      );
      expect(missing).toEqual([]);
    });
  }
});
