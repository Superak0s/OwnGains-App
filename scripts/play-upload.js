#!/usr/bin/env node
// Uploads an AAB to one or more Google Play tracks with docs/play-release-notes.txt as "What's new".
//   play-upload.js <aab> <track>[,<track>...]
//   play-upload.js --check
// --check opens and discards an edit, so a missing Play Console permission fails before a build.
const fs = require("node:fs");
const path = require("node:path");
const { API, pkg, accessToken, call } = require("./play-auth");

const ROOT = path.join(__dirname, "..");
const NOTES_LANGUAGE = "en-US";

const [aab, trackArg = ""] = process.argv.slice(2);
const tracks = trackArg.split(",").map((t) => t.trim()).filter(Boolean);
const checkOnly = aab === "--check";
if (!checkOnly && (!aab || !tracks.length)) {
  console.error("Usage: play-upload.js <aab> <track>[,<track>...] | --check");
  process.exit(1);
}

async function main() {
  const auth = { Authorization: `Bearer ${await accessToken()}` };
  const json = { ...auth, "Content-Type": "application/json" };
  const app = `/androidpublisher/v3/applications/${pkg}`;

  const edit = await call(`${API}${app}/edits`, { method: "POST", headers: auth });
  const editPath = `${app}/edits/${edit.id}`;

  if (checkOnly) {
    await call(`${API}${editPath}`, { method: "DELETE", headers: auth });
    return;
  }

  console.log(`Uploading ${path.basename(aab)} to ${pkg}...`);
  const bundle = await call(`${API}/upload${editPath}/bundles?uploadType=media`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/octet-stream" },
    body: fs.readFileSync(aab),
  });

  const notesFile = path.join(ROOT, "docs", "play-release-notes.txt");
  const notes = fs.existsSync(notesFile) ? fs.readFileSync(notesFile, "utf8").trim() : "";
  for (const track of tracks) {
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
  }

  await call(`${API}${editPath}:commit`, { method: "POST", headers: auth });
  console.log(`versionCode ${bundle.versionCode} is on ${tracks.join(", ")}.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
