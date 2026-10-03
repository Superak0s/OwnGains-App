// Emits the web copies of the in-app legal screens so a self-hoster can publish
// the exact text the app shows and link it from the Play listing, plus
// docs/delete-account.html. Play requires a deletion route reachable from the
// web, not only from inside the app.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

const readScreen = (file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const sections = /const SECTIONS[^=]*=\s*(\[[\s\S]*?\n\]);/.exec(source);
  const updated =
    /updated='([^']*)'/.exec(source) ??
    /TERMS_VERSION = "([^"]*)"/.exec(
      fs.readFileSync(path.join(root, "src/features/auth/termsAcceptance.ts"), "utf8"),
    );
  if (!sections || !updated) {
    console.error(`Could not locate SECTIONS/updated in ${file}`);
    process.exit(1);
  }
  return { sections: new Function(`return ${sections[1]}`)(), updated: updated[1] };
};

const escape = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const STYLE = `<style>
  body { max-width: 42rem; margin: 3rem auto; padding: 0 1rem;
         font: 16px/1.6 system-ui, sans-serif; color: #1a1a1a; }
  h2 { margin-top: 2rem; font-size: 1.1rem; }
  ol { padding-left: 1.2rem; }
  code { background: #f2f2f2; padding: 0.1rem 0.3rem; border-radius: 3px; }
</style>`;

// email_off stops Cloudflare's email obfuscation, whose decoder script the server's CSP blocks.
const page = (title, body) => `<!DOCTYPE html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${STYLE}
<!--email_off-->
<h1>${title}</h1>
${body}
<!--/email_off-->`;

const legalPage = (title, file) => {
  const { sections, updated } = readScreen(file);
  const body = `<p><em>Last updated ${escape(updated)}</em></p>
${sections
  .map((s) => {
    const mail = s.email
      ? ` <a href="mailto:${escape(s.email)}">${escape(s.email)}</a>`
      : "";
    return `<h2>${escape(s.title)}</h2>\n<p>${escape(s.body)}${mail}</p>`;
  })
  .join("\n")}
`;
  return { html: page(title, body), count: sections.length };
};

const privacy = legalPage(
  "OwnGains Privacy Policy",
  "src/features/auth/PrivacyPolicyScreen.tsx",
);
const terms = legalPage(
  "OwnGains Terms of Service",
  "src/features/auth/TermsOfServiceScreen.tsx",
);

const deletion = page(
  "Delete your OwnGains account",
  `<p><em>Last updated ${escape(readScreen("src/features/auth/PrivacyPolicyScreen.tsx").updated)}</em></p>

<p>OwnGains and its official server are run by Konstantinos Tsiaros, Anaximenous 20, Thessaloniki, Greece.
Your OwnGains data is stored in one of three places: only on your phone (offline
mode), on the official server at owngains.superak0s.com, or on a server that you
or someone else runs. That changes where deletion happens, so pick the case that
matches you.</p>

<h2>You use OwnGains offline (no account)</h2>
<p>Your data is stored only on your device. No account exists anywhere.
Open <strong>Settings &rarr; Privacy and Data &rarr; Delete Account</strong> to wipe the local
profile and its database, or simply uninstall the app. Both remove all of it.</p>

<h2>You signed in to a server</h2>
<ol>
  <li>Open OwnGains and go to <strong>Settings &rarr; Privacy and Data</strong>.</li>
  <li>Tap <strong>Delete Account</strong> and confirm with your password.</li>
</ol>
<p>This deletes your account on the server you are signed in to. Everything that
belongs to you there (workout sessions and sets, programs, friendships,
sharing permissions, and any tracking and supplement data that server stores
) is removed with it, immediately and permanently, from the live database.
The official server keeps tracking and supplement data on your device, so the app
deletes that locally at the same time.</p>
<p>On the official server, some copies and traces are kept after the account is deleted, for a
limited time:</p>
<ul>
  <li>database backups, used only to recover from a failure: up to 30 days.</li>
  <li>your account's random identifier, so a restored backup cannot bring the account back: 32 days.</li>
  <li>server logs (time, address requested, IP address): up to 14 days.</li>
  <li>crash reports, which contain only that random identifier: up to 90 days.</li>
  <li>reports filed by you or about you, so the operator can act on repeated abuse:
  one year from filing. After deletion they no longer link to your account. A report
  about you keeps your username and the reporter's optional note.</li>
</ul>

<h2>Delete your data but keep the account</h2>
<ul>
  <li><strong>Settings &rarr; Clear All Data</strong> deletes your workouts, programs and other
  data, on the server and on this device, and keeps the account.</li>
  <li><strong>Settings &rarr; Privacy and Data &rarr; Withdraw Health Consent</strong> deletes your
  workout history and any body data from the server and keeps them only on this device.</li>
</ul>
<p>To have anything else deleted, email
<a href="mailto:kostissuperak0s@gmail.com">kostissuperak0s@gmail.com</a> from the address
you signed up with and say what to remove.</p>

<h2>You cannot get into the app</h2>
<p>If your account is on the official server, email
<a href="mailto:kostissuperak0s@gmail.com">kostissuperak0s@gmail.com</a> from the address
you signed up with and ask for the account to be deleted.</p>
<p>For any other server, contact whoever operates it. If you do not know who that
is, it is the person or organisation who gave you the server address you typed
into the app. A server operator can remove an account directly from the server's
database, and can reset a forgotten password with
<code>owngains passwd &lt;username&gt; &lt;newpassword&gt;</code> so you can sign in and
delete the account yourself.</p>

<h2>Want a copy first?</h2>
<p>Before deleting, <strong>Settings &rarr; Privacy and Data &rarr; Export My Data</strong> writes
everything stored about you to a JSON file you can keep. Deletion cannot be
undone, so export first if you might want the history.</p>

<h2>Questions</h2>
<p>About the app or the official server: <a href="mailto:kostissuperak0s@gmail.com">kostissuperak0s@gmail.com</a>.
About data on any other server: its operator.</p>
`,
);

fs.mkdirSync(path.join(root, "docs"), { recursive: true });
fs.writeFileSync(path.join(root, "docs/privacy-policy.html"), privacy.html);
fs.writeFileSync(path.join(root, "docs/terms-of-service.html"), terms.html);
fs.writeFileSync(path.join(root, "docs/delete-account.html"), deletion);
console.log(`Wrote docs/privacy-policy.html (${privacy.count} sections)`);
console.log(`Wrote docs/terms-of-service.html (${terms.count} sections)`);
console.log("Wrote docs/delete-account.html");
