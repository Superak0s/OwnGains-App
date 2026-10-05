# Changelog

Every change to this project gets an entry here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Add an entry under **Unreleased** in the same change that introduces it. At release time `scripts/release.sh` renames that section to the new version and date.

## [Unreleased]

### Added

- Settings has a Health Connect section on Android. After you connect it, OwnGains imports your weight, body fat, hydration and nutrition from the last 30 days into your logs, again each time you open the app, or on demand with Sync Now. Entries you already have are not imported twice.
- Steps, Heart Rate and Sleep widgets for Home on Android show today's steps and heart rate and last night's sleep from Health Connect. They read it live and store nothing.

### Changed

- Android 8.0 or later is required.

### Fixed

- Reopening OwnGains during a workout after Android closed it no longer sends a second rest reminder or inactivity warning, and logging a set or ending the workout after reopening it now cancels the reminder set before it closed.

### Security

- The app can ask for read-only Health Connect access to weight, body fat, hydration, nutrition, steps, heart rate and sleep. It never writes to Health Connect.
- The privacy policy describes what OwnGains reads from Health Connect and where it is kept.

### Internal

- Unused Android permissions are blocked through `android.blockedPermissions` in `app.json`, replacing the `withAndroidPermissionPruning` config plugin.
- Path aliases are declared once in `tsconfig.json` `paths` (Metro reads them natively) and mirrored in the Jest `moduleNameMapper`, replacing `babel-plugin-module-resolver`.
- The Babel config is cached per `NODE_ENV`, and the console-stripping plugin keeps a note on why Metro's `drop_console` can't replace it under Hermes.
- One shared `createEmitter` (`src/utils/emitter.ts`) replaces the hand-rolled pub/sub copies in app mode, onboarding, server URL, tab order, tutorial, trainer, local-only features, exercise selection and the workout store. It also stops a double unsubscribe from removing another listener.
- Tutorial state updates are serialized with the existing `withLock` instead of their own promise chain.
- The pending sync store loses its single-implementation interface and injection prop. Tests spy on the real store instead.
- Sync ids, idempotency keys and custom split ids come from the existing `generateId` instead of three inline copies.
- `githubUpdate` reuses `compareVersions` from `serverVersion` instead of its own version parser.
- Body weight lookup goes through the tracking dispatch proxy like every other tracking call.
- The two root error fallbacks share one view with a colour argument.
- Removed dead code: `exerciseGuides`, the tracking hooks barrel, `pendingSyncRows`, `getActiveInjuries`, `getAllPhotos`, `resetServerVersionStatus`, `parseSafeDate`, `getCycleStartIso`, the `CycleEntry` alias, `nowIso`, `SEVERITY_INK`, the `LOCALE` constant, unused `React` imports and five exports only used in their own file.
- `scripts/api_audit.py` reads the server routes from `OwnGains-Server/src/`, where they moved.
- Body fat entries can be stored without tape measurements, and `api-requests.md` specs the matching server change.
- Added the `react-native-health-connect` dependency and the `withHealthConnectRationale` config plugin, which opens the privacy policy from the Health Connect permission screen.
- Health Connect tests cover the importer's mapping, both dedup checks, failures, pruning, pagination, throttling and account switches, and the Home widget's foreground refresh.

## [0.1.7] - 2026-10-04

### Fixed

- When the server can't be reached, the app shows "Couldn't reach the server" instead of the raw connection error, and no longer files a crash report for it.
- Crash reports now include errors the app recovered from, such as a screen that failed to load, a sync step that failed, a tip that didn't go through, a set that couldn't be saved, offline workout data that had to be discarded, a session that couldn't be restored, a workout program that didn't sync, a friend's analytics that failed to load or an action that showed an error message, not only crashes.
- Tapping Join on an expired joint-session invite now removes the invite instead of leaving it on screen to fail again.
- Errors that happen while the app is starting up are now included in crash reports.
- Turning on crash reports now also covers crashes inside Android itself right away, not only after the app is restarted.

### Changed

- The "Before you start" screen asks about crash reports and usage metrics with "Accept all", "Necessary only" (crash reports) and "Reject all" buttons. Tap Settings to choose each one separately. Existing users see this question once more after updating, without having to accept the Terms again.
- Support Development and Give Feedback are now large, colorful buttons at the top of Settings instead of rows under About.
- The app opens faster in online mode: your saved day and progress appear right away, and the server's current day is checked in the background.
- Offline Analytics and Tracking screens load faster after the first visit.
- Long exercise progress charts show at most 60 points (always including your best and latest), so they draw faster.
- The Analytics and Plan tabs no longer re-render while you are on another tab.

### Security

- With usage metrics switched on, the app also reports how long each workout lasted and how many sets and exercises it had, which days you open the app, and how many days since your last workout (as a range), plus which settings, tutorial steps and suggestions you use. Exercise names, weights, reps and notes are never sent. The privacy policy and the consent screen describe this.

### Internal

- Release builds enable R8 optimized resource shrinking (`android.r8.optimizedResourceShrinking`).
- Usage counters, feature uses and sub-tab views are also sent as always-sampled transactions, because GlitchTip drops Sentry metrics. Events are tagged with the server's local-only features and the release channel (GitHub or Play), and the first screen load of each launch is always sampled so cold-start time is kept.
- Server sync skips writing completed and locked days when nothing changed, startup auth reads run in parallel, and an identical signed-in user no longer re-renders the whole app. Tests cover the record cache, chart downsampling and the unchanged-sync path.
- The app entry point is now `index.ts`, which starts crash reporting before `App.tsx` and its imports load. The Sentry envelope buffer is raised to 100.
- A rejected password, an expired session (HTTP 401/403) or a conflict such as a taken username (HTTP 409) is not sent as a crash report, wherever it is logged. Sign-in and sign-up network failures count as an unreachable server, LAN scan failures are no longer reported, and every report is labelled with a `stage`.
- Telemetry no longer calls `Sentry.metrics`, which GlitchTip ignores (`trace_metric`). Counts and millisecond timings (sync runs, API requests, LAN scans) are sent as transactions, other values (sync queue depth, match confidence, imported days) as `info` logs with a `value` attribute, and API retries as a log. Screen-load timings (`trackSpan`) are always their own transaction, so they are no longer sampled with the screen they belong to. Navigation and HTTP traces are sampled at 100% (was 10%) during closed testing.
- `scripts/release.sh`: Ctrl+C before the push reverts the version bump, changelog and new `release/` files, and deletes the WSL mirror

## [0.1.6] - 2026-10-04

### Fixed

- Opening the app after a long time no longer shows "Live features are offline" when the server is running. Live features reconnect once your session is renewed.

## [0.1.5] - 2026-10-04

### Added

- The "Before you start" screen has an "Allow both and continue" button that turns on crash reports and usage metrics in one tap.
- Fill Demo Data also adds demo friends (with shared workout history and one pending request), body tracking entries, placeholder progress photos (three per muscle for ten muscles, each naming its muscle in a different font so you can try comparing), a height for body fat when none is set, and supplements with dose logs. Remove Demo Data deletes all of it.

### Changed

- Crash reports and usage metrics are asked once per device. Signing out or switching accounts keeps your choice, and you can still change it in Settings → Privacy and Data.
- The web account-deletion page also explains how to delete your data while keeping the account.
- The Macros tab now shows Today's Macros first and the Body Fat tab shows Body Fat % first. Boards you have already rearranged keep your order.
- Fill Demo Data sends one request to the server instead of one per set, so it no longer runs into rate limits. Filling again replaces the earlier demo data instead of adding a second copy.
- The "this server doesn't store your data" notice on Supplements now has a close button, hides itself after a few seconds, and stops appearing after you've seen it three times. Tracking now shows the same notice when the server doesn't store body tracking.
- The ready-made splits in Plan are replaced with seven complete programs (Beginner Full Body, Dumbbell Full Body for home, Tiered Linear Progression, Upper / Lower, Push Pull Legs in 6 and 3 days, Body Part Split). Each day comes filled with exercises, sets, reps and a progression note. The template your current split was built from is highlighted in blue, and the highlight goes away once you switch splits, start a different one or change its exercises.
- The move arrows on widgets in edit mode are larger, outlined buttons in the accent color, so they are easier to spot and tap.
- Compare Photos opens with your earliest and latest days already selected. Each day is shown as a card with a thumbnail, its date (with the year when it isn't this year) and its photo count. The earlier pick is always labeled Before, tapping a selected day clears it, and a summary shows how many days apart the two are.

### Removed

- The "End, don't lock" choice when completing a workout. Ending a workout always locks the day.

### Fixed

- An expired session from before refresh tokens now renews or signs you out, instead of every screen failing to load while you still appear signed in.
- The Save Set button in Set Details now stays pinned at the bottom of the sheet, so you no longer have to scroll down to reach it.
- The dashed outline around widgets no longer stays after tapping Done when editing widgets.
- When a trainer opens a session for a trainee who has no program yet, the screen now says the trainee hasn't set one up (instead of telling the trainer to upload a file), and the session bar no longer slides under the status bar or shows a useless Day picker.
- Syncing a large offline backlog now pauses when the server says "too many requests" and resumes later, instead of failing the rest of the queue.

### Internal

- `release.sh debug` builds only a debug APK (no bump, checks, commit, push or release).
- `release.sh` takes words for what/where (`apk`, `aab`, `debug`, `wsl`, with `apk`/`aab` replacing `--no-aab`/`--no-apk`) and `--options` for how. `-h` leads with common commands and groups options by purpose, conflicting combinations now error, and output is colored with a plan summary up front and a final list of artifacts (`NO_COLOR` disables color).
- `release.sh` builds only the arm64-v8a APK by default (`--32bit` adds armeabi-v7a, replacing `--no-32bit`) and deletes older APKs/AABs from `release/` after a successful build.
- `release.sh wsl` re-runs the script inside WSL from Git Bash in an interactive shell, so `~/.bashrc` (nvm, `ANDROID_HOME`, tokens) loads as it does in a terminal. The script stops up front when no Android SDK is configured.
- Removed unused scripts: `wsl-build.sh`, `reset-changelog.js`, `find_emojis.py`.
- Rate-limit (HTTP 429) responses are no longer sent as crash reports.
- Debug builds default to the LAN dev server `http://192.168.10.243:5000`.
- Demo fill moved into the workout service (`fillDemoData`, `POST /api/sessions/demo` online, which also seeds tracking and supplements the server stores) plus a local seeder for local-only features that records what it created for removal.
- Added `expo-asset` as a direct dependency to load the bundled demo photos.

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
