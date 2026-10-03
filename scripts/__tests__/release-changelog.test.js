const { hasUnreleasedEntries, sectionBody, stamp } = require("../release-changelog");

const REPO = "https://github.com/o/r";

const md = (unreleased) => `# Changelog

## [Unreleased]
${unreleased}
## [0.3.0] - 2026-09-19

### Changed

- Old change.

[Unreleased]: ${REPO}/compare/v0.3.0-1...HEAD
[0.3.0]: ${REPO}/releases/tag/v0.3.0-1
`;

const PENDING = `
### Added

- New thing
  wrapped.

### Internal

- Refactor.
`;

describe("hasUnreleasedEntries", () => {
  it("is true only when Unreleased has bullets", () => {
    expect(hasUnreleasedEntries(md(PENDING))).toBe(true);
    expect(hasUnreleasedEntries(md("\n### Added\n\n"))).toBe(false);
    expect(hasUnreleasedEntries("# Changelog\n")).toBe(false);
  });
});

describe("stamp", () => {
  it("moves Unreleased under a new version heading and updates links", () => {
    expect(stamp(md(PENDING), { version: "0.4.0", date: "2026-10-01", tag: "v0.4.0-2" }))
      .toBe(`# Changelog

## [Unreleased]

## [0.4.0] - 2026-10-01

### Added

- New thing
  wrapped.

### Internal

- Refactor.

## [0.3.0] - 2026-09-19

### Changed

- Old change.

[Unreleased]: ${REPO}/compare/v0.4.0-2...HEAD
[0.4.0]: ${REPO}/releases/tag/v0.4.0-2
[0.3.0]: ${REPO}/releases/tag/v0.3.0-1
`);
  });

  it("merges into an existing version when it is re-released", () => {
    const pending = "\n### Changed\n\n- Tweak.\n\n### Fixed\n\n- Bug.\n";
    const out = stamp(md(pending), { version: "0.3.0", date: "2026-10-01", tag: "v0.3.0-2" });
    expect(sectionBody(out, "0.3.0")).toBe(
      "### Changed\n\n- Old change.\n- Tweak.\n\n### Fixed\n\n- Bug.",
    );
    expect(sectionBody(out, "Unreleased")).toBe("");
    expect(out).toContain(`[0.3.0]: ${REPO}/releases/tag/v0.3.0-2`);
    expect(out.match(/## \[0\.3\.0\]/g)).toHaveLength(1);
  });

  it("puts a merged category before Internal", () => {
    const base = md("\n### Added\n\n- A.\n").replace(
      "- Old change.\n",
      "- Old change.\n\n### Internal\n\n- I.\n",
    );
    const out = stamp(base, { version: "0.3.0", date: "2026-10-01", tag: "t" });
    expect(sectionBody(out, "0.3.0")).toBe(
      "### Changed\n\n- Old change.\n\n### Added\n\n- A.\n\n### Internal\n\n- I.",
    );
  });

  it("leaves the file alone when Unreleased is empty", () => {
    const empty = md("\n");
    expect(stamp(empty, { version: "0.4.0", date: "d", tag: "t" })).toBe(empty);
  });

  it("accepts CRLF input", () => {
    const out = stamp(md(PENDING).replace(/\n/g, "\r\n"), {
      version: "0.4.0",
      date: "2026-10-01",
      tag: "t",
    });
    expect(out).toContain("## [0.4.0] - 2026-10-01\n\n### Added");
  });
});

describe("sectionBody", () => {
  it("returns a version's body without the link refs", () => {
    expect(sectionBody(md(PENDING), "0.3.0")).toBe("### Changed\n\n- Old change.");
    expect(sectionBody(md(PENDING), "9.9.9")).toBeNull();
  });
});
