#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const serverRepo = path.resolve(cwd, "..", "OwnGains-Server");
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd, encoding: "utf8", ...opts });
const git = (...args) => run("git", args).stdout || "";
const python = process.platform === "win32" ? "python" : "python3";

const missingCalls = (serverSrc) => {
  const args = ["scripts/api_audit.py", "--json", "--server-root", serverSrc];
  const out = run(python, args, { maxBuffer: 64 * 1024 * 1024 }).stdout;
  return new Set(JSON.parse(out).missing_on_server.map((c) => `${c.method} ${c.path}`));
};

const missingAtTag = (tag) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "owngains-server-"));
  try {
    const tar = spawnSync("git", ["-C", serverRepo, "archive", tag, "src"], { maxBuffer: 256 * 1024 * 1024 });
    if (tar.status !== 0) return null;
    spawnSync("tar", ["-x", "-C", dir], { input: tar.stdout });
    return missingCalls(path.join(dir, "src"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

const versionOf = (tag) => tag.replace(/^v/, "").split(".").map(Number);
const cmp = (a, b) => {
  const [x, y] = [versionOf(a), versionOf(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
};

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    if (JSON.parse(raw).stop_hook_active) return;
  } catch {
    return;
  }
  if (!fs.existsSync(path.join(serverRepo, ".git"))) return;

  const untracked = git("ls-files", "--others", "--exclude-standard", "--", "src")
    .split("\n")
    .filter(Boolean)
    .map((f) => fs.readFileSync(path.join(cwd, f), "utf8"))
    .join("\n");
  const added = git("diff", "HEAD", "-U0", "--", "src")
    .split("\n")
    .filter((l) => l.startsWith("+"))
    .join("\n");
  if (!(added + untracked).includes("/api/")) return;

  const versionFile = path.join(cwd, "src/shared/services/serverVersion.ts");
  const min = fs.readFileSync(versionFile, "utf8").match(/MIN_SERVER_VERSION = "([^"]+)"/)?.[1];
  if (!min) return;

  const atMin = missingAtTag(`v${min}`);
  if (!atMin) return;
  const atHead = missingCalls(path.join(serverRepo, "src"));
  const needed = [...atMin].filter((c) => !atHead.has(c));
  if (!needed.length) return;

  const newer = git("-C", serverRepo, "tag", "--list", "v*")
    .split("\n")
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t) && cmp(t, `v${min}`) > 0)
    .sort(cmp);
  const floor = newer.find((t) => {
    const missing = missingAtTag(t);
    return missing && needed.every((c) => !missing.has(c));
  });

  // Nag once per distinct gap, so a deliberate decision not to bump doesn't block every stop.
  const stamp = path.resolve(cwd, git("rev-parse", "--git-path", "min-server-version-nag").trim());
  const hash = crypto.createHash("sha1").update(min + needed.join("\n")).digest("hex");
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === hash) return;
  fs.writeFileSync(stamp, hash);

  console.error(
    `The app calls endpoints that OwnGains-Server v${min} (MIN_SERVER_VERSION) does not answer:\n  ${needed.join("\n  ")}\n` +
      (floor
        ? `The oldest server release that answers all of them is ${floor}. Bump MIN_SERVER_VERSION in src/shared/services/serverVersion.ts to "${floor.slice(1)}" and add a CHANGELOG entry, `
        : "No server release answers them yet, so the floor must move to the next server release once it is tagged. Note it in the CHANGELOG, ") +
      "unless every one of these calls already degrades gracefully on an older server. In that case say so in one line and stop."
  );
  process.exit(2);
});
