#!/usr/bin/env node
// Release-time CHANGELOG.md handling for scripts/release.sh:
//   check                            exit 1 if [Unreleased] has no entries
//   stamp <version> <date> <tag>     move [Unreleased] under the version heading
//   notes <version>                  print that version's section (release notes)
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "CHANGELOG.md");
const RELEASE_HEADING = /^## \[([^\]]+)\]/;
const LINK_REF = /^\[([^\]]+)\]:\s*(\S+)/;
const BULLET = /^[-*] /;
const UNRELEASED = "Unreleased";

const splitLines = (md) => md.replace(/\r\n/g, "\n").split("\n");

function findSection(lines, version) {
  const start = lines.findIndex((l) => RELEASE_HEADING.exec(l)?.[1] === version);
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !RELEASE_HEADING.test(lines[end]) && !LINK_REF.test(lines[end])) {
    end++;
  }
  return { start, end };
}

const trimBlank = (lines) => {
  let a = 0;
  let b = lines.length;
  while (a < b && lines[a].trim() === "") a++;
  while (b > a && lines[b - 1].trim() === "") b--;
  return lines.slice(a, b);
};

function hasUnreleasedEntries(md) {
  const lines = splitLines(md);
  const section = findSection(lines, UNRELEASED);
  if (!section) return false;
  return lines.slice(section.start + 1, section.end).some((l) => BULLET.test(l));
}

// Everything under a version heading until the next heading or link reference,
// with trailing prose (e.g. "Releases before ... predate this file.") left in.
function sectionBody(md, version) {
  const lines = splitLines(md);
  const section = findSection(lines, version);
  if (!section) return null;
  return trimBlank(lines.slice(section.start + 1, section.end)).join("\n");
}

function groupByCategory(bodyLines) {
  const groups = [];
  let current = null;
  for (const line of bodyLines) {
    const m = /^### (.+)$/.exec(line);
    if (m) {
      current = { name: m[1].trim(), lines: [] };
      groups.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  for (const g of groups) g.lines = trimBlank(g.lines);
  return groups.filter((g) => g.lines.length > 0);
}

const renderGroups = (groups) =>
  groups.flatMap((g) => ["", `### ${g.name}`, "", ...g.lines]);

function mergeInto(existing, incoming) {
  const merged = existing.map((g) => ({ ...g, lines: [...g.lines] }));
  for (const g of incoming) {
    const target = merged.find((m) => m.name === g.name);
    if (target) {
      target.lines.push(...g.lines);
    } else {
      const internal = merged.findIndex((m) => m.name === "Internal");
      if (internal === -1 || g.name === "Internal") merged.push(g);
      else merged.splice(internal, 0, g);
    }
  }
  return merged;
}

function updateLinks(lines, version, tag) {
  const unreleasedIdx = lines.findIndex((l) => LINK_REF.exec(l)?.[1] === UNRELEASED);
  if (unreleasedIdx === -1) return lines;
  const base = /^(https:\/\/github\.com\/[^/]+\/[^/]+)\//.exec(
    LINK_REF.exec(lines[unreleasedIdx])[2],
  )?.[1];
  if (!base) return lines;

  const out = [...lines];
  out[unreleasedIdx] = `[${UNRELEASED}]: ${base}/compare/${tag}...HEAD`;
  const versionLink = `[${version}]: ${base}/releases/tag/${tag}`;
  const existing = out.findIndex((l) => LINK_REF.exec(l)?.[1] === version);
  if (existing !== -1) out[existing] = versionLink;
  else out.splice(unreleasedIdx + 1, 0, versionLink);
  return out;
}

/**
 * Moves the [Unreleased] entries under `## [version] - date` and leaves an
 * empty [Unreleased] above it. Re-releasing an existing version merges the new
 * entries into its section instead of adding a second heading.
 */
function stamp(md, { version, date, tag }) {
  if (!hasUnreleasedEntries(md)) return md;
  let lines = splitLines(md);
  const unreleased = findSection(lines, UNRELEASED);
  const incoming = groupByCategory(lines.slice(unreleased.start + 1, unreleased.end));

  const existing = findSection(lines, version);
  if (existing) {
    const mergedBody = renderGroups(
      mergeInto(groupByCategory(lines.slice(existing.start + 1, existing.end)), incoming),
    );
    lines.splice(existing.start + 1, existing.end - existing.start - 1, ...mergedBody, "");
    lines.splice(unreleased.start + 1, unreleased.end - unreleased.start - 1, "");
  } else {
    lines.splice(
      unreleased.start,
      unreleased.end - unreleased.start,
      `## [${UNRELEASED}]`,
      "",
      `## [${version}] - ${date}`,
      ...renderGroups(incoming),
      "",
    );
  }

  lines = updateLinks(lines, version, tag);
  return lines.join("\n");
}

module.exports = { hasUnreleasedEntries, sectionBody, stamp };

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  const md = fs.readFileSync(FILE, "utf8");
  if (command === "check") {
    process.exit(hasUnreleasedEntries(md) ? 0 : 1);
  } else if (command === "stamp" && args.length === 3) {
    const [version, date, tag] = args;
    fs.writeFileSync(FILE, stamp(md, { version, date, tag }));
  } else if (command === "notes" && args.length === 1) {
    const body = sectionBody(md, args[0]);
    if (body === null) process.exit(1);
    process.stdout.write(body + "\n");
  } else {
    console.error("Usage: release-changelog.js check | stamp <version> <date> <tag> | notes <version>");
    process.exit(2);
  }
}
