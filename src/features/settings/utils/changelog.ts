export const CHANGE_CATEGORIES = [
  "Added",
  "Changed",
  "Fixed",
  "Removed",
  "Deprecated",
  "Security",
] as const;

export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

export interface ChangeSection {
  category: ChangeCategory;
  items: string[];
}

export interface Release {
  version: string;
  date: string | null;
  sections: ChangeSection[];
}

export const UNRELEASED = "Unreleased";

const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\S+))?/;
const CATEGORY_HEADING = /^### (.+)$/;
const BULLET = /^[-*] (.*)$/;

const stripInline = (text: string): string =>
  text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();

const isCategory = (name: string): name is ChangeCategory =>
  (CHANGE_CATEGORIES as readonly string[]).includes(name);

/**
 * Parses a Keep a Changelog file, newest release first. Sections outside the
 * user-facing categories (such as Internal) are dropped.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | null = null;
  let section: ChangeSection | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();

    const releaseMatch = RELEASE_HEADING.exec(line);
    if (releaseMatch) {
      release = { version: releaseMatch[1], date: releaseMatch[2] ?? null, sections: [] };
      releases.push(release);
      section = null;
      continue;
    }
    if (line.startsWith("## ")) {
      release = null;
      section = null;
      continue;
    }

    const categoryMatch = CATEGORY_HEADING.exec(line);
    if (categoryMatch) {
      const name = categoryMatch[1].trim();
      section = null;
      if (release && isCategory(name)) {
        section = release.sections.find((s) => s.category === name) ?? null;
        if (!section) {
          section = { category: name, items: [] };
          release.sections.push(section);
        }
      }
      continue;
    }

    if (!section) continue;

    const bullet = BULLET.exec(line);
    if (bullet) {
      section.items.push(stripInline(bullet[1]));
    } else if (/^\s+\S/.test(line) && section.items.length > 0) {
      const last = section.items.length - 1;
      section.items[last] = `${section.items[last]} ${stripInline(line)}`;
    } else if (line.trim() !== "") {
      section = null;
    }
  }

  for (const r of releases) {
    r.sections = r.sections
      .filter((s) => s.items.length > 0)
      .sort(
        (a, b) =>
          CHANGE_CATEGORIES.indexOf(a.category) -
          CHANGE_CATEGORIES.indexOf(b.category),
      );
  }
  return releases;
}

export function findRelease(
  releases: Release[],
  version: string | null | undefined,
): Release | null {
  if (!version) return null;
  return releases.find((r) => r.version === version) ?? null;
}

export function filterByCategory(
  release: Release,
  category: ChangeCategory | null,
): ChangeSection[] {
  if (!category) return release.sections;
  return release.sections.filter((s) => s.category === category);
}

export function categoriesIn(releases: Release[]): ChangeCategory[] {
  const present = new Set(releases.flatMap((r) => r.sections.map((s) => s.category)));
  return CHANGE_CATEGORIES.filter((c) => present.has(c));
}
