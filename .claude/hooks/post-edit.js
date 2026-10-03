#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const run = (cmd) => spawnSync(cmd, { shell: true, encoding: "utf8", cwd: root });

const fail = (message, result) => {
  console.error(message);
  if (result) console.error([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
  process.exit(2);
};

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  let file;
  try {
    file = JSON.parse(raw).tool_input?.file_path;
  } catch {
    return;
  }
  if (!file || !/\.tsx?$/.test(file) || /[\\/](android|ios|node_modules)[\\/]/.test(file)) return;

  const lint = run(`npx eslint --fix "${file}"`);
  if (lint.status !== 0) fail(`eslint could not auto-fix ${file}:`, lint);

  // Whole-repo scan rather than per-file: the script takes no arguments and
  // runs in ~100ms, and CI keeps the count at zero so any hit is from this edit.
  if (/\.tsx$/.test(file)) {
    const a11y = run("python3 scripts/find-unlabeled-icons.py");
    if (a11y.status === 1)
      fail(
        "Icon-only touchable with no accessibilityLabel, so a screen reader announces nothing for it. " +
          "Add an accessibilityLabel describing the action:",
        a11y
      );
  }

  // dispatchProxy is typed from the `on` module and routes by export name, so
  // anything the server version exposes that the offline one lacks fails
  // silently in exactly one app mode. Offline-only helpers are fine, so the
  // one-way check.
  const onModule = /[\\/]services[\\/]on[\\/]/.test(file);
  if (!onModule && !/[\\/]services[\\/]off[\\/]/.test(file)) return;

  if (onModule) {
    const twin = path.resolve(root, file).replace(/([\\/]services[\\/])on([\\/])/, "$1off$2");
    // serviceModeContract only compares modules that exist in both folders, so a
    // wholly missing offline twin is not caught by it. `friends` has no off/ at all
    // (it is server-mediated by design), so an absent folder is not a mismatch.
    if (fs.existsSync(path.dirname(twin)) && !fs.existsSync(twin))
      fail(`No offline twin for ${file}. Create ${path.relative(root, twin)} or the feature breaks in offline mode.`);
  }

  const contract = run("npx jest serviceModeContract --coverage=false --ci --silent --forceExit");
  if (contract.status !== 0)
    fail(
      "on/off service contract broken: an export exists in online mode but not offline. " +
        "Mirror it into the twin module before continuing.",
      contract
    );
});
