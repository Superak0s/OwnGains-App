#!/usr/bin/env node
// `expo prebuild --platform android` for `npm run android` and scripts/release.sh. Clean only
// when the native inputs changed since the last clean one, otherwise it asks (incremental in 30s).
//   --clean      always clean
//   --no-clean   always incremental
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const stampPath = (root) => path.join(root, ".expo", "prebuild.stamp");

/**
 * Hash of everything that makes a clean prebuild differ: dependencies and their lockfile
 * resolutions, app.json, app.config.js and the google-services.json it looks for, config
 * plugins, local native modules and assets, all minus the fields a release bump rewrites.
 */
function inputsHash(root) {
  const h = crypto.createHash("sha1");
  const abs = (f) => path.join(root, f);
  const json = (f) => JSON.parse(fs.readFileSync(abs(f), "utf8"));

  const pkg = json("package.json");
  h.update(JSON.stringify([pkg.dependencies, pkg.devDependencies]));
  if (fs.existsSync(abs("package-lock.json"))) {
    const lock = json("package-lock.json");
    delete lock.version;
    if (lock.packages?.[""]) delete lock.packages[""].version;
    h.update(JSON.stringify(lock));
  }
  const app = json("app.json");
  delete app.expo.version;
  if (app.expo.android) delete app.expo.android.versionCode;
  h.update(JSON.stringify(app));
  h.update(JSON.stringify(["secrets/google-services.json", "google-services.json"].map((f) => fs.existsSync(abs(f)))));
  if (fs.existsSync(abs("app.config.js"))) h.update(fs.readFileSync(abs("app.config.js")));

  // Posix relative paths so Windows and WSL agree on the hash. Gradle writes
  // modules/*/android/build (and .gradle, .cxx) on every build.
  const walk = (dir) => {
    if (!fs.existsSync(abs(dir))) return;
    for (const name of fs.readdirSync(abs(dir)).sort()) {
      const rel = `${dir}/${name}`;
      if (!fs.statSync(abs(rel)).isDirectory()) {
        h.update(rel);
        h.update(fs.readFileSync(abs(rel)));
      } else if (name !== "build" && !name.startsWith(".")) {
        walk(rel);
      }
    }
  };
  ["plugins", "modules", "assets"].forEach(walk);
  return h.digest("hex");
}

function unchangedSinceCleanPrebuild(root) {
  const stamp = stampPath(root);
  return fs.existsSync(path.join(root, "android")) && fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === inputsHash(root);
}

/** Resolves with the typed line, or "" on EOF or after `ms`. */
function ask(question, ms) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Resolves first because rl.close() re-enters through the "close" handler.
    const done = (answer) => {
      resolve(answer);
      clearTimeout(timer);
      rl.close();
    };
    const timer = setTimeout(() => {
      process.stdout.write("\n");
      done("");
    }, ms);
    // On a terminal readline takes over Ctrl+C, which would otherwise only pause the prompt.
    rl.on("SIGINT", () => process.exit(130));
    rl.on("close", () => done(""));
    rl.question(question, done);
  });
}

async function main(args) {
  let clean = !args.includes("--no-clean");
  if (clean && !args.includes("--clean") && unchangedSinceCleanPrebuild(ROOT)) {
    const answer = await ask(
      "No packages, config, plugins, modules or assets changed since the last clean prebuild. Run one anyway? [y/N] (incremental in 30s) ",
      30_000,
    );
    clean = /^y/i.test(answer.trim());
  }
  console.log(`${clean ? "Clean" : "Incremental"} prebuild`);
  // A clean prebuild cut short leaves a half-generated android/ that a matching stamp would hide.
  if (clean) fs.rmSync(stampPath(ROOT), { force: true });
  // One string through a shell, because Windows Node refuses to spawn npx.cmd without one.
  const { status } = spawnSync(`npx expo prebuild --platform android${clean ? " --clean" : ""}`, {
    cwd: ROOT,
    stdio: "inherit",
    shell: true,
  });
  if (status !== 0) process.exit(status ?? 1);
  if (clean) {
    fs.mkdirSync(path.dirname(stampPath(ROOT)), { recursive: true });
    fs.writeFileSync(stampPath(ROOT), inputsHash(ROOT));
  }
}

module.exports = { inputsHash, unchangedSinceCleanPrebuild };

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
