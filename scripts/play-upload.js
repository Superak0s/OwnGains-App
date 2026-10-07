#!/usr/bin/env node
// Uploads an AAB to a Google Play track with docs/play-release-notes.txt as "What's new".
//   play-upload.js <aab> <track>
// PLAY_SERVICE_ACCOUNT is the service-account JSON itself or a path to it.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const API = "https://androidpublisher.googleapis.com";
const NOTES_LANGUAGE = "en-US";

const [aab, track] = process.argv.slice(2);
if (!aab || !track) {
  console.error("Usage: play-upload.js <aab> <track>");
  process.exit(1);
}

const account = process.env.PLAY_SERVICE_ACCOUNT?.trim();
if (!account) {
  console.error("PLAY_SERVICE_ACCOUNT is not set.");
  process.exit(1);
}
const key = JSON.parse(account.startsWith("{") ? account : fs.readFileSync(account, "utf8"));
const pkg = require(path.join(ROOT, "app.json")).expo.android.package;

const b64url = (s) => Buffer.from(s).toString("base64url");

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(
    JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: key.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), key.private_key).toString("base64url");
  const res = await call(key.token_uri, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  return res.access_token;
}

async function call(url, init) {
  const res = await fetch(url, init);
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method} ${url.split("?")[0]} -> ${res.status}\n${body}`);
  return body ? JSON.parse(body) : {};
}

async function main() {
  const auth = { Authorization: `Bearer ${await accessToken()}` };
  const json = { ...auth, "Content-Type": "application/json" };
  const app = `/androidpublisher/v3/applications/${pkg}`;

  const edit = await call(`${API}${app}/edits`, { method: "POST", headers: auth });
  const editPath = `${app}/edits/${edit.id}`;

  console.log(`Uploading ${path.basename(aab)} to ${pkg}...`);
  const bundle = await call(`${API}/upload${editPath}/bundles?uploadType=media`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(aab),
  });

  const notesFile = path.join(ROOT, "docs", "play-release-notes.txt");
  const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8").trim() : "";
  await call(`${API}${editPath}/tracks/${track}`, {
    method: "PUT",
    headers: json,
    body: JSON.stringify({
      track,
      releases: [
        {
          versionCodes: [String(bundle.versionCode)],
          // A production upload waits as a draft so rolling it out stays a manual step in Play Console.
          status: track === "production" ? "draft" : "completed",
          ...(notes && { releaseNotes: [{ language: NOTES_LANGUAGE, text: notes }] }),
        },
      ],
    }),
  });

  await call(`${API}${editPath}:commit`, { method: "POST", headers: auth });
  console.log(`versionCode ${bundle.versionCode} is on the ${track} track.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
