import changelogMarkdown from "../../../../../CHANGELOG.md";
import {
  categoriesIn,
  filterByCategory,
  findRelease,
  parseChangelog,
} from "../changelog";

const SAMPLE = `# Changelog

Intro text with a [link](https://example.com).

## [Unreleased]

### Added

- Something **new** with \`code\`
  that wraps onto a second line.

### Internal

- Refactored a hook.

## [1.1.0] - 2026-02-01

### Fixed

- A crash.

### Added

- A [linked](https://example.com) feature.

### Added

- Another feature.

Releases before 1.1.0 predate this file.

[Unreleased]: https://example.com/compare
[1.1.0]: https://example.com/tag
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  it("returns releases newest first with their dates", () => {
    expect(releases.map((r) => [r.version, r.date])).toEqual([
      ["Unreleased", null],
      ["1.1.0", "2026-02-01"],
    ]);
  });

  it("drops non-user-facing sections and strips inline markdown", () => {
    expect(releases[0].sections).toEqual([
      {
        category: "Added",
        items: ["Something new with code that wraps onto a second line."],
      },
    ]);
  });

  it("merges repeated headings, orders categories, and ignores trailing prose", () => {
    expect(releases[1].sections).toEqual([
      { category: "Added", items: ["A linked feature.", "Another feature."] },
      { category: "Fixed", items: ["A crash."] },
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseChangelog(SAMPLE.replace(/\n/g, "\r\n"))).toEqual(releases);
  });
});

describe("helpers", () => {
  const releases = parseChangelog(SAMPLE);

  it("finds a release by version", () => {
    expect(findRelease(releases, "1.1.0")?.date).toBe("2026-02-01");
    expect(findRelease(releases, "9.9.9")).toBeNull();
    expect(findRelease(releases, undefined)).toBeNull();
  });

  it("filters a release's sections by category", () => {
    expect(filterByCategory(releases[1], "Fixed")).toEqual([
      { category: "Fixed", items: ["A crash."] },
    ]);
    expect(filterByCategory(releases[1], null)).toHaveLength(2);
  });

  it("lists only the categories that appear", () => {
    expect(categoriesIn(releases)).toEqual(["Added", "Fixed"]);
  });
});

describe("bundled CHANGELOG.md", () => {
  it("parses with an [Unreleased] section first", () => {
    const parsed = parseChangelog(changelogMarkdown);
    expect(parsed[0]?.version).toBe("Unreleased");
  });
});
