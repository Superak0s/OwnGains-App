# Changelog

Every change to this project gets an entry here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Add an entry under **Unreleased** in the same change that introduces it. At release time `scripts/release.sh` renames that section to the new version and date.

## [Unreleased]

## [0.3.0] - 2026-10-07

### Added

- New Weekly Sets widget in Progress: working sets this week and the 4-week average. For a muscle group it compares them with the 10 to 20 sets a week most muscles need to grow, counting sets where the muscle only assists as half.
- New Exercises widget for a muscle group: every exercise in the group with its own estimated 1RM and 30-day trend. Tap one to open its analytics.
- Trainers can send their plan to a trainee from the Trainer section of their Actions tab. The trainee sees it in the trainer's Program tab and can tap Use this plan to make it their own. Any shared program now has the same Use this plan button.
- Trend chart and history widgets for Body Fat, Macros, Measurements, Hydration and Cycle tracking, and a calendar and history for Soreness.
- New Health tab in Tracking on Android, with your steps, heart rate and sleep from Health Connect, plus trend charts for each.
- Keep Health Data in Settings, Health Connect (on by default) saves a daily copy of your steps, heart rate and sleep on this phone, so days older than Health Connect's 30-day limit remain. Turn it off to stop copying any Health Connect data and choose whether to delete what was saved.

### Changed

- The Next Workout widget on Home is more compact.
- The Analytics tabs are back in their default order (Exercise, Muscle Group, Training Summary). Any custom order or hidden tab there is reset once.
- Every main screen (Home, Workout, Plan, Analytics, Tracking, Supplements, Friends, Settings) now uses the same spacing around its edges.
- Training Summary opens on the last 90 days, with Last 30 Days, This Week and Custom as the other ranges, and sits closer to the tabs above it.
- The custom date picker in Training Summary highlights the chosen start and end dates, shades the days between them and marks the days you trained.
- Save and Log buttons stay pinned at the bottom of long forms instead of scrolling out of view.
- Tracking no longer shows "Loading your entries" each time you come back to it. Entries refresh in the background.
- In dark theme, the Support Development and Give Feedback buttons use darker colors.
- The Migrate to Offline Account button and the other Settings action buttons no longer have an outline, and the Advanced section no longer has a colored strip on its left edge.
- Muscle group analytics no longer show weight, 1RM, record or rest charts that pooled different exercises together. They focus on weekly sets, frequency and rep ranges instead.
- Personal Records now also lists your best weight at each rep count from 1 to 12.
- Your password manager now offers to save your username and password after you sign in or create an account.
- The Search tab in Friends is gone. A Find Friends search bar now sits at the top of the Friends tab, with a camera button beside it that scans a friend's QR code. Your own code is one tap away in the scanner.
- Starting a trainer session is quicker. Friends who gave you Trainer Access have a Train button in your friends list, Start Trainer Session is now at the top of a friend's Actions tab, and both open their workout right away.
- Sharing with a friend is easier to manage. Each permission has an on/off switch, they are grouped into Progress, Live workouts and Coaching, and turning on Analytics also turns on the History Access it needs. The list of what a friend shared with you only shows what they actually granted.
- The Compare against setting for undertrained muscles is now a row of buttons instead of a dropdown, with a new Last 30 days option that compares your sets over the past month with a month of your split.
- Weight Progress, Reps Progress, All Set Data and Last Workout are no longer on the Progress board by default. Boards that had them get Estimated 1RM or Personal Records instead, and you can add them back from the widget gallery. The weight, reps and set data widgets show only for a single exercise.
- The Macros Today widget shows its usual calorie and macro bars at 0 before anything is logged, instead of an empty placeholder.
- Screen titles share one style and match the tab names: Home, Plan, Progress, Tracking, Supplements, Friends and Settings. The emoji and the Friends tagline are gone.
- Every Tracking tab now shows the log widget first, then the trend chart, the calendar and the history. Existing boards are rearranged once and get any of these they were missing.
- Soreness is now logged by picking a muscle from a list, in a new Log Soreness widget at the top of the Recovery tab and from the calendar. The Morning Recovery Check is the second widget.
- The Morning Recovery Check no longer asks for a status next to the 0 to 10 intensity. Setting 0 marks a muscle recovered, and a lower number than last time counts as getting better. Each sore muscle comes up once a day, starting the day after you log it.
- The Morning Recovery Check is now on Home, above Today's Macros, and only appears when a sore muscle is due a check-in. Existing Home boards get it once.
- Hydration measurement error now works like the one for macros. Each drink gets its own ±% margin, set with + and - buttons in the Log hydration sheet (3% by default, also used by the Quick Settings tiles), and Water today shows the min-max range of your total next to it, like Macros Today does. Both leave the range out when it would only repeat the total. The margin is no longer a Hydration setting. Log Macros sets its margin with the same + and - buttons (5% by default).

### Removed

- The Muscle Map body diagram, from the Recovery tab, the soreness log sheet and the tutorial.
- The Rep Max Table widget. Personal Records now shows the same table, and boards that had it get Personal Records in its place.
- The water quick-log notification and its switch in Hydration settings. A notification left on from an earlier version is cleared when you open the app. The Quick Settings tiles still log water.

### Fixed

- Training Frequency and other analytics showed "No workout sessions found" when no plan was selected, even with logged sessions.
- The + and - buttons in tracking forms were invisible in dark theme.
- The "No timer" and amount placeholders in supplement settings were hard to read in dark theme.
- The friend search bar text was unreadable in dark theme.
- Your friend QR code was too dark for a camera to scan in dark theme. It is now always black on white.
- Fixed a "VirtualizedLists should never be nested" warning on the Friends screen.
- Small weight changes were invisible on the weight chart because it always started at 0. Weight, body fat, measurement and cycle charts now fit their scale to your values.
- Opening Tracking's photo comparison, the Friends workout details, deleting an exercise from a split day and some offline history lists crashed the app.

### Security

- The privacy policy explains that daily steps, heart rate and sleep summaries are kept on your device only.

### Internal

- Shared `SCREEN_PADDING` in `src/shared/layout.ts` for screen content padding.
- Fix the Kotlin compile error in the native autofill module (`Function` lambda must not early-return `Unit`).
- Fixed SonarQube findings: mechanical cleanups, misleading indentation in the offline supplement update, a broken regex in the `api_audit.py` self-test, cognitive-complexity splits across screens, hooks and `api_audit.py`, and the unused muscle params dropped from `startSession`
- Added tests for the Training Summary default range
- Storage migration 2 rewrites saved Analytics and Home layouts for the widgets taken off the default board and adds the two new Analytics widgets
- Added a shared `ScreenTitle` component
- `docs/play-release-notes.txt` holds the Play Store "What's new" text (500 character limit), kept in step with `[Unreleased]` per `CLAUDE.md`
- Deleted `hydrationNotification.ts`. The tile's quick-log moved into `hydrationTiles.tsx`. `expo-task-manager` is now unused.
- ESLint warns on import cycles and on calls through `any` (`import/no-cycle`, `no-unsafe-call`, `no-unsafe-member-access`).
- ESLint bans `toSorted`/`toReversed`/`toSpliced`, which Hermes lacks. Existing uses replaced.
- Storage migration reorders saved Tracking boards (`orderWidgetTypes`). Shared tracking chart helpers in `tracking/utils.ts`.
- `scripts/release.sh` uploads the AAB and Play release notes to Google Play when `.env` sets `PLAY_SERVICE_ACCOUNT` (`scripts/play-upload.js`, no new dependencies), then clears `docs/play-release-notes.txt`.

## [0.2.1] - 2026-10-06

### Added

- Settings → About links to the GitHub pages of the app and of OwnGains Server.
- Quick Settings tiles on Android. Add Water +250 ml or Water +500 ml to the pull-down panel to log a drink with one tap without opening the app, or Log water to open the Hydration tab of the Tracking screen with the log water sheet.

### Changed

- Hydration is now the first tab on the Tracking screen and the one it opens on. If you have reordered your tracking tabs, your order is kept.
- A sign-in from an app version before 0.1.4 that never received a refresh token now asks you to sign in again when it expires, instead of renewing itself.

### Fixed

- Tracking widgets on the Home screen now show entries you log on the Tracking screen. They refresh each time you return to Home, and the Tracking screen likewise picks up entries logged elsewhere.
- Logging water from the quick-log notification or a tile while the app is closed no longer contacts your server when it keeps that data on this phone. The app checks which features the server stores each time you open it or return to it, and keeps the last known answer while the server is unreachable.

- Switching to offline mode, or withdrawing health consent, now copies the workout history of every split to this phone, not only the current one. If the copy fails, the switch stops and the server deletes nothing, where before the server could erase history that was never copied.
- The health consent screen no longer lists programs among the data that withdrawing consent deletes from the server. The server keeps them.

### Security

- The app now declares the `WAKE_LOCK` permission so a tile tap can finish logging a drink while the app is closed. Android grants it at install without a prompt.

### Internal

- Moved `ApiError`/`ServerUnreachableError` into `apiErrorClasses.ts` to break the `crashReporting` and `apiError` require cycle.
- New local native module `modules/hydration-tiles` with the tile services and a headless JS task. The notification buttons and the tiles share `quickLogHydration`.
- Moved off the server routes and response keys kept only for older app builds: soreness follow-ups use the batch route, soreness and injury lists use `?status=active` and `?muscle=`, joint workout status uses the batch route with no per-friend fallback, received program shares fetch each payload from `/permissions/:id/payload`, and tracking responses are read from `data` only. Every released server version supports these.
- Removed every explicit `any` type and made ESLint's `no-explicit-any` an error.

## [0.2.0] - 2026-10-06

### Added

- Settings has a Health Connect section on Android. After you connect it, OwnGains imports your weight, body fat, hydration and nutrition from the last 30 days into your logs, again each time you open the app, or on demand with Sync Now. Entries you already have are not imported twice.
- Steps, Heart Rate and Sleep widgets for Home on Android show today's steps and heart rate and last night's sleep from Health Connect. They read it live and store nothing.
- Hydration settings on Android can turn on a quick-log notification. It stays in the notification shade, shows today's water total and has buttons for your first three presets that log a drink without opening the app.

### Changed

- Android 8.0 or later is required.

### Fixed

- Reopening OwnGains during a workout after Android closed it no longer sends a second rest reminder or inactivity warning, and logging a set or ending the workout after reopening it now cancels the reminder set before it closed.

### Security

- The app can ask for read-only Health Connect access to weight, body fat, hydration, nutrition, steps, heart rate and sleep. It never writes to Health Connect.
- The privacy policy describes what OwnGains reads from Health Connect and where it is kept.

### Internal

- Usage telemetry for Health Connect (connect, sync timing and counts, rejected imports) and the water quick-log notification (toggle, quick logs).

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
- The README links to OwnGains Server on GitHub instead of a relative sibling path.
- Added `expo-task-manager` so notification buttons can run while the app is closed. The default hydration presets moved to `tracking/services/types.ts`.
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
