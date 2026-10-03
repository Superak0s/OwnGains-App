# Changelog

Every change to this project gets an entry here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Add an entry under **Unreleased** in the same change that introduces it. At release time `scripts/release.sh` renames that section to the new version and date.

## [Unreleased]

### Changed

- The web account-deletion page also explains how to delete your data while keeping the account.
- The "this server doesn't store your data" notice on Supplements now has a close button, hides itself after a few seconds, and stops appearing after you've seen it three times. Tracking now shows the same notice when the server doesn't store body tracking.

### Fixed

- The dashed outline around widgets no longer stays after tapping Done when editing widgets.
- When a trainer opens a session for a trainee who has no program yet, the screen now says the trainee hasn't set one up (instead of telling the trainer to upload a file), and the session bar no longer slides under the status bar or shows a useless Day picker.
- Syncing a large offline backlog now pauses when the server says "too many requests" and resumes later, instead of failing the rest of the queue.

### Internal

- `release.sh debug` builds only a debug APK (no bump, checks, commit, push or release).
- `release.sh` takes words for what/where (`apk`, `aab`, `debug`, `wsl`, with `apk`/`aab` replacing `--no-aab`/`--no-apk`) and `--options` for how. `-h` groups them by pipeline step and conflicting combinations now error.
- `release.sh` builds only the arm64-v8a APK by default (`--32bit` adds armeabi-v7a, replacing `--no-32bit`) and deletes older APKs/AABs from `release/` after a successful build.
- `release.sh wsl` re-runs the script inside WSL from Git Bash.
- Removed unused scripts: `wsl-build.sh`, `reset-changelog.js`, `find_emojis.py`.
- Rate-limit (HTTP 429) responses are no longer sent as crash reports.

## [0.1.4] - 2026-10-02

### Internal

- `release.sh` gains `--bump=patch|minor|keep|X.Y.Z`, `--message=MSG` (unattended runs), `--no-release`, `--draft` and `--prerelease`.
- `release.sh` deletes older AABs from `release/` once the new one is built and verified.
- `release.sh --no-apk` builds only the AAB and skips the GitHub release.

## [0.1.3] - 2026-10-02

### Internal

- `release.sh` aborts up front if the keystore can't be opened with its configured password and alias, and after the build if the release build uses the debug key or the AAB is debug-signed.
- `release.sh` verifies the keystore's key password up front, not just the store password.
- `release.sh` normalizes Expo's `signingConfig = signingConfigs.debug` so the release keystore gets wired and builds are no longer debug-signed.

## [0.1.2] - 2026-10-02

### Added

- Settings → About has a Give Feedback button that opens an email to the developer, with the app version in the subject.

### Changed

- Terms of Service updated (October 2026): you must be 16 or older, reports are reviewed by hand and decisions can be appealed, 30 days' notice before the official server shuts down or removes an account, Ko-fi tips in GitHub builds, and consumer rights in your own country are kept.
- The privacy policy, Terms of Service and account-deletion page now give the operator's full name and postal address.
- The privacy policy now lists every outside service that can see your data, explains live watching, what the export contains, what happens on consent withdrawal, security and breach notice, and how the policy changes. It also covers Cloudflare, which proxies traffic to the official servers, and the Umami visit statistics on the official server's web pages. The web account-deletion page lists how long backups, logs and crash reports outlast a deleted account.

### Fixed

- The web privacy policy, terms and account-deletion pages show the contact email again. Behind Cloudflare it appeared as "[email protected]".

### Security

- Export My Data contains only the signed-in account's data, including its progress photos, never other profiles on the device.
- Withdrawing health consent stops with an error if the server could not delete the data, instead of switching to offline mode silently.
- Performance traces no longer include the server address or any query string.
- Signing out restarts crash reporting so the next account's reports are not tagged with the previous account.
- While a friend is watching your workout, the workout screen shows who it is, with a Stop button that revokes their permission.
- If your server starts storing more of your health data, the app asks for your consent again before syncing it.
- The consent screen names the server and who runs it, lists exactly what health data it will store, asks you to confirm you are 16 or older, and lets you decline and sign out.
- The Trainer Access description now says a trainer can see your notes and watch your workouts live.

### Internal

- Tests for span scrubbing, per-feature health re-consent and per-user export.

## [0.1.1] - 2026-10-02

### Internal

- Shell scripts are forced to LF line endings so they run under WSL.

## [0.1.0] - 2026-10-01

### Added

- Initial release.
