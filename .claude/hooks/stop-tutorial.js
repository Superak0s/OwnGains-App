#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const git = (...args) => spawnSync("git", args, { cwd, encoding: "utf8" }).stdout || "";
const TEACHABLE = new Set(["Added", "Changed", "Removed"]);

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
    .map((line) => line.slice(3).trim().replace(/^.* -> /, ""));
  if (changed.some((f) => f.startsWith("src/features/tutorial/"))) return;

  let section = "";
  const entries = [];
  for (const line of git("diff", "-U100000", "HEAD", "--", "CHANGELOG.md").split("\n")) {
    const heading = /^[ +]### (\w+)/.exec(line);
    if (heading) section = heading[1];
    else if (line.startsWith("+- ") && TEACHABLE.has(section)) entries.push(line.slice(3));
  }
  if (!entries.length) return;

  // Nag once per distinct set of entries, so a dirty tree left across turns doesn't block every stop.
  const stamp = path.resolve(cwd, git("rev-parse", "--git-path", "tutorial-nag").trim());
  const hash = crypto.createHash("sha1").update(entries.join("\n")).digest("hex");
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === hash) return;
  fs.writeFileSync(stamp, hash);

  console.error(
    `New user-visible changelog entries, but the tutorial did not change:\n  - ${entries.join("\n  - ")}\n` +
      "If one adds or changes something the tutorial teaches or should teach (a control, gesture, setting or label " +
      "named in src/features/tutorial/chapters.ts), update that chapter now. If not, say so in one line and stop."
  );
  process.exit(2);
});
