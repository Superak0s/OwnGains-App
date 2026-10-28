#!/usr/bin/env node
// Exports a signed over-the-air update for the play and github channels into dist/ota/.
//   publish-ota.js [--upload=user@host:/path/to/UPDATES_DIR] [--no-sourcemaps]
// scripts/release.sh ota runs it after the version bump and checks. It refuses a checkout whose native fingerprint
// differs from the last store release's, since those installs would ignore the update.
const { execSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getConfig } = require("expo/config");

const ROOT = path.join(__dirname, "..");
const DISTRIBUTION = path.join(ROOT, "src/shared/distribution.ts");
const KEY = process.env.EXPO_UPDATES_PRIVATE_KEY || path.join(ROOT, "secrets/expo-updates/private-key.pem");
const KOFI_URL = fs.readFileSync(path.join(ROOT, "scripts/release.sh"), "utf8").match(/^KOFI_URL="(.+)"/m)[1];
const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", ttf: "font/ttf", otf: "font/otf", json: "application/json" };

const args = process.argv.slice(2);
const upload = args.find((a) => a.startsWith("--upload="))?.slice("--upload=".length);
const noSourcemaps = args.includes("--no-sourcemaps");

try {
  process.loadEnvFile(path.join(ROOT, ".env"));
} catch {}
const die = (msg) => {
  console.error(`publish-ota: ${msg}`);
  process.exit(1);
};
if (!fs.existsSync(KEY)) die(`no signing key at ${KEY}. Generate it with npx expo-updates codesigning:generate.`);
if (!process.env.SENTRY_AUTH_TOKEN && !noSourcemaps) die("SENTRY_AUTH_TOKEN unset. Crash reports from this update would be unreadable (--no-sourcemaps).");

const run = (cmd) => execSync(cmd, { cwd: ROOT, stdio: "inherit" });
const { exp } = getConfig(ROOT, { isPublicConfig: true, skipSDKVersionRequirement: true });
const { url: manifestUrl, codeSigningCertificate, codeSigningMetadata } = getConfig(ROOT, { skipSDKVersionRequirement: true }).exp.updates;
const certificate = new crypto.X509Certificate(fs.readFileSync(path.join(ROOT, codeSigningCertificate)));
const privateKey = fs.readFileSync(KEY);
const runtimeVersion = JSON.parse(execSync("npx expo-updates runtimeversion:resolve --platform android", { cwd: ROOT }).toString().split("\n")[0]).runtimeVersion;
const RECORDED = path.join(ROOT, ".ota-runtime-version");
if (!fs.existsSync(RECORDED)) die("no .ota-runtime-version. scripts/release.sh records it on a store release, so make one first.");
const released = fs.readFileSync(RECORDED, "utf8").trim();
if (released !== runtimeVersion) {
  die(`native fingerprint ${runtimeVersion} differs from the last store release's ${released} (.ota-runtime-version). Installed builds would ignore this update, so a native change needs a store release.`);
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.join(ROOT, "dist/ota");

const original = fs.readFileSync(DISTRIBUTION, "utf8");
if (!original.includes("KOFI_URL: string | null = null;")) die("src/shared/distribution.ts must keep KOFI_URL null.");

function publish(channel) {
  const dir = path.join(out, runtimeVersion, channel, stamp);
  const base = `${new URL(manifestUrl).origin}/api/updates/assets/${runtimeVersion}/${channel}/${stamp}`;
  const kofi = channel === "github";
  fs.writeFileSync(DISTRIBUTION, kofi ? original.replace("= null;", `= "${KOFI_URL}";`) : original);
  try {
    run(`npx expo export --platform android --source-maps --output-dir "${dir}"`);
  } finally {
    fs.writeFileSync(DISTRIBUTION, original);
  }
  if (!noSourcemaps) run(`npx sentry-expo-upload-sourcemaps "${dir}"`);
  for (const f of fs.readdirSync(dir, { recursive: true })) if (f.endsWith(".map")) fs.rmSync(path.join(dir, f));

  const { bundle, assets } = JSON.parse(fs.readFileSync(path.join(dir, "metadata.json"), "utf8")).fileMetadata.android;
  const bundleBytes = fs.readFileSync(path.join(dir, bundle));
  // Play's Payments policy bans the link in the Play bundle.
  if (bundleBytes.includes(KOFI_URL) !== kofi) die(`${channel} bundle ${kofi ? "lacks" : "contains"} the Ko-fi link`);

  const describe = (rel, ext) => {
    const bytes = fs.readFileSync(path.join(dir, rel));
    return {
      hash: crypto.createHash("sha256").update(bytes).digest("base64url"),
      key: crypto.createHash("md5").update(bytes).digest("hex"),
      fileExtension: `.${ext}`,
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      url: `${base}/${rel.replaceAll("\\", "/")}`,
    };
  };
  const { fileExtension, ...launchAsset } = describe(bundle, "bundle");
  const manifest = JSON.stringify({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    runtimeVersion,
    launchAsset: { ...launchAsset, contentType: "application/javascript" },
    assets: assets.map((a) => describe(a.path, a.ext)),
    metadata: {},
    extra: { expoClient: exp },
  });
  const sig = crypto.sign("sha256", Buffer.from(manifest), privateKey);
  if (!crypto.verify("sha256", Buffer.from(manifest), certificate.publicKey, sig)) die(`${KEY} does not match ${codeSigningCertificate}`);
  fs.writeFileSync(path.join(dir, "manifest.json"), manifest);
  fs.writeFileSync(path.join(dir, "expo-signature"), `sig="${sig.toString("base64")}", keyid="${codeSigningMetadata.keyid}"`);
  console.log(`${channel}: ${dir}`);
}

publish("play");
publish("github");

const tree = path.join(out, runtimeVersion);
if (upload) run(`scp -r "${tree}" "${upload}/"`);
else console.log(`\nCopy ${tree} into the server's UPDATES_DIR, e.g. scp -r "${tree}" user@host:/path/to/UPDATES_DIR/`);
