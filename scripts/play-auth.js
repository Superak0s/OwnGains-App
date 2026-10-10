// Shared Google Play Developer API auth for play-upload.js and play-recover.js.
// PLAY_SERVICE_ACCOUNT is the service-account JSON itself or a path to it.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const API = "https://androidpublisher.googleapis.com";

const account = process.env.PLAY_SERVICE_ACCOUNT?.trim();
if (!account) {
  console.error("PLAY_SERVICE_ACCOUNT is not set.");
  process.exit(1);
}
const key = JSON.parse(account.startsWith("{") ? account : fs.readFileSync(account, "utf8"));
const pkg = require(path.join(__dirname, "..", "app.json")).expo.android.package;

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

module.exports = { API, pkg, accessToken, call };
