const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inputsHash, unchangedSinceCleanPrebuild } = require("../prebuild");

let root;
const write = (file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
const app = (version, versionCode) =>
  JSON.stringify({ expo: { name: "App", version, android: { package: "a.b", versionCode } } });
const lock = (version, expo = "1.0.0") =>
  JSON.stringify({ version, packages: { "": { version }, "node_modules/expo": { version: expo } } });

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "prebuild-"));
  write("package.json", JSON.stringify({ version: "1.0.0", dependencies: { expo: "1.0.0" } }));
  write("app.json", app("1.0.0", 1));
  write("package-lock.json", lock("1.0.0"));
  write("plugins/withThing.js", "module.exports = (c) => c;");
  write("modules/alarms/index.ts", "export {};");
  write("assets/icon.png", "png");
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("inputsHash", () => {
  it("ignores the release version bump and Gradle output in modules", () => {
    const before = inputsHash(root);
    write("package.json", JSON.stringify({ version: "1.1.0", dependencies: { expo: "1.0.0" } }));
    write("app.json", app("1.1.0", 2));
    write("package-lock.json", lock("1.1.0"));
    write("modules/alarms/android/build/out.dex", "dex");
    write("modules/alarms/android/.gradle/cache", "cache");
    expect(inputsHash(root)).toBe(before);
  });

  it.each([
    ["a dependency bump", () => write("package.json", JSON.stringify({ dependencies: { expo: "2.0.0" } }))],
    ["a lockfile resolution change", () => write("package-lock.json", lock("1.0.0", "1.0.1"))],
    ["a native module edit", () => write("modules/alarms/index.ts", "export const x = 1;")],
    ["a new native module", () => write("modules/tiles/index.ts", "export {};")],
    ["a config plugin edit", () => write("plugins/withThing.js", "module.exports = (c) => ({ ...c });")],
    ["an asset change", () => write("assets/icon.png", "png2")],
    ["app.config.js", () => write("app.config.js", "module.exports = ({ config }) => config;")],
    ["google-services.json appearing", () => write("secrets/google-services.json", "{}")],
    ["an app.json config change", () => write("app.json", JSON.stringify({ expo: { name: "Other", version: "1.0.0" } }))],
  ])("changes on %s", (_, change) => {
    const before = inputsHash(root);
    change();
    expect(inputsHash(root)).not.toBe(before);
  });
});

describe("unchangedSinceCleanPrebuild", () => {
  const stamp = (hash) => write(".expo/prebuild.stamp", hash);

  it("is true when android/ exists and the stamp matches", () => {
    fs.mkdirSync(path.join(root, "android"));
    stamp(inputsHash(root));
    expect(unchangedSinceCleanPrebuild(root)).toBe(true);
  });

  it("is false without android/", () => {
    stamp(inputsHash(root));
    expect(unchangedSinceCleanPrebuild(root)).toBe(false);
  });

  it("is false without a stamp or with a stale one", () => {
    fs.mkdirSync(path.join(root, "android"));
    expect(unchangedSinceCleanPrebuild(root)).toBe(false);
    stamp("stale");
    expect(unchangedSinceCleanPrebuild(root)).toBe(false);
  });
});
