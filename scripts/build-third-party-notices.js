#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const out = path.join(root, "docs", "third-party-notices.md");

// npm ls exits non-zero on unmet optional peers but still prints the full tree.
const dirs = spawnSync("npm ls --omit=dev --all --parseable", {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
  shell: true,
})
  .stdout.split(/\r?\n/)
  .filter((dir) => dir && path.resolve(dir) !== root);

const seen = new Map();
for (const dir of dirs) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const texts = fs
    .readdirSync(dir)
    .filter((f) => /^(licen[cs]e|copying|notice)/i.test(f))
    .map((f) => fs.readFileSync(path.join(dir, f), "utf8").trim());
  const license =
    typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "UNKNOWN";
  seen.set(key, { key, license, texts });
}

const entries = [...seen.values()].sort((a, b) => a.key.localeCompare(b.key));
const body = entries
  .map(({ key, license, texts }) =>
    [`## ${key}`, `License: ${license}`, ...texts.map((t) => "```\n" + t + "\n```")].join("\n\n"),
  )
  .join("\n\n");

fs.writeFileSync(
  out,
  `# Third-party notices\n\nOwnGains includes the open-source packages below.\n\n${body}\n`,
);
console.log(`Wrote ${path.relative(root, out)} (${entries.length} packages)`);
