/* global test, expect */
const fs = require("fs");
const os = require("os");
const path = require("path");
const appConfig = require("../app.config");

const base = { android: {}, plugins: [] };

const withFiles = (files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "appconfig-"));
  for (const file of files) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "{}");
  }
  return appConfig({ config: base, projectRoot: root });
};

test("uses google-services.json from secrets/", () => {
  const config = withFiles(["secrets/google-services.json"]);
  expect(config.android.googleServicesFile).toBe("./secrets/google-services.json");
  expect(config.plugins).toContain("@react-native-firebase/app");
});

test("falls back to the repo root", () => {
  expect(withFiles(["google-services.json"]).android.googleServicesFile).toBe(
    "./google-services.json",
  );
});

test("leaves Firebase out without the file", () => {
  expect(withFiles([])).toBe(base);
});
