# OwnGains

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/superak0s)

**Your entire gym life in one app. It works completely offline, without an account, a server or a signup.**

OwnGains is a fitness tracking app that puts you in control. Build your split, log your workouts, track your body, manage your supplements, and analyze your progress, all from your phone. Unlike every other fitness app, OwnGains doesn't force you into the cloud: it runs **100% offline** with everything stored privately on your device, and the cloud is a strictly optional extra.

---

## 📴 Offline is the default, not a fallback

**You can use every core part of OwnGains without ever creating an account, connecting to the internet, or trusting anyone else's server.**

Open the app, pick Offline mode in onboarding, and you're in, without an email, password or login screen. A local profile is created for you on the spot. From then on, **everything is stored on your device**: your program, every logged set, body weight, progress photos, macros, measurements, supplements, streaks, and all your analytics. Nothing is uploaded. The only network requests are exercise demonstration photos (switchable off) and any crash reports you opt into. There is no account to delete, because there was never an account.

- **No server required, ever.** The full workout tracker, planner, split builder, body tracking, supplements, analytics, themes, and widgets all work with zero infrastructure.
- **Works in a dead-zone gym.** Concrete basement with no signal is the normal case, not an edge case. The app never waits on a network call to let you log a set.
- **Your data is yours, on your hardware.** In offline mode none of your data leaves the phone, and a full backup (including progress photos) exports to one passphrase-encrypted file you can keep, move to a new phone, and restore.
- **Offline-first even when you're online.** In server mode, sets logged without connectivity are queued locally and replayed automatically when you reconnect. Local session IDs are remapped to server IDs, and anything that fails remains in the queue instead of disappearing.
- **Optional server, on your terms.** Server mode only adds cross-device sync and the social/live features. You can use the official server at `owngains.superak0s.com`, run by the developer in Greece, or your own self-hosted [OwnGains Server](../OwnGains-Server), and the login screen can find a self-hosted server on your LAN over mDNS so you never type an IP.
- **A server can keep features on-device.** It can declare features it would rather not store (tracking and supplements, today). The official server does exactly that, so body tracking, progress photos, cycle data and supplements never leave your phone even in server mode. The app picks that list up and keeps those features local-only while everything else still syncs. Settings shows which ones under "Kept On This Device".
- **Switch anytime.** Offline vs. server mode is chosen at onboarding, and Settings or the login screen can take you back there. The change applies immediately, with no restart.

---

## What you can do

### 🧱 Build your split properly

Split creation is a core feature. You can start from a template, from a spreadsheet, or from nothing at all.

- **Build a split from scratch, day by day.** "Create New Split" opens a full builder: name the split, add as many days as you want, name each day (with autocomplete from your existing day names and the built-in templates), and fill each day with exercises and set counts. Days collapse and expand as you work, so a 6-day split is still readable.
- **Pick exercises from the bundled database.** Each day's exercise picker searches 873 canonical exercises with a **tri-state muscle filter** (tap a muscle once to require it, again to exclude it) and shows the primary muscles and equipment for every result. Muscle groups are filled in from the database, so you don't hand-type them.
- **Start from a built-in template.** Push Pull Legs, Full Body, and Upper/Lower come with the app, pre-populated with days and exercises. Load one as-is or open it in the builder and make it yours.
- **Insert or replace.** With a program already loaded, a new split can either **start a new program** or be **inserted into your current one**, so you can bolt an extra block onto what you're already running.
- **Edit an existing split at any time.** Reopen any split in the same builder to rename days, add or remove exercises, and adjust set counts. Changes are written straight back into your program.
- **Import a split from a spreadsheet.** Upload `.ods` / `.xlsx` / `.xls` and the parser reads your days, exercises, muscle groups, and set counts. Exercise names are fuzzy-matched against the bundled database (abbreviations like `db`, `rdl`, `ohp` included). Confident matches are accepted automatically and the rest go to a review modal where you pick the right one. Sample spreadsheets to try it with are in [`example-programs/`](example-programs/).
- **Multi-person split columns.** A spreadsheet with a column per training partner becomes selectable splits in the app. Pick which one you're training as, and everyone's set counts are kept separate in the same program.
- **Weekly volume as you build.** A per-muscle weekly set count (a primary muscle counts 1, a secondary one 0.5) for the split you have selected.
- **Export your program** for backup or to hand to someone else.

### 🏋️ Track your workouts

- **Log sets as you lift**: weight, reps, notes, and warm-up flags, set by set.
- **Reps in reserve**: rate each set's effort as reps left in the tank (sets logged with the old RPE scale are converted automatically).
- **Auto-progression prompt**: the next set's weight is suggested from your last set's reps and reps in reserve (toggleable).
- **Demonstration photos**: reference photos for an exercise, with your own alignment guides drawn over them. Switchable off, and then nothing is downloaded at all.
- **Rest timer & smart time estimates**: see how long you've rested and get an estimated time remaining and finish time for the session based on your pace.
- **PR celebration & live session stats**: personal records are called out as you hit them, and a running ticker tracks the session.
- **Add exercises or extra sets on the fly** mid-workout, with the same fuzzy matching so nothing gets duplicated.
- **Day locking & weekly reset**: completed days lock until your week resets, keeping you on schedule (with manual unlock overrides when you need them).

### 📊 See your progress

- **Per-exercise analytics** with charts for weight and rep trends over time.
- **Estimated 1RM**: current estimate, all-time best, and trend across sessions.
- **Personal records**: heaviest set, most reps, best estimated 1RM, each with the date you hit it.
- **Rep max table**: your actual best weight at every rep count from 1 to 12.
- **Progress rate**: how fast your estimated 1RM is moving in kg/week, with a stall warning.
- **Rep range split**: share of working sets trained in the strength, hypertrophy, and endurance ranges.
- **Training frequency**: sessions per week, typical gap between sessions, days since the last one.
- **Rest & fatigue**: average rest between sets and how far reps fall off from the first set to the last.
- **Training summary**: volume and set counts by muscle group over today / this week / this month / a custom range, with undertrained muscle groups called out.
- Overlay your body weight against your lifting numbers to see the full picture.

### 📈 Track your body

Every tracking sub-tab is its own widget board: the calendar, the "today" card, the history list, and the charts are all widgets you can add, remove, resize, and reorder.

- **Weight**: daily weigh-ins in your preferred unit (kg/lb), with history and a trend chart.
- **Progress photos**: capture and store photos privately, with gallery view, zoomable full-screen view, side-by-side comparison, and muscle-group tagging. Photos are compressed on capture.
- **Macros**: log protein, carbs, fat, and calories against your goals.
- **Body fat**: track body-fat measurements over time (height-aware).
- **Body measurements**: log waist, arms, chest, and define your own custom measurement types.
- **Hydration**: daily water intake against a goal, plus a weekly goal view and history.
- **Soreness & DOMS**: log muscle soreness on an interactive muscle map, with a DOMS heat map, morning recovery check, follow-up tracking, a per-muscle dashboard with personal notes, recovery analytics, and injury logging/history.
- **Menstrual cycle**: log cycles, per-day flow intensity, and symptoms, with cycle status, predicted period windows, and calendar decorations.
- A universal calendar lets you jump to any date for any metric.

### 💊 Never miss a supplement

- Track your supplements and doses with fast quick-logging, per-supplement color/icon, and a daily streak.
- **Multiple doses a day**: set how many doses a supplement takes and the gap between them. The day's count fills in as you log each one.
- **Daily reminders**: local notifications at the times you set. They repeat on their own and keep working after a reboot, and they work offline like everything else.
- **Next-dose reminders**: logging a dose of a multi-dose supplement schedules a reminder for the next one, on time (Android asks you once to allow exact alarms).

### 👥 Train with friends _(server mode)_

- Add friends by username search or **QR friend codes**.
- **Granular sharing**: choose exactly what each friend can see: workout history, analytics, or your program.
- **Joint sessions**: work out together in real time, synced set-for-set.
- **Watch sessions**: spectate a friend's live workout as it happens.
- **Trainer mode**: grant a friend the trainer scope and they can drive your workout live from their own phone. The grant is workout read/write only: a trainer request can never touch your account or delete anything.
- **Blocking and reporting**: block or report an account, and manage blocked users from Settings.

### 🧩 Widget boards everywhere

Every screen has a customizable widget board. Add, remove, resize, and reorder widgets with a two-finger downward pull or the "Edit Widgets" panel. Each screen has an independent, per-user layout, fifteen boards in total:

- **Home:** next workout, weekly progress, workout history calendar, streak, **plus any widget from any other board**, so the home screen can borrow your weight trend, weekly volume, or friends list.
- **Analytics:** exercise/muscle selector, all set data, last workout, workout history, weight and rep progress, estimated 1RM, personal records, rep max table, progress rate, rep range split, training frequency, rest & fatigue
- **Workout:** day, total sets, progress, session stats
- **Plan:** build your plan, your splits, weekly volume, program
- **Friends:** friends list, pending requests, sent requests, QR code, username search
- **Tracking:** each sub-tab (Weight, Photos, Macros, Body Fat, Measurements, Hydration, Soreness, Menstrual) has its own board

### 🎨 Make it yours

- 7 built-in themes (Light, Dark, Yellow, Red, Green, Blue, Pink), plus automatic light/dark switching.
- **Create your own custom themes** with a full color editor.
- **Interactive tutorial**: coach-mark chapters with spotlights and practice mini-demos for each screen (home, plan, workout, progress, tracking, supplements, widgets, settings), plus friends, sharing, joint-session and trainer chapters in server mode. Reopen it any time from Settings.

### 🔧 Settings

- Account editing and password change
- **Tab order** (move any bottom tab earlier or later)
- Sync queue status with a manual "Sync Now"
- Rest-time, manual-time, auto-progression, exercise-photo and PR-celebration preferences
- Analytics comparison target, theme editor and lifetime stats
- Connected server, its version, and which features it keeps on-device
- Workout history editing, and importing history from a Strength Level CSV export
- An admin/test mode for recording data without touching your real stats

**About → What's New** shows the release notes for the installed version, with every earlier version a tap away and a filter for added, changed, fixed or removed.

Under **Privacy and Data**: the privacy policy, **Export My Data**, **full device backup and restore of everything including progress photos, encrypted with a passphrase you choose**, opt-in crash reports, opt-in usage metrics, blocked users, and **Delete Account**.

## Privacy

- Offline mode sends none of your data anywhere. There is no account and no telemetry by default. The only requests are exercise photos from GitHub (switchable off) and any crash reports you opt into.
- The official server (`owngains.superak0s.com`) is run by the developer on their own hardware in Greece. It stores accounts, workouts, programs and friends, but not tracking or supplement data, which stay on the device.
- Crash reporting and usage metrics are both opt-in, chosen on first sign-in, changeable in Settings at any time. Reports go to the developer's self-hosted [GlitchTip](https://glitchtip.com) instance (`glitchtip.superak0s.com`), not to Sentry's cloud.
- Backups are encrypted with a passphrase you choose, so an exported file is useless to anyone else.
- Delete Account wipes everything: the local profile and database offline, and your account with every row attached to it on the server you are signed in to. Only moderation reports are kept after the account is deleted, unlinked from it.
- Android permissions are limited to notifications, vibrate, boot-completed (to restore reminders), exact alarms (so a next-dose reminder isn't delayed), internet, and Wi-Fi state/multicast (for LAN server discovery). Unused permissions are actively pruned out of the manifest at build time.

The web copies of the legal text are generated from the in-app screens: [privacy policy](docs/privacy-policy.html), [terms of service](docs/terms-of-service.html), [account deletion](docs/delete-account.html). Run `npm run build:privacy-policy` after editing either screen.

---

## Technical overview

### Stack

- **React Native 0.86.3** + **React 19.2.3** on **Expo ~57** (New Architecture, Hermes), written in **TypeScript ~6.0**.
- **Navigation:** React Navigation v7 (native-stack + a custom animated, collapsible bottom tab bar).
- **State:** React Context (no Redux): `AuthContext`, `WorkoutContext`, `ThemeContext`, `TabBarContext`, `JointSessionContext`, plus custom hooks under `src/shared/context/hooks`.
- **Local storage:** **`expo-sqlite`** (WAL mode) behind `src/shared/services/sqliteStorage.tsx`, a key/value + record store. Plus `expo-file-system` for photos and `expo-secure-store` for auth tokens.
- **Charts:** `react-native-chart-kit` + `react-native-svg`.
- **UI/animation:** `react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, `expo-linear-gradient`, `react-native-pager-view`, `react-native-safe-area-context`, `react-native-screens`.
- **Media/files:** `expo-camera` (also scans friend QR codes), `expo-image`, `expo-image-picker`, `expo-image-manipulator`, `expo-document-picker`, `expo-sharing`, `xlsx`, `react-native-qrcode-svg`.
- **Crypto:** `expo-crypto` for AES-GCM backup encryption over a PBKDF2-derived key.
- **Notifications:** `expo-notifications` (local, repeating daily triggers).
- **Networking/discovery:** `react-native-zeroconf` (mDNS LAN server discovery) and a WebSocket for real-time features.
- **Crash reporting:** `@sentry/react-native` reporting to a self-hosted [GlitchTip](https://glitchtip.com) (Sentry-compatible), DSN from `EXPO_PUBLIC_SENTRY_DSN`. GlitchTip receives errors, performance traces and structured logs. It has no session tracking (so no crash-free or active-user rates) and doesn't document support for the SDK's metrics API. To confirm what actually arrives, use Settings → diagnostics → send test event.
- **Device/system:** `expo-dev-client`, `expo-constants`, `expo-navigation-bar`, `expo-status-bar`, `expo-splash-screen`, `expo-system-ui`, `@react-native-community/datetimepicker`.

### Architecture

- Feature-based layout under `src/features/<feature>/`: screen(s) plus, where needed, `components/`, `hooks/`, `utils/`, `widgets.ts`, and a `services/` folder split into **`on/`** (server) and **`off/`** (offline) versions. `friends` is the exception: it is server-mediated by nature and has no `off/` twin. `analytics`, `homescreen` and `settings` have no services of their own and read other features' data.
- **App mode dispatch** (`src/shared/services/appMode.tsx` + `dispatchProxy.tsx`): every service call is routed to the `on/` or `off/` version at call time based on the current mode (persisted under `appMode`). A contract test fails if an `on/` module exports something its `off/` twin doesn't, so the two modes can't silently diverge.
- **Per-feature local-only override** (`src/shared/services/localOnlyFeatures.ts`): a server publishes on `/healthz` the features it does not store, and those dispatch to `off/` even in online mode. The list is cached against the server URL it came from, so a cold start with no network doesn't post to routes that would 404.
- **Split building** (`src/features/plan/utils/`): `splitTemplates.tsx` turns the built-in templates (`defaultSplits.json`) into a program, `splitDraft.ts` converts a program back into editable day drafts and writes edits into the right split column, and `matchProgram.ts` + `src/utils/exerciseDb.ts` do the fuzzy matching against the bundled 873-exercise database.
- **Offline sync queue** (`src/shared/context/hooks/useSyncManager.tsx`): sessions started offline get `local_` IDs. On reconnect, queued `startSession` / `recordSet` / `endSession` operations are replayed and local IDs are remapped to server IDs. Failed ops stay queued and are visible in Settings.
- **Auth** (server mode): JWT refreshed a minute before it expires, plus one deduplicated refresh-and-retry on any 401. Only an explicit credential rejection logs you out. A server error or dropped connection keeps the session. Tokens in `expo-secure-store`. Default server `https://owngains.superak0s.com`, overridable in Settings (`@server_url`). A minimum-server-version check (`serverVersion.ts`) warns when a self-hosted server is too old for the app build.
- **Real-time:** one persistent WebSocket (JWT-authenticated, exponential backoff) powers joint, watch, and trainer sessions in server mode.
- **Trainer mode:** every trainee-targeted request goes through `traineeFetch(traineeId)`, which refuses `/api/auth/*` routes and any `DELETE` client-side, so the grant covers workout read/write and nothing else.
- **Reminders:** local scheduled notifications using `expo-notifications`' repeating `DAILY` trigger (`tasks/supplementReminders.tsx`).
- **Widget system** (`src/shared/context/hooks/useWidgets.tsx`): a shared placement/drag engine. Each screen defines its own registry, defaults, and storage key. A two-finger pull opens the gallery (a dev-only button does the same on emulators, which can't produce the gesture).
- **Storage migrations** (`src/shared/services/storageMigrations.ts`): versioned, append-only rewrites of persisted data, run once each against SQLite's `user_version`, each in its own transaction.
- **Backup** (`src/utils/deviceBackup.ts` + `src/utils/exportEncryption.ts`): exports the whole SQLite store plus base64 progress photos to one passphrase-encrypted file, and re-points photo URIs on restore so images still load after a reinstall.
- **Expo config plugins** (applied during prebuild): `withGradleTuning` (JVM tuning), `withDebugAppIdSuffix` (debug build installs side by side with the release build), `withAndroidNetworkSecurity` (cleartext to a self-hosted LAN server), `withAbiSplits` (one release APK per CPU architecture instead of one universal APK. The AAB is unaffected).
- **Local native module** (`modules/exact-alarms`): checks Android's exact-alarm permission and opens its settings page, so next-dose reminders fire on time.

### Main screens

Home · Workout · Plan · Progress (Analytics) · Track (Weight / Photos / Macros / Body Fat / Measurements / Hydration / Soreness / Menstrual) · Supps · Friends · Settings.

### Path aliases

`@features`, `@shared`, `@utils`, declared once in `tsconfig.json` `paths` (Metro reads them natively) and mirrored in the Jest `moduleNameMapper`.

---

## Development

Requires Node 22 and Python 3 (used by `lint:a11y` and the audit scripts). Copy `.env.example` to `.env` to set `EXPO_PUBLIC_SENTRY_DSN` (crash reports. Dev builds send nothing unless `EXPO_PUBLIC_SENTRY_FORCE_ENABLE=true`).

```bash
npm install --legacy-peer-deps   # required: peer deps are not resolvable otherwise
npm start                        # Expo dev server
npm run android                  # prebuild + run on Android (dev client, not Expo Go)
npm test                         # jest / jest-expo (always writes coverage/)
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint
npm run lint:a11y                # fails on icon-only controls with no accessibilityLabel
npm run build:privacy-policy     # regenerate the docs/ legal pages from the in-app screens
npm run build:third-party-notices # regenerate docs/third-party-notices.md after dependency changes
npm run check:all                # app + sibling server + live smoke test + API audit in one run
python scripts/api_audit.py      # cross-check the app's API calls against the server's routes
```

`check:all` expects the server checkout at `../OwnGains-Server` (override with `OWNGAINS_SERVER_DIR`) and takes `--quick`, `--no-db`, `--app-only`, `--server-only` and `--strict`. CI (`.github/workflows/ci.yml`) runs lint, the icon-label check, typecheck and tests on every push to `main` and on pull requests.

`android/` is a generated directory (`npx expo prebuild --platform android --clean`) and is gitignored. iOS is configured in `app.json` but not maintained, and there is no `ios/` target.

### Feature workflow

Each new feature gets its own branch and is merged into `main` as one commit after review:

```bash
git checkout main && git pull            # start from a clean, up-to-date main
git checkout -b feat/<short-name>        # build and commit here, never on main
# ...review with: git diff main...feat/<short-name>
git checkout main
git merge --squash feat/<short-name>     # once approved
npm run typecheck && npm run lint && npm test
git commit -m "feat(<area>): <summary>"
git branch -D feat/<short-name>          # -D: a squashed branch looks unmerged to git
```

Nothing is pushed until you choose to. If two branches both add to `CHANGELOG.md` under **Unreleased**, keep both sets of lines when resolving the conflict.

## Building a release

Builds are **local only**. This project does not use EAS.

```bash
npm run build:android:apk         # signed per-ABI APKs via local-expo-build
npm run build:android:apk:clean   # with a clean prebuild
npm run build:android:apk:debug   # debug APK, no prebuild
npm run build:android:aab         # AAB
```

`scripts/release.sh` is the full release path: version bump → lint/typecheck/test → prebuild → signed APKs + AAB → git push → `gh release create`. One script for Windows (Git Bash), WSL, and native Linux. It prompts for the version and commit message, stamps `CHANGELOG.md` (the `Unreleased` section becomes the release notes, so it must not be empty), and takes the words `apk`/`aab` (build only that artifact), `debug` and `wsl`, plus `--no-prebuild`, `--no-push`, `--no-test`, `--no-version-code`, `--32bit` and `--no-sourcemaps` (`-h` lists them all).

Signing uses `keystore.properties` plus a secrets file (`~/.owngains-secrets`, or `%USERPROFILE%\.owngains-secrets.bat` on Windows), all gitignored. Without them Gradle silently falls back to the debug key and the APK can't update an installed release. [`docs/release-checklist.md`](docs/release-checklist.md) covers the manual smoke test and Play Console checks.

Release APKs are split per CPU architecture. Most phones want the `arm64-v8a` one. `armeabi-v7a` is for older 32-bit devices.

## Changelog

User-facing changes are recorded in [CHANGELOG.md](CHANGELOG.md), newest first. If you're contributing, add a line under **Unreleased** in the same PR as your change.

The file is bundled into the app and shown under Settings → About → What's New, so write entries for the people using the app. Everything except the `Internal` section is visible there, and `Unreleased` appears only in debug builds.

## Support

OwnGains and the official server are built and run by one developer. If the app is useful to you, you can support development on [Ko-fi](https://ko-fi.com/superak0s), or with a one-time tip from Settings → Support Development in the Google Play version. The GitHub release APKs link to Ko-fi from the same spot, at the top of Settings.

## App identity

- Name: **OwnGains** · slug `owngains` · package `com.owngains.app` (debug installs alongside as `com.owngains.app.debug`)
- Android permissions: `POST_NOTIFICATIONS`, `VIBRATE`, `RECEIVE_BOOT_COMPLETED`, `SCHEDULE_EXACT_ALARM`, `INTERNET`, `ACCESS_WIFI_STATE`, `CHANGE_WIFI_MULTICAST_STATE`.

## License

The code is released under the [MIT License](LICENSE). The OwnGains name and app icon are not covered by it: a fork or redistributed build must use its own name and icon.

---

_The server is optional. OwnGains is designed to be fully useful with zero infrastructure. Server mode only adds cross-device sync and the social/live features._
