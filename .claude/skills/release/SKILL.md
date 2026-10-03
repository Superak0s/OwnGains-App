---
name: release
description: Cut an OwnGains release: runs the pre-flight checks, works out which release.sh flags this release needs, and hands over the exact command to run. Use when asked to release, cut a version, or publish a new APK or Play Store AAB.
disable-model-invocation: true
---

# Cutting an OwnGains release

`scripts/release.sh` is the whole release path: version bump → `npm install` → lint →
a11y → typecheck → jest → prebuild → signed per-ABI APKs, then a signed AAB, via
`local-expo-build` → git push → `gh release create`. It takes six phases and several minutes, and it reverts the version
bump on failure but not the prebuild.

**You do not run it.** It prompts for the version choice and the commit message on stdin,
and this session's shell has no stdin. The run would read EOF and take the defaults, or
hang. Your job is everything up to the command, then the handover.

## Steps

1. **Check the tree is releasable.** A release commits `git add .`, so anything dirty goes into the release.

   ```bash
   git status --short
   git log --oneline -5
   node -p "require('./package.json').version + ' / ' + require('./app.json').expo.version"
   ```

   Report uncommitted files and let the user decide. Do not commit or stash for them. If
   `package.json` and `app.json` versions already disagree, say so: the bump writes both,
   so a mismatch means a previous run was interrupted.

2. **Run the verification the script will run**, so a failure costs seconds instead of
   showing up four minutes into a build:

   ```bash
   npm run lint && npm run lint:a11y && npx tsc --noEmit && npm test -- --silent
   ```

   If any of these fail, stop and report. Do not suggest `--no-test` to get past a real
   test failure. It is meant for a slow local run.

3. **Decide the flags.** Check whether native dependencies changed since the last release
   tag. A new or upgraded `expo-*` / `react-native-*` package, or an edit under
   `plugins/`, means the incremental prebuild is not enough:

   ```bash
   git diff "$(git describe --tags --abbrev=0)"..HEAD -- package.json plugins/ app.json
   ```

   - native deps or `plugins/` changed, or `app.json` config changed → no flag (the
     default is a clean prebuild)
   - otherwise → `--no-prebuild` for a faster incremental build
   - `--no-push` only if the user explicitly wants the bump kept local
   - `--no-test` only if the user explicitly asks to skip jest
   - `--no-version-code` only if the user explicitly wants `android.versionCode` left
     alone. By default it goes up by 1 on every run, even when the version is kept. Play
     rejects an AAB that reuses a code, so skipping the bump makes this build unuploadable
     if the previous one already went to Play.
   - `apk` if the user only wants a GitHub release and not a Play Store upload. It
     saves the second gradle pass (`bundleRelease`).

4. **Check the changelog has something to release.** The script moves `[Unreleased]` in
   `CHANGELOG.md` under the new version's heading before building (the app shows it
   under Settings -> What's New, and it becomes the GitHub release notes), and it stops
   if `[Unreleased]` is empty:

   ```bash
   node scripts/release-changelog.js check && sed -n '/^## \[Unreleased\]/,/^## \[[0-9]/p' CHANGELOG.md
   ```

   If it's empty, compare against `git log` since the last tag and offer to write the
   missing entries. The script releases with empty notes if the user says there is
   nothing to note. Also flag entries that are vague or written for developers under a
   user-facing heading, since users read them in the app.

5. **Check `gh` is authenticated**, because phase 6 fails at the very end otherwise, after the
   full build:

   ```bash
   gh auth status
   ```

6. **Hand over.** Tell the user the exact command to run in their own terminal, the
   version it will bump to, and which of the four version options to pick:

   ```
   bash scripts/release.sh [apk] [--no-prebuild] [--no-version-code]
   ```

   Note what it will ask for: the version choice (1 patch / 2 minor / 3 custom / 4 keep
   current) and a commit message. Both are asked up front so the rest is unattended.

   Tell them where the output goes, in `release/`: `OwnGains-v<version>-<abi>.apk` per ABI
   (these are what get attached to the GitHub release) and, unless `apk`,
   `OwnGains-v<version>-<versionCode>.aab`, which remains local for a manual Play Console
   upload.

## Notes

- Builds are local only. This project does not use EAS. `--no-sync` in the script is
  there to stop `local-expo-build` pushing a versionCode to it.
- One-time setup the script does not do: `npx local-expo-build keystore import <your.jks>`.
  If the user has never released from this machine, the APK phase fails without it. The
  signing secrets file is not in this checkout, so never invent values for it.
- Under WSL on a `/mnt/c` path the script mirrors the project to `$HOME` and builds there,
  because gradle over 9p is unusably slow. The `.git` directory is not mirrored, so the
  push and release phases run back in the original tree.
- The script prints a reminder about `xlsx` being pinned to a SheetJS CDN tarball, which
  makes it invisible to `npm audit`. If it appears, relay it: it needs a human to check
  <https://cdn.sheetjs.com/> for a newer release.
- The tag is `v<version>-<timestamp>`, so re-releasing the same version never collides.
