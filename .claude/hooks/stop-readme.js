#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...args) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout || "";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    if (JSON.parse(raw).stop_hook_active) return;
  } catch {
    return;
  }

  const changed = git("status", "--porcelain", "--untracked-files=all")
    .split("\n")
    .map((line) => line.slice(3).trim().replace(/^.* -> /, ""))
    .filter(Boolean);
  if (changed.includes("README.md")) return;

  const features = changed.filter(
    (f) => f.startsWith("src/features/") && !/(__tests__|__mocks__)\//.test(f) && !/\.test\.tsx?$/.test(f)
  );
  if (!features.length) return;

  // Nag once per distinct set of feature edits, so a dirty tree left across turns doesn't block every stop.
  const stamp = path.resolve(cwd, git("rev-parse", "--git-path", "readme-nag").trim());
  const hash = crypto
    .createHash("sha1")
    .update(git("diff", "HEAD", "--", ...features) + features.join("\n"))
    .digest("hex");
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === hash) return;
  fs.writeFileSync(stamp, hash);

  console.error(
    `Feature code changed but README.md did not:\n  ${features.join("\n  ")}\n` +
      "If this adds, removes or changes something a user would notice, or something the README's " +
      "feature list or technical overview describes, update README.md now (the readme-audit skill has the rules). " +
      "If not, say so in one line and stop."
  );
  process.exit(2);
});
