---
name: readme-audit
description: Use when asked to audit, check, refresh or update README.md in OwnGains, when the stop-readme hook reports feature code changed without a README edit, or after adding, removing or renaming a feature, screen, dependency, plugin, native module, permission or npm script. Finds where README.md disagrees with the repo and fixes it.
---

# README audit

README.md is the user- and contributor-facing description of the app. It drifts whenever a
feature, dependency or script changes without it. This skill finds each claim that no
longer matches the repo and fixes it in place.

## Scope

- **Targeted** (the hook fired, or one feature changed): check only the README sections that
  describe the changed files. Usually one "What you can do" subsection, plus Architecture if
  a service, hook or util path moved.
- **Full** (asked to audit the README): run every check below.

## Checks

Verify each against the code, never against CLAUDE.md or another doc, which can be just as stale.

| README section | Source of truth |
|---|---|
| What you can do (feature bullets) | `src/features/*/` screens and components, `CHANGELOG.md` released sections since the last README edit (`git log -1 --format=%H -- README.md`, then `git diff <sha> -- CHANGELOG.md`) |
| Offline is the default / Privacy | `appMode.tsx`, `localOnlyFeatures.ts`, `PrivacyPolicyScreen`, consent switches in `crashReporting.tsx` |
| Stack | `package.json` versions and dependencies (each named package must still be installed, and each new runtime dependency with a visible role belongs somewhere) |
| Architecture | every file path and folder named must exist (`ls`/Glob each one). `src/features/` folders, `plugins/*.js`, `modules/*` must each be listed or deliberately omitted |
| Main screens | the tab navigator and Track sub-tabs in the code |
| Development / Building a release | `package.json` `scripts`, `scripts/release.sh -h` flags, `.github/workflows/ci.yml` |
| App identity | `app.json` (`name`, `slug`, `android.package`, `android.permissions`, `android.blockedPermissions`) |
| Counts (exercises, boards, etc.) | compute them, e.g. the length of `src/data/exercises.json` |

Grep the README for every backticked path and confirm it exists. Dead paths are the most common drift.

## Writing the fix

- Edit only what is wrong or missing. Keep the existing structure, headings, emoji and tone.
- Feature bullets describe what a user can do, not which file does it. File paths belong only in Technical overview.
- Server-only features say so (the `_(server mode)_` marker), and anything that stays on-device in server mode says that.
- Follow CLAUDE.md "Prose Style": no em/en dashes, no semicolons, no stock filler, literal verbs.
- Don't invent features from branch names or TODO.md. Only what is in the code on disk.
- If a privacy claim changes (what is stored, sent or kept local), flag it to the user. The legal screens may need the same change.

## Finish

1. Add one `### Internal` line under `[Unreleased]` in `CHANGELOG.md` (e.g. `README updated for <feature>`), or update the existing README line there.
2. Report what changed in a short list, plus any drift you saw but left for the user (privacy wording, things that need a decision).
