#!/usr/bin/env node
const { spawnSync } = require("child_process");

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    if (JSON.parse(raw).stop_hook_active) return;
  } catch {
    return;
  }

  const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // Resolved against this process rather than shelled out to `npx`, which is
  // not on PATH in the hook's environment.
  const tsc = require.resolve("typescript/bin/tsc", { paths: [cwd] });
  const result = spawnSync(process.execPath, [tsc, "--noEmit"], {
    encoding: "utf8",
    cwd,
  });

  if (result.status !== 0) {
    console.error("typecheck failed:");
    console.error([result.stdout, result.stderr].filter(Boolean).join("\n").trim());
    process.exit(2);
  }
});
