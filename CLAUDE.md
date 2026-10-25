# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install --legacy-peer-deps   # required: peer deps are not resolvable otherwise
npm start                        # Expo dev server
npm run prebuild                 # expo prebuild --platform android --clean (regenerates android/)
npm run android                  # prebuild --clean, then expo run:android (no maintained iOS target)
npm test                         # jest / jest-expo, always writes coverage/ (collectCoverage is on)
npm run test:coverage
npx jest src/utils/__tests__/exerciseMatching.test.ts   # run a single test file
npm run typecheck                # tsc --noEmit
npm run lint                     # eslint (flat config; exhaustive-deps warnings are a known backlog)
npm run lint:a11y                # fails on icon-only controls with no accessibilityLabel
npx expo install --fix -- --legacy-peer-deps   # align deps after an Expo SDK bump
npm run build:android:aab        # Play Store bundle
npm run sonar:scan               # needs SONAR_TOKEN
npm run build:privacy-policy     # regenerate docs/privacy-policy.html
npm run build:third-party-notices # regenerate docs/third-party-notices.md (re-run after dependency changes)
npm run build:icons              # regenerate the derived icons in assets/ from adaptive-icon.png (pip install pillow numpy)
npm run check:all                # scripts/check-all.sh: app + sibling server + live smoke + API audit in one run (--quick, --no-db, --app-only, --server-only, --strict)
python scripts/api_audit.py      # cross-check app API calls vs the sibling server’s routes (exit 1 on findings)
python scripts/find_unused_styles.py [--apply]   # find/delete unused StyleSheet keys, each batch tsc-verified
```

There is no `ios/`. iOS is configured in `app.json` but not maintained, and `ios/`/`android/` are gitignored, **generated** directories (`npx expo prebuild --platform android --clean`). Run prebuild before any native build step.

### When to write tests

Not every function needs a test. Write one for non-trivial logic: branches, loops, parsers, calculations, and anything touching sync, auth, or money. Skip trivial one-liners, pure pass-throughs, and UI glue that's obviously correct by inspection. Every test goes in a `__tests__/` folder beside the code it covers, named `*.test.ts(x)` (e.g. `src/features/analytics/utils/__tests__/trainingSummary.test.ts`), never as a sibling file next to the source. The existing tests cluster around sync/offline-queue logic, auth token handling, fuzzy matching, and analytics calculations, not blanket coverage.

Every bug fix that gets a `Fixed` changelog entry also gets a regression test, committed with the fix. Check that it fails without the fix before relying on it.

### Release builds

Builds are local only. This project does not use EAS. `scripts/sync-eas-version.js` only pushes the built `versionCode` up to EAS and no-ops when `app.json` has no `projectId`.

- **Local** (via `local-expo-build`): `npm run build:android:apk` / `:clean` (full prebuild) / `:debug` (debug APK, no prebuild)
- `scripts/release.sh` is the full release path (version bump → lint/typecheck/test → prebuild → signed APKs + AAB via `local-expo-build` → git push → `gh release create` → Play upload). One script for Windows (Git Bash), WSL and native Linux. `scripts/release.sh --help` lists every flag. What the help leaves out:
  - Under WSL on a `/mnt/c` path it mirrors the project to `$HOME` first because gradle over 9p is unusably slow.
  - It refuses to run without `SENTRY_AUTH_TOKEN` unless given `--no-sourcemaps`, since crash reports would be unreadable.
  - Before building it stamps `CHANGELOG.md` (`scripts/release-changelog.js`): `[Unreleased]` becomes `[x.y.z] - date` with a fresh empty `[Unreleased]` above, and that section becomes the GitHub release notes.
  - Whenever an AAB is built and `.env` sets `PLAY_SERVICE_ACCOUNT` (the service-account JSON or a path to it), `scripts/play-upload.js` uploads it with `docs/play-release-notes.txt` as its "What's new" text, and empties that file once the upload succeeds. A failed upload only warns and prints the retry command.
  - It sets `KOFI_URL` in `src/shared/distribution.ts` for the APK build only (Settings links to Ko-fi there, and offers the Play Billing tip jar everywhere else) and fails if the AAB bundle contains the link, since Play's Payments policy bans external payment links. Keep that file `null` in commits.
  - Before the push it runs `.github/workflows/ci.yml` under `act` (needs act and Docker), so a broken lockfile or Linux-only failure is caught locally.
  - `plugins/withGradleTuning.js` sizes the Gradle/Kotlin heaps and worker count to the machine running prebuild.
- **Claude doesn't run it**: it pushes, publishes a GitHub release and uploads to Play. The `/release` skill does the pre-flight (dirty tree, lint/typecheck/test, native-dep check, `gh auth status`) and hands over the exact command for the user to run, with `--bump=` and `--message=` so the run needs no prompts.

## Architecture

OwnGains is an **offline-first** React Native/Expo fitness tracker. It works with zero backend (local device storage, no login) or can optionally sync against [OwnGains-Server](../OwnGains-Server) (Node/Express/MySQL, a sibling repo) for cross-device sync and social/live features.

There is an **official central server** at `https://owngains.superak0s.com` (the app's default server URL), run by the developer on their own hardware in Greece, with `LOCAL_ONLY_FEATURES=tracking,supplements`, so health/tracking data never reaches it. Self-hosted servers stay supported. The legal screens (`PrivacyPolicyScreen`, `TermsOfServiceScreen`, the delete page in `scripts/build-privacy-policy.js`) describe that setup (the controller, what the official server stores, retention, hosting location), so update them when any of it changes, including new server-side storage or logging.

### App-mode dispatch (the core pattern)

Every feature's `services/` folder is split into an **`on/`** (server) and **`off/`** (offline) version with the same call signature. `src/shared/services/dispatchProxy.tsx` + `appMode.tsx` route each call to the right implementation based on the persisted mode (`appMode` key, values `"online"`/`"offline"`, default `online`). The mode is chosen only in `OnboardingScreen`, behind the `@onboarding_complete` flag in `appMode.tsx`. The login screen and Settings clear that flag to send the user back there rather than switching mode themselves. `AuthContext` subscribes to `onAppModeChange` and does the rest: offline auto-connects a local profile, online drops the session so a real login is required. Switching takes effect immediately, without a restart. When touching a feature's service layer, check both `on/` and `off/`. A change usually needs to go into both, or the behavior will silently diverge between modes. `src/shared/services/__tests__/serviceModeContract.test.ts` enforces this: it fails if an `on/` module exports a name its `off/` twin doesn't.

All key/value persistence, including `appMode`, goes through `src/shared/services/sqliteStorage.tsx` (`expo-sqlite`, WAL mode), not `@react-native-async-storage/async-storage`. It replaced AsyncStorage app-wide for performance (one row per record instead of re-serializing a whole JSON array per write) and serializes calls per connection because `expo-sqlite`'s native binding breaks under concurrent statements on one `openDatabaseSync` connection: writes queue on the main connection, reads on a second one (WAL) and wait only for writes issued before them, and batches over 200 rows (and restores) run in `withExclusiveTransactionAsync` so they stay off the JS thread.

Offline sessions get `local_` IDs. `useSyncManager` (`src/shared/context/hooks/`) queues `startSession`/`recordSet`/`endSession` while offline and replays them on reconnect, remapping local IDs to server IDs. Failed ops remain in the queue.

A server can also force individual features offline while the app stays in online mode: `LOCAL_ONLY_FEATURES` on OwnGains-Server (today `tracking` and `supplements`, and the official server sets both) leaves those routes unmounted to save server disk, publishes the list on `GET /healthz`, and `src/shared/services/localOnlyFeatures.ts` caches it so `createDispatchProxy(on, off, feature)` picks `off/` for them. The list is persisted alongside the server URL it came from, so a cold start with no network keeps using the last known configuration rather than posting to routes that 404, and switching servers never inherits the previous one's answer. It is surfaced to the user in both places a server is chosen: an alert on save/reset in `LoginScreen`, and a permanent row under "Connected To" in `SettingsScreen`.

`friends`, `messages` and `trainer` don't follow the `on`/`off` split. They are inherently server-mediated, so their `services/index.tsx` wraps `on/` in `createOnlineOnlyProxy` (which throws `OFFLINE_UNAVAILABLE_MESSAGE` rather than letting offline mode reach the network) with no `off/` counterpart.

The `new-feature-service` skill creates the four files when adding a service module.

### Structure

```
src/
  features/          # analytics, auth, friends, healthConnect, homescreen, messages, plan, schedule, settings, supplements, tracking, trainer, tutorial, workout
                      # screen(s) + any of components/, hooks/, utils/, services/{on,off}/
                      # analytics, healthConnect, homescreen, settings and tutorial have no services/
  data/              # bundled exercise database (exercises.json/.ts)
  shared/
    components/       # CustomAlert, ModalSheet, ProgressChart, UniversalCalendar, ui (Button, Chip, Placeholder…), widgets/
    context/           # AuthContext, WorkoutContext, ThemeContext, TabBarContext, JointSessionContext
    context/hooks/      # useJointSession, useProgramOperations, useRealtimeSocket, useServerSync,
                         # useSessionOperations, useSyncManager, useTwoFingerPull, useWidgets
    services/          # apiClient, apiError, apiErrorClasses, appMode, appRole, authenticatedFetch, config, crashReporting,
                        # dispatchProxy, githubUpdate, jwt, lanDiscovery, localOnlyFeatures, notifications, offlineHelpers,
                        # pendingSyncStore, playUpdate, programDirty, serverVersion, sqliteStorage, startCrashReporting, storage,
                        # storageMigrations, supplementAlarms, supplementReminders, tabOrder, tokenStorage, traineeFetch, trainerEvents
    types.ts
  utils/              # format helpers, parsers
  test-utils/         # memorySqlite.ts: in-memory expo-sqlite used by __mocks__/expo-sqlite.js
scripts/              # build-privacy-policy, release.sh, sonar-scan.sh, api_audit.py,
                      # find_unused_styles.py, find-unlabeled-icons.py,
                      # plus the local-expo-build helpers (see Off-limits)
plugins/              # Expo config plugins, all applied during prebuild: withGradleTuning (JVM tuning),
                      # withDebugAppIdSuffix (side-by-side debug install),
                      # withAndroidNetworkSecurity (cleartext to a self-hosted LAN server)
                      # withAbiSplits (one release APK per ABI, ignored for the AAB)
                      # withHealthConnectRationale (Health Connect's rationale screen opens the privacy policy, as Play review requires)
                      # withCMakeVersion (pins CMake 3.31.6 so ninja handles Windows paths over 248 characters)
modules/              # local Android-only Expo modules (Kotlin), autolinked: autofill, exact-alarms (supplement alarms),
                      # hydration-tiles (Quick Settings water tiles). JS loads them with requireOptionalNativeModule,
                      # so they are null in Jest and Expo Go. Changes need a native rebuild.
```

`index.ts` is the entrypoint (`package.json` `main`): it imports `shared/services/startCrashReporting` before `App` so Sentry is running before any other module loads. `App.tsx` imports with relative paths (`./src/...`), not the `@features/@shared/@utils` aliases used everywhere else (configured in `tsconfig.json` `paths`, which Metro reads natively, and mirrored in the Jest `moduleNameMapper` in `package.json`).

### Widget system

Each screen (Home, Analytics, Workout, Plan, Friends, and each Tracking sub-tab) has an independent, per-user widget board driven by `useWidgets.tsx`: a registry of available widgets, defaults, and a persisted layout. Widgets are reorderable/resizable/removable via a two-finger pull gesture or the "Edit Widgets" panel. Fifteen boards in total, each with its own `STORAGE_KEYS.*_WIDGETS`.

The layout is persisted per user, so the code on disk is only half the state. `useWidgets` drops any stored instance whose `type` is no longer in the registry, which means **renaming a widget type silently deletes that widget from every existing user's board**, while every test passes and the diff looks correct. A rename needs a migration that rewrites the stored `type`. No test enforces registry/defaults agreement. Run the `widget-board-reviewer` agent after touching a registry or `useWidgets`.

### Other pieces

- **Auth (server mode):** JWT access token refreshed a minute before its `exp` claim, and on any 401 `authenticatedFetch` asks `AuthContext` for one deduplicated refresh and retries once. Only a 4xx refusal (`isCredentialRejection`) logs out. A 5xx/429/network failure keeps the session. Tokens in `expo-secure-store`. Default server `https://owngains.superak0s.com`, overridable in Settings (`@server_url`).
- **Real-time:** one persistent, JWT-authenticated WebSocket with exponential backoff (`useRealtimeSocket`), server mode only. It powers joint/watch sessions. Messages also arrive by FCM push (`src/features/messages/push.ts`) when the build has `google-services.json`, and over the socket only without it.
- **Trainer mode:** a friend can grant another user a `trainer` scope, letting them drive that user's workout as "act-as" (`WorkoutContext`, `TrainerBanner`/`TrainerSessionBar`, live over the same WebSocket via `trainerEvents.tsx`). Every trainee-targeted request goes through `traineeFetch(traineeId)`, which refuses `/api/auth/*` routes and any `DELETE` **client-side**: the grant is workout read/write only, never account or destructive. Server mode only. Don't widen that wrapper.
- **Program dirty flag:** `programDirty.ts` marks a program whose local save succeeded but whose server write failed, so the next sync pushes the local copy up instead of merging the stale server one down.
- **Storage migrations:** `sqliteStorage` runs `MIGRATIONS` (`storageMigrations.ts`) once per step against `PRAGMA user_version`, each step in its own transaction. The array is append-only. Never reorder or edit an entry that has been released. Persisted-data rewrites (e.g. a widget `type` rename) go here.
- **Server version floor:** `MIN_SERVER_VERSION` (`serverVersion.ts`). Self-hosted servers upgrade on their operator's schedule, so an app newer than its server is the normal case. Bump the floor when the app starts calling an endpoint older servers don't answer. The reverse check is the server's `minAppVersion` on `GET /healthz`: a Play build below it gets an immediate in-app update (`playUpdate.ts`). GitHub APKs, dev builds and offline mode skip it.
- **LAN server discovery:** `lanDiscovery.tsx` scans `_owngains._tcp` over `react-native-zeroconf` to find a self-hosted server on the local network. Android emulators can't multicast, so the scan always times out there. That's expected, not a bug.
- **Crash reporting:** the `@sentry/react-native` SDK, but the backend is a self-hosted **GlitchTip**, not Sentry. `EXPO_PUBLIC_SENTRY_DSN` in `.env` points at it (see `.env.example`. Expo inlines `EXPO_PUBLIC_*` at build time). GlitchTip supports only part of Sentry's ingest: errors, transactions/spans and SDK structured logs (`log.*`) arrive, but sessions do not (keep `enableAutoSessionTracking: false`), and `Sentry.metrics` is dropped (GlitchTip's ingest lists `trace_metric` as an ignored item type). Usage analytics therefore don't go to GlitchTip at all: `metric.*`, `trackFeature`, `trackScreenView`, `trackDailyOpen` and `trackWorkoutCompleted` log Google Analytics for Firebase events (`@react-native-firebase/analytics`). Firebase is optional: `app.config.js` adds `googleServicesFile` and the `@react-native-firebase/app` plugin only when a gitignored `secrets/google-services.json` or root `google-services.json` exists (the plugin throws without it), and `crashReporting.tsx` skips every Firebase call when `getApps()` is empty. `firebase.json` keeps collection off and the advertising ID uncollected until the telemetry switch calls `setAnalyticsCollectionEnabled`, and `AD_ID` is in `blockedPermissions`. `trackSpan`/`startTrace` record Firebase Performance custom traces, API requests included by `routeOf` template (`@react-native-firebase/perf`, collection off via `perf_auto_collection_enabled` until the same switch). Never add the `@react-native-firebase/perf` Expo plugin: it applies the gradle plugin that instruments OkHttp and would send every request URL to Firebase, which the privacy policy rules out. Never send Firebase the account ID. GlitchTip keeps errors, navigation/TTID performance traces and `log.*`. Check with Settings → diagnostics → send test event. It also overwrites `user.ip_address` with the connecting IP on every ingest path, whatever the SDK sends. The project's "scrub IP addresses" setting only zeroes the last octet. `crashReporting.tsx` nulls it anyway, but the only real fix is the reverse proxy in front of GlitchTip replacing `X-Forwarded-For` with a private address on `/api/*/envelope/` and `/api/*/store/`. Before relying on any other Sentry feature (replays, profiling, release health, crons), confirm GlitchTip supports it.
- **Consent:** crash reports and usage telemetry are separate switches (`@crash_reporting_enabled`, `@telemetry_enabled`) set on `PrivacyConsentScreen` and in Settings. Nothing is sent before that screen is answered and telemetry is opt-in. Every Sentry call goes through the gated wrappers in `crashReporting.tsx`. Never call `Sentry.*` directly. Service calls are counted automatically by `createDispatchProxy`/`createOnlineOnlyProxy`, so a new service needs no instrumentation of its own. When adding a new kind of telemetry, update the consent copy and `PrivacyPolicyScreen` (then `npm run build:privacy-policy`).
- **Smart reminders:** local only (`src/shared/services/supplementReminders.tsx`). A plain reminder is an expo-notifications repeating `DAILY` trigger. One set to "alarm" goes through `supplementAlarms.tsx` and `modules/exact-alarms` instead (exact time, full-screen alarm activity, snooze). There is deliberately no location/geofencing support: `ACCESS_BACKGROUND_LOCATION` requires a Play background-location review that a supplement reminder does not pass, so the location permissions are listed in `android.blockedPermissions` in `app.json` even though no dependency requests them today, which keeps a transitive manifest from adding one back. Never reintroduce a location permission without that trade-off being reconsidered.
- **Blocked permissions:** `android.blockedPermissions` in `app.json` marks permissions the prebuild template or a dependency's manifest adds, and the app never uses, as `tools:node="remove"`: RECORD_AUDIO (capture is images only), contacts, WRITE_EXTERNAL_STORAGE (every write goes to the app-private directory) and location. SYSTEM_ALERT_WINDOW is kept on purpose: it is what lets a supplement alarm open full screen from the background. READ_EXTERNAL_STORAGE is kept on purpose too. It is capped at maxSdkVersion 32 and still backs gallery imports on Android 12 and lower.
- Notifications are unavailable in Expo Go, so calls are wrapped in try/catch in `App.tsx`. `expo-dev-client` is installed, so dev builds need `expo run:android`, not Expo Go.

### Glossary

- **App mode**: the `"online"`/`"offline"` flag that drives the on/off dispatch split. `src/shared/services/appMode.tsx`.
- **App role**: `"personal"`/`"trainer"` (`@app_role`), whether the app shows the user's own training or their coaching clients. Independent of app mode, except that offline always shows `personal` (`effectiveRole`). `src/shared/services/appRole.ts`.
- **Widget board**: a screen's independent, per-user, reorderable/resizable layout of widgets. `src/shared/context/hooks/useWidgets.tsx`.
- **Joint session**: a real-time, participatory shared workout session between two users, synced over the WebSocket. `src/shared/context/hooks/useJointSession.tsx`, `src/shared/context/JointSessionContext.tsx`.
- **Watching**: spectating a friend's live session in real time (`isWatching`/`watchTarget`/`startWatching`/`stopWatching`), distinct from a joint session because the watcher doesn't participate. Same files as joint session.

## Local Claude Code tooling

Checked into the repo under `.claude/` and `.mcp.json`, so it applies to every session here.

- **Hooks.** `PostToolUse` on `Edit|Write` runs `.claude/hooks/post-edit.js`: `eslint --fix` on the edited file, `scripts/find-unlabeled-icons.py` for any `.tsx` (CI keeps that count at zero, so a hit is from the current edit), and for anything under `services/on|off/` an offline-twin existence check plus the `serviceModeContract` test. `Stop` runs `.claude/hooks/stop-typecheck.js` (`tsc --noEmit`) and `.claude/hooks/stop-readme.js`, which blocks once per distinct set of `src/features/` edits (tests excluded) when `README.md` wasn't touched, so the README gets updated or explicitly skipped, `.claude/hooks/stop-tutorial.js`, which blocks once per distinct set of new `Added`/`Changed`/`Removed` changelog bullets when `src/features/tutorial/` wasn't touched, so the tutorial gets updated or explicitly skipped, and `.claude/hooks/stop-min-server-version.js`, which (when the diff adds an `/api/` line) audits the app against the sibling server's `v<MIN_SERVER_VERSION>` tag via `api_audit.py --server-root` and blocks once per gap with the oldest server tag that closes it. All five exit 2 to block, so a failure comes back as feedback rather than silently passing.
- **Permissions.** `.claude/settings.json` allows the read-only shell verbs plus the test/typecheck/lint scripts, and denies reading **and** editing the signing material (`.env`, `*.jks`, `*.keystore`, `*.p12`, `keystore.properties`, `credentials.json`, `secrets/`), plus editing `ios/`, `package-lock.json` and `src/data/exercises.*`.
- **Agents.** `appmode-parity-reviewer` (on/off divergence, `local_` ID leaks, storage bypass, sync-queue drops) and `widget-board-reviewer` (registry/defaults mismatches, renamed widget types, storage-key collisions).
- **Skills.** `api-request` (spec a missing server endpoint), `new-feature-service` (scaffold an on/off service pair), `release` (release pre-flight and handover), `comment-cleanup` (applying the Code Comments rules when writing or trimming comments), `comment-add` (adding why-comments and TSDoc under the same rules), `comment-sweep` (batched repo-wide comment pass), `readme-audit` (find and fix README drift against the code).
- **MCP.** `.mcp.json` declares `context7` (version-accurate docs for the pinned Expo 58 / RN 0.88 / React 19 / Reanimated 4 surface. Don't answer API questions about these from memory), `glitchtip` (the self-hosted GlitchTip at `glitchtip.superak0s.com/mcp`, this project's crash reports. The instance must run with `GLITCHTIP_ENABLE_MCP=True` or the endpoint 404s) and `mobile-mcp` (drives an Android emulator/device over adb for screenshots and taps on the dev build, launched via `cmd /c npx` because it's configured for Windows). `github` (the hosted GitHub MCP at `api.githubcopilot.com/mcp/`: issues, PRs, CI runs). The HTTP servers need a one-time OAuth approval in an interactive session. SonarQube MCP is separate (see the Gotchas entry below).

## Gotchas

- `CLAUDE.md`, `.claude/`, `.mcp.json`, `docs/`, `scripts/release.sh` and `sonar-project.properties` are tracked. `api-requests.md`, `.github/instructions/`, `.superpowers/`, `docs/superpowers/`, `coverage/`, `*.apk`/`*.aab`, `sonarqube/`, `.scannerwork/`, `.sonarlint/` and `secrets/` are gitignored, so edits there never show up in `git status`. Don't read a clean status as "nothing changed" after editing them. `.claude/settings.local.json` is personal and gitignored.
- Markdown is gitignored by default (`*.md` in `.gitignore`), with only `README.md`, `CHANGELOG.md`, `CLAUDE.md`, `TODO.md`, `docs/**`, `.claude/**` and `.github/**` allowed back. Write working notes (audits, fix lists, plans) as `.md` anywhere else and git ignores them. A new doc that belongs in the repo needs a `!` line in `.gitignore`. Already-tracked files such as `audit/*.md` are unaffected.
- `.github/instructions/sonarqube_mcp.instructions.md` applies to `src/**` and dictates SonarQube MCP usage (toggle automatic analysis off at task start, `analyze_file_list` at the end, re-enable after).
- SonarQube: `npm run sonar:scan` (needs `SONAR_TOKEN`, targets `http://192.168.10.12:8999`).
- Native Android builds need CMake 3.31.6 in the Android SDK (`sdkmanager --install "cmake/3.31.6"`). `plugins/withCMakeVersion.js` pins it because the default 3.22.1 ninja fails on Windows long paths. CMake 4 rejects expo-sqlite's `cmake_minimum_required`, and a `subst` drive breaks codegen ("different roots").
- Held-back majors: TypeScript stays on 6 (typescript-eslint doesn't support 7), ESLint on 9 (10 breaks `eslint-plugin-react`'s `display-name`), and `expo-iap` on 5.x (6 changes purchase delivery in the billing path).
- Working-copy files are CRLF (`core.autocrlf`). Scripted edits must keep `
` or the whole file shows as changed.

## Off-limits

Never hand-edit these. They're generated, vendored, or contain signing material:

- `android/`, `ios/`: regenerated by `npx expo prebuild --platform android --clean`. Edits are lost on the next prebuild.
- `node_modules/`, `.expo/`, `dist/`, `build/`: package/build output.
- `android/app/build.gradle`'s signing config block: injected by `local-expo-build` during `scripts/release.sh`.
- `*.jks`, `*.keystore`, `*.p12`, `keystore.properties`, `credentials.json`, `app-release.apk`: signing/build artifacts, gitignored on purpose.
- `sonarqube/`, `.scannerwork/`, `.sonarlint/`: SonarQube scanner output.
- `scripts/{build,bump-version,pin-gradle,print-artifact,resolve-project-bin,setup-signing,sync-eas-version}.js`: generated by `local-expo-build`. `npx local-expo-build update-scripts` overwrites local edits.

### Secrets

The signing secrets file (`~/.owngains-secrets` or `%USERPROFILE%\.owngains-secrets.bat`) is not present in this checkout. Never invent, hardcode, or commit values for it. If a build step needs it, ask the user for the real file.

`secrets/` (gitignored) holds `google-services.json` and a Google service-account key. Never read, print or commit them.

## New API endpoints

OwnGains-Server is a sibling repo, not part of this checkout, so its code can't be written here. When a task needs a new server-side endpoint (a new route, a change to a request/response shape, a new field), do not invent or stub it client-side. Instead, write the exact endpoint spec to `api-requests.md` in the repo root (create it if missing, append if it exists): method, path, request body/params, response shape, and status codes/error cases. The client code should call the endpoint as if it already exists, using that same spec. The user implements it on the server from that file.

`python scripts/api_audit.py` lists which of those calls the server still doesn’t answer (and which routes/client methods are dead).

## Feature workflow

Every new feature is built on its own branch and is merged into `main` only after the user approves it. Bug fixes, performance work, refactors and other non-feature changes don't get a branch. Commit them directly on the current branch:

1. **Start** from a clean, up-to-date `main` and create `feat/<short-name>`. If the working tree is dirty, stop and ask. Keep unrelated changes out of the branch.
2. **Build** on the feature branch and commit there. Never commit a feature directly on `main`.
3. **Stop for review.** Hand the branch over (the user reviews with `git diff main...feat/<name>` or the running app) and wait for an explicit okay.
4. **On approval, pick squash or rebase.** First look at `git log main..feat/<name>` and decide:
   - **Rebase** when every commit is a self-contained step with a conventional message that passes the checks alone (a large feature split into reviewable parts is easier to bisect and revert that way): `git rebase main feat/<name>`, re-run `npm run typecheck`, `npm run lint` and `npm test`, then `git checkout main && git merge --ff-only feat/<name>` and `git branch -d feat/<name>`.
   - **Squash** otherwise, which is the default (WIP or fixup commits, one logical change, or several commits that each edit `CHANGELOG.md` and would conflict on every replayed step): `git checkout main && git merge --squash feat/<name>`, re-run the same checks, then commit the whole feature as one commit with a conventional message (`feat(<area>): …`). Delete the branch with `git branch -D feat/<name>` (`-D` because a squash leaves it looking unmerged).
   - `git rebase -i` is unavailable, so a branch whose commits need cleaning up gets squashed rather than rewritten.

   Say which one you chose and why when reporting the merge.
5. **Don't push** unless the user asks.

Conflicts in `CHANGELOG.md` `[Unreleased]` are expected when branches overlap. Resolve them by keeping both sets of bullets. Never rewrite history that has already been pushed.

## Changelog

Every change you make to the repo gets an entry in `CHANGELOG.md` under `## [Unreleased]`, in the same turn as the change, not batched up for later, and not left for the user to write. The file follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/):

- User-visible changes go under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` or `Security` (new permissions, auth or privacy changes go in `Security`). Write them for someone using the app: what they can now do or what behaves differently, not which file or hook changed.
- Everything else (refactors, tests, tooling, build scripts, dependency bumps, docs, `.claude/` config) goes under `### Internal`, one short line each.
- One bullet per change. If a later edit in the same session revises something already listed under Unreleased, update that bullet instead of adding another.
- Create any missing heading inside `[Unreleased]`, keeping the order above with `Internal` last. Never edit a released version's section, and never add a version heading yourself. Entries always go under `[Unreleased]` whatever `package.json` says, and `scripts/release.sh` renames it when the version is bumped.
- A change that is purely reverted in the same session leaves no entry.

The app bundles this file: `metro.config.js` + `metro.transformer.js` (and the `\.md$` Jest transform) import it as a string, and `src/features/settings/components/ChangelogSheet.tsx` renders it under Settings → About → What's New. Every section except `Internal` is shown to users, `Unreleased` only in `__DEV__`. Keep the headings exactly `## [x.y.z] - YYYY-MM-DD` and `### <Category>` or `parseChangelog` won't pick them up. After changing the Metro transformer, restart with `npx expo start -c`.

### Play Store release notes

Whenever you add or change a user-visible `[Unreleased]` entry, also rewrite `docs/play-release-notes.txt` in the same turn. It is the Play Console "What's new" text for the next release and must cover the whole current `[Unreleased]` section (never `Internal`), not only the latest change. Play's hard limit is **500 characters** including spaces and newlines, so check with `wc -m docs/play-release-notes.txt` after writing. Plain text, one `• ` bullet per line, most important change first, no Markdown. Merge or drop minor items to fit, keeping fixes to one summary bullet if space is short. The Prose Style rules apply.

## Prose Style

Applies to Markdown, `CHANGELOG.md` entries and user-facing text, not to code:

- No em or en dashes. Use a period, comma, colon or parentheses instead, and "to" for a range.
- No semicolons. Split into two sentences or restructure.
- Skip stock filler: "notable", "genuinely", "a single" (say "one"), and "for example", "therefore" or "conversely" as connectors.
- Use literal verbs, not figurative ones: a file is stored in a folder (it doesn't live there), a commit is merged into `main` (it doesn't land), a release includes a change (it doesn't ship it), and data is kept or remains (it doesn't survive or stay).

## Code Comments

Keep comments to an absolute minimum. Code should be self-documenting. Only comment
when it conveys something a future developer can't get from the code itself:

- A non-obvious **why**
- A non-obvious business or domain rule
- A workaround for a bug, framework limitation, or external constraint
- A compatibility or integration requirement that isn't otherwise visible

**Never comment on:**

- What the code obviously does: restated names, plain calls, loops, conditionals, JSX, or a summary of the block below
- History: prior approaches, why code was split/moved/simplified, the change you just made, who wrote it or which PR it came from
- Pointers to ephemeral or external context: another file ("see X"), a Stack Overflow thread, an AI conversation. If the connection matters, encode it in code (shared constant, named helper, type)
- TODOs, reminders, or personal notes ("fix later", "hacky"): open an issue instead
- Commented-out code: delete it, git has it
- Static-analysis/tooling quirks, unless the workaround must be preserved
- Vague filler ("handle this case", "important") or anything unrelated to the code beside it
- Decoration: no `// =====`, banners, or box-drawing separators

**Hygiene:** if you touch code whose comment no longer matches, fix or remove it in the
same change. A wrong comment is worse than none. Don't trust a comment you haven't verified.

**Format:** use the TSDoc standard (JSDoc-compatible) for anything documented. Doc comments are `/** … */` directly above a declaration, with a summary sentence first, then only the tags that add something the types can't: `@param name - text`, `@returns`, `@throws`, `@deprecated`, `@remarks`. No types inside tags (TypeScript has them), no `{@link}` to files, and no tag that just repeats the name. Everything else is a `//` line comment on its own line above the code, never trailing. Lint directives follow `// eslint-disable-next-line <rule> -- <reason>`. Documenting is still opt-in: a declaration whose name and types say it all gets no doc comment.

**Length:** one or two short sentences max. Longer belongs in docs, an issue, or commit history.

Before adding one, ask: _does this tell a future developer something important they can't
reasonably get from the code?_ If no, or if in doubt, leave it out.
