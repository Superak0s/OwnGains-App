# Changelog

Every change to this project gets an entry here, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/).

Add an entry under **Unreleased** in the same change that introduces it. At release time `scripts/release.sh` renames that section to the new version and date.

## [Unreleased]

### Added

- Snoozing an alarm shows a notification with the time it rings again, and a Cancel button that stops the snoozed alarm.
- Long press a conversation in Messages to report or block that person.

### Changed

- The Messages button on the Friends screen sits next to the tabs instead of beside the title.
- Android's navigation buttons stay visible while Messages is open, so you can go back or leave without swiping them up first.
- Reminder times are picked on scroll wheels for hours and minutes, in supplement reminders and when you schedule a workout for yourself or a client. Supplement reminders no longer have the Morning, Noon, Evening and Night shortcuts.
- The tutorial is much shorter. It opens by telling trainers to turn on Trainer Mode, skips what the app already makes obvious, and keeps only the gestures, settings and trainer tools that are easy to miss.
- Selection chips in the set form, workout scheduling, chart settings, the widget gallery and What's New match the ones in Tracking.
- Empty and error screens in Analytics, Friends, Messages, Supplements, Workout and Clients share one layout and button style.

### Fixed

- Usage analytics (when you opt in) are sent again. Release builds were missing the Firebase configuration.
- Supplement alarms play your alarm tone again. With a custom tone from your music files they only vibrated.
- Adding an exercise or changing its sets while offline saves the change once. After a restart the exercise showed up twice, or the sets changed by double the amount.

### Internal

- Moved the report sheet out of `FriendsScreen` into `ReportUserSheet`, shared with the messages list.
- `app.config.js` reads `google-services.json` from `secrets/` as well as the repo root.
- Replaced the pre-1.0 storage migrations with no-op slots so the schema stays at version 9, and removed their widget/tutorial helpers.
- Removed the `Write(...)` deny rules from `.claude/settings.json`, which never matched because their `Edit(...)` twins already cover writes.
- `.claude/settings.json` denies reading and editing `secrets/`.
- Moved the time picker to `src/shared/components/TimeWheel.tsx`, with tests.
- Brought `CLAUDE.md` up to date (messages, schedule and trainer features, `modules/`, app role, supplement alarms, Play forced update, FCM push) and pointed its release section at `release.sh --help`.
- The `release` skill hands over a prompt-free `release.sh` command and describes the automatic Play upload.
- Deduplicated code across `src/`: one `PasswordField` for login and signup, one save-then-sync path for the four program edit operations, trainer banner styles reused by the joint-session banner, one performance card in the set form, one deps type for the tracking tab hooks, one password confirm sheet for unlinking Google and clearing data, shared header styles for onboarding and privacy consent, one file picker for both workout service twins, the shared week start and date key helpers in place of the trainer and sync copies, one 24-hour time formatter, one set dedupe rule for exercise history and the training summary, one injury type list, one calendar day count for tracking, messages and the trainer roster, one decimal input parser, and one copy each of `DAY_MS`, `startOfToday`, `compareVersions`, the recovery time label and the exercise name fallback.
- The app config test declares its jest globals, so `npm run lint` passes again.
- Moved the tracking UI primitives (`Button`, `Chip`, `Placeholder` and the rest) to `src/shared/components/ui.tsx`, listed in `CLAUDE.md`, and every hand-rolled selection chip uses the shared `Chip`.
- Added a shared `EmptyState` to `src/shared/components/ui.tsx` in place of fourteen hand-rolled empty and error states.

## [1.0.0] - 2026-10-20

### Added

- Trainer Mode turns the app into a coaching tool. Switch it on in Settings or with the Trainer Mode widget on Home, and the tab bar changes to Clients, Session, Programs, Progress, Track, Supps and Settings. Progress shows a client's analytics: tap the title to pick which client, from the same searchable list as Track. Clients lists who needs attention and who is on track, lets you send someone a trainer request, found by username or by scanning the QR code under My QR Code in their Friends tab, or cancel one you sent, and opens each client's page with a calendar of their sessions (tap a day to open its session, marked with you or on their own). A client's page also lists which permissions they have given you, grouped as in Friends, and lets you stop coaching them. Sessions and plans for a client are started and sent from Clients only, so Friends has no trainer controls. Send program lets you pick which of your splits to send. In Programs, tap the title to switch between your programs and a client's, from the same searchable list. Edit program on a client's page, or running their session, opens Programs on their program, which you edit with the same tools as your own. A session you run for a client ends after 30 minutes with no set logged from either phone, the same as your own workouts, and Stop ends it after you confirm. One client session runs at a time. A change their account refuses is undone and you are told, instead of looking saved. A trainer request shows up under Friends > Requests, where you can accept or decline it. It needs online mode. Settings > Tab Order lists the tabs of the mode you are in, and Trainer Mode keeps its own tab order.
- Tracking Access lets a client send their trainer their body weight, body fat, measurements, hydration, macros, injuries, soreness, muscle notes, menstrual cycle and progress photos. It is a separate permission that accepting a trainer request never grants. The client turns it on under Friends after Trainer Access, or the trainer taps Ask for Tracking Access on the client's page and the client accepts that request in Friends. The trainer sees it in the Track tab: tap the Tracking title to switch between their own tracking and a client's, picked from a list you can search by username. It is the same Tracking screen as their own but view only, as the client's phone last sent it. It needs online mode on a server that keeps tracking on the phone, such as the official one. The All demo friend sends made-up tracking data, so you can try it with demo data.
- Messages: in online mode you can message friends, your trainer and your clients. The 💬 button on Friends or Clients opens your conversations full screen, or tap Message on a friend or a client's page. Chats show bubbles grouped by sender, day dividers, send times and read ticks (✓✓ once the other person has read yours). Long press a message you sent to delete it, or to edit it in the first 15 minutes. Unread messages show a badge on the Friends (or Clients) tab. A new message shows a notification even when the app is closed, and tapping it opens the conversation. It needs a server from this release on, and a server can switch messaging off, which hides it in the app. A server whose notifications are not set up does the same until they are.
- A workout your trainer logged for you shows "Logged by" and their username in your workout calendar on Home, its details, Edit Workout History and a friend's session details. It needs a server from this release on.
- Start empty workout on the Workout screen (also shown when you have no plan yet) begins a workout outside your plan. Add exercises as you go. They are saved to your history only, never to your plan, and the day you were on stays open. In Trainer Mode the Workout screen hides that button, and Start session on Clients offers three choices instead: the client's program (on the split you pick from theirs), My program (which then lists your days) or an empty workout. A day the client already finished this week is no longer locked for the trainer. It shows a warning and a Start again button that runs it as a new session, and their earlier session stays in their history.
- Schedule workouts ahead with the Schedule widget on Plan (you can also add it to Home). Pick a day and a 24-hour time with Android's date and clock pickers (days and times that have passed can't be picked), a length and optionally a program day, and get a reminder 30 minutes, 1 hour, 2 hours, 1 day or a custom time (up to 7 days) before it, as a notification or an alarm. Turn on Add to my calendar to copy them into your phone's calendar. On the day, Start opens that program day in Workout. A trainer can suggest a workout from their client's Plan tab or client page, where they see only the workouts they suggested to that client, and the client accepts or declines it. The trainer can withdraw a suggestion, or cancel it once it is accepted. A Schedule tab on your trainer in Friends lists what they suggested. In online mode it needs a server from this release on.
- After an update, What's New opens once and lists the changes in every version since the one you had.
- Line charts have a goal button below them. Set a target weight, measurement or lift and the button shows the date you reach it at your current rate, or that you aren't moving toward it. A small Projection button in the chart's top right corner swaps the history for the expected values from today to that date, with a dot per day, week or month. Charts always open on the history.
- "Log a past workout" on the Home screen starts a workout you log after the fact, such as one you forgot to log at the gym. Pick the day you trained on its calendar (a day in an earlier week does not count toward this week's progress), then log sets as usual, but no set durations, rest or session length are recorded, and the rest reminder and time estimates stay off.
- Each exercise remembers its own weight unit. Switching between kg and lbs while logging a set changes it for that exercise only, and your logged weights are unaffected.
- After adding a set with +, an Undo button lets you take it back for a few seconds.
- You can restore a board's default widgets from the widget gallery, or from the empty Home screen.
- You can remove your profile photo from the Account sheet.
- In online mode your profile photo is kept on the server, so it appears on your other devices, and your friends see it instead of your initial in their friends list and in a joint workout.
- The rest reminder accepts minutes and seconds, such as 1:30, as well as plain seconds.
- Machines in Exercise Settings have a visible remove button, not only a long press.
- The Home streak and calendar widgets offer Retry when workout history fails to load, and pulling to refresh tells you when the server sync failed.
- Weekly progress dots show each day's number.
- The outdated server notice can be expanded for details or dismissed.
- If moving your data to this device fails, you can retry it straight from the error message.
- Password and export passphrase fields show what is still missing as you type.

### Changed

- The first-run tutorial starts with one Start button instead of asking whether you train, coach or both. Its welcome card shows where to turn on Trainer Mode, and turning it on offers the trainer chapters until you have finished them. Settings → About → Tutorial lists the trainer chapters while Trainer Mode is on. If you already finished or skipped the tutorial, it is offered once more after this update so you can see what is new.
- Fill Demo Data adds three demo friends instead of nine: None shares nothing with you, Half shares history, analytics, your program and watching, and All shares everything, so you are its trainer. Online it also adds conversations with each of them (the newest unread), two upcoming scheduled workouts with reminders, a workout All suggests for you to accept, and your own suggestions for All. Offline it adds the two scheduled workouts. There is no demo friend request any more.
- When you open a friend, Trainer Access and Tracking Access are now at the top of the permission list.
- When the server refuses a name or other input, the message now says why (such as a word that isn't allowed) instead of "Validation failed". Servers from this release on also refuse names with symbols or emoji and names that contain a banned word.
- The supplement Alarm reminder now works like a clock app alarm: it shows the alarm icon in the status bar, wakes the screen and keeps ringing on the alarm volume (even with the ringer silent, and through Do Not Disturb when you allow it) until you tap Snooze (10 minutes) or Dismiss. It opens full screen with the time and both buttons instead of showing a notification, whether the phone is locked or you are using another app. Choosing Alarm asks for each permission it needs, one after another: notifications, then "Alarms & reminders" for exact timing, then "Display over other apps" to open full screen. Each one opens its settings page if you want it. Without it the alarm rings as a notification and fills the screen only when the phone is locked. It stops ringing after 10 minutes if you don't answer it, and an alarm that goes off while another is ringing snoozes the first one. Next-dose reminders set to Alarm ring the same way.
- The workout rest reminder can now ring as an alarm. In the Rest Reminder sheet, choose Alarm instead of Notification and it opens full screen and rings like the supplement alarm when your rest time is up. Snooze on a rest alarm waits 30 seconds instead of 10 minutes. Choosing Alarm asks for the same permissions, with a shortcut to each settings page.
- Choosing a supplement reminder time uses a larger hour and minute picker with Morning, Noon, Evening and Night shortcuts instead of the system clock.
- Weight and reps come first when you log a set, so you can start typing right away and move from weight to reps with the keyboard. The set form title says which set is open, such as "Set 2 of 4".
- The Add Exercise sheet works like Edit Exercise: you can browse exercises by muscle, the muscles of a known exercise are filled in for you, and the muscle fields are under Advanced.
- Exercise cards in a workout, in your plan and in a friend's live session show muscles on two lines, main muscles in bold after "M:" and secondary muscles after "S:", wrapping to the next line when a list is long. In lists such as suggestions they read "Chest, Triceps (secondary: Shoulders)" instead of using a +.
- Tapping a logged set opens it for editing straight away, and deleting a set is done from inside the set form.
- The finish workout prompt says how many sets are not logged yet, with clearer buttons.
- The locked day banner, warm-up sets and locked sets use your theme colors and are easier to read.
- Effort (reps in reserve) choices wrap onto a second line instead of scrolling off screen.
- Finished days are marked "Done" instead of locked, and you can open them without a confirmation prompt.
- Widget edit mode has a Done editing button and ends when you leave the screen or press Back. Edit controls are larger and name the widget they act on.
- Adding a widget confirms it and scrolls to it.
- Closing session details returns to that day's list, and sets are shown as compact rows.
- Tapping a calendar day with no workouts no longer opens an empty sheet.
- In a client's schedule calendar, days with a pending suggestion have a yellow dot, and a cancelled workout stays on its day with a red dot and a Cancelled tag instead of disappearing. Cancelled workouts need a server from this release on.
- Days in the month calendar no longer repeat the weekday letter above their number, since the header row already shows it.
- Home shows placeholder cards while widgets load, and the Next Workout widget is one tinted card.
- Settings is now a short menu that opens separate pages for Workout, Appearance, Storage and Sync, Privacy and Data, and About, with a cleaner layout. Tap your name at the top to open your account. Editing past sessions and unlocking days are under Workout, Health Connect is under Storage and Sync, and actions that can't be undone are grouped in a Danger zone at the bottom of their page. Android Back returns from a page to the menu. On the Workout page every setting has an icon, the comparison choices are a checklist with a short explanation each, and your progress is shown as four stat tiles.
- Tracking history lists are grouped by month, or by day for water, macros and soreness. Days start collapsed and show their entry count and water or calorie total, and tapping a day opens its entries. Weight and body fat entries show the change from the previous one, times replace repeated dates, and the red delete buttons are now a quiet ✕.
- Manual sync starts right away and reports how many changes synced.
- Unblocking someone asks you to confirm first.
- Sign out uses the same wording everywhere.
- Error messages on Home, Workout and Settings say what failed and what to do next.
- Small text, buttons and chips on Home, Workout and Settings are larger and easier to tap, and several emoji icons were replaced with plain text.
- Animations on the personal record card and the partner banner respect the system Reduce Motion setting.
- The tutorial covers logging a past workout, Undo for added sets, per-exercise kg or lbs, the rest and supplement alarms, minutes and seconds rest times, restoring default widgets, profile photos, renaming exercises in Edit Workout History and Tracking Access for trainers and scheduled workouts, and calls finished days Done.
- Signup asks for a username with at least 3 letters and refuses one containing "demo", matching the server.

### Removed

- Support for servers older than this release. The app no longer falls back to older routes and response shapes, no longer accepts a consent the server can't record, and no longer shows "Your server doesn't support Trainer Mode yet" (an outdated server now gives the usual load error). Update your server along with the app.
- Signing in no longer moves this device's data from an account's old numeric id to its uuid. Data saved before the server switched to uuids is no longer picked up.
- Support for servers older than 0.6.0: supplement dose defaults, the 400/404 fallback for exercise records, the `accessToken` refresh field, the message-based "session not found" check (only `SESSION_NOT_FOUND` and `SESSION_ALREADY_ENDED` now drop a queued workout write), the "Logged by your trainer" label without a username, and the quiet 404 when syncing a profile photo.
- The cleanup of the old `supplement-alarms` notification channel on Android.
- Moving data saved by early versions of the app, before it was stored per account, and cancelling supplement reminders scheduled under their old id.
- Opening encrypted exports made before the switch to PBKDF2 (format versions 1 and 2). They now show an error that the file is too old.

### Fixed

- Screen readers read each tab by the name it shows, such as Progress instead of Analytics.
- Medium and Large widgets looked the same. Large is now taller and offered only on chart widgets, where the chart grows with it. Other widgets drop the Large option, and any set to Large return to their usual size.
- A long exercise name in the workout rest timer is cut off with "..." instead of pushing the timer off the screen.
- Browsing by muscle while editing an exercise shows only that muscle's exercises, not a second box of swap suggestions below them.
- Leaving a joint session asks you to confirm first and says your logged sets are kept, so a stray tap no longer ends it.
- The workout streak counts the current week as soon as you train.
- Delete Forever stays disabled until you enter your password.
- Closing Edit Exercise with unsaved changes asks before discarding them.
- Entering an invalid custom rest time no longer turns the rest reminder off without warning.
- A privacy switch that fails to save returns to its previous position and tells you.
- Migrating to an offline account or withdrawing health consent shows a spinner while it runs and can't be tapped twice.
- The Home workout button says "Resume Workout" when a workout is already in progress.
- A newly added DOMS follow-up widget no longer disappears right away.
- The current day stays highlighted in the day picker after you finish it, and the View Workout button no longer looks disabled.
- Picking an exercise name that already exists no longer shows a confirmation dialog.
- The rest reminder description matches the alarm mode when alarms are on.
- Removed or replaced profile photos no longer take up storage, and a photo deleted from the device no longer shows as broken.
- The server version shows a loading indicator and then "Unknown" instead of a blank value.
- Counts read correctly for one item, such as "1 change" instead of "1 change(s)".
- Screen readers now name every text field, switch and chip on Home, Workout and Settings, reach the edit button on each machine row, read the Streak widget as one sentence, and skip decorative emoji.
- A Home widget that is no longer available says how to remove it, instead of showing an internal name.
- The progress error in Settings says clearly that your progress on this device is unaffected.
- Fixed stray spaces and doubled divider lines on the Workout and Settings screens.
- The Supplements screen refreshes when you return to it and when a new day starts, so doses taken yesterday no longer show as done today.
- The next-dose reminder is set from the right count after the first dose of a new day, and is updated or cancelled when you delete a logged dose.
- "Turn off all reminders" for a supplement also stops its next-dose reminder.
- Tapping fast no longer adds the same supplement twice or saves its settings twice.
- Opening one supplement's history and then another's quickly no longer shows the first one's entries.
- Deleting a supplement shows an error when its reminders can't be read or restored, instead of failing without a word.
- A supplement amount typed with a comma, such as 2,5, is kept when you turn its reminders off.

### Security

- A friend with Trainer Access can now remove and rename what is in your program, not only add to it. They still can't empty it, delete your logged workouts or touch your account. The Trainer Access prompt and the privacy policy say so.
- Another user can send you a trainer request, and it gives them Trainer Access only if you accept it. The privacy policy now says what the server keeps for an open request and that it is deleted once you answer it. A workout your trainer logs for you records which trainer logged it.
- The app now declares the "Display over other apps" and full screen notification permissions, used only by the supplement alarm screen, which shows over the lock screen without unlocking the rest of the app. You turn on "Display over other apps" in settings when asked.
- The privacy policy explains that the server keeps your profile photo and that your friends can see it.
- Tracking Access data is end to end encrypted. The client's phone encrypts it for each of the trainer's phones, so the server only passes on data it can't read and deletes it once delivered or after 30 days. Both phones show a safety code to compare. The trainer's phone keeps a copy until the access ends, and the privacy policy says so.
- On servers that send push notifications, the app gives the server this device's Firebase push token when you sign in and removes it when you sign out, also when the server ended your session or you changed servers. Notifications carry no message text or names.
- Turning on Add to my calendar asks for calendar permission (READ_CALENDAR and WRITE_CALENDAR). The app only writes your scheduled workouts to a calendar on your phone and sends nothing from it anywhere. The privacy policy says what the server keeps for scheduled workouts.
- Usage metrics you switch on now go to Google Analytics for Firebase instead of the developer's crash-report server, which keeps crash reports, screen-load traces and diagnostic logs. App start, screen rendering, server request and slow-operation timings (syncing, loading analytics, importing a plan, backup, restore, a Health Connect sync) go to Firebase Performance Monitoring, with API paths stripped of the server address, IDs and names. Firebase never gets your account ID, the advertising ID is not collected and the advertising ID permission is removed. The consent screen and privacy policy say so.

### Internal

- Reworded figurative phrases in the privacy policy, terms of service and account deletion page, and regenerated the web copies.

- `scripts/api_audit.py` follows routers mounted behind middleware, server helpers handed `req` or `req.body` (local or `@/` imports), `queryString(req, ...)`, path constants (`${BASE}/x`), query strings built in a local, and `post(...)`-style options helpers, which removes its false reports for messages, push, schedule, injuries, soreness, the tracking relay and menstrual stats.
- Moved the messages thread events into their own module to break a require cycle.
- Added `@react-native-firebase/app`, `@react-native-firebase/analytics` and `@react-native-firebase/perf` (without its Expo plugin, so OkHttp is not instrumented), `firebase.json` (collection off until consent) and jest mocks. Firebase is optional: without `google-services.json` at prebuild, `app.config.js` leaves the plugin out and no analytics call is made. `metric.*`, `trackFeature`, `trackScreenView`, `trackDailyOpen` and `trackWorkoutCompleted` log Firebase events, and the `unit` metric option is gone. `trackSpan` and the new `startTrace` record Firebase Performance traces (`trackSpan` no longer takes an `op`), and the API request, sync run and LAN scan durations moved there from analytics events. Backup export, restore and offline migration are timed too.
- Schedule, messages, push registration, the trainer's tracking inbox and act-as requests report every caught failure to GlitchTip (act-as requests and refused trainee routes as metrics too), and the chat and client page show `userFacingError` text instead of raw error messages.
- Added a roadmap to `TODO.md` that groups the theme fixes, widget naming and icons, trainer mode widgets, app redesign, customizable UI marketplace and modular custom widgets by when they should start.
- Removed the old-server fallbacks (inlined permission payloads, per-session timing fetches, the fast watch poll until a first `watch_progress` push, 404 handling for trainer, tracking relay and consent routes) and `renameUserData`, with their tests.
- The offline tracking services are factories bound to a record-store user, and the Tracking screen reads its services from a context, so it can show a client's unpacked copy.
- Reset Day's logic moved from Settings into `resetDay` on `WorkoutContext`, so the trainer's Start again uses the same steps.
- `MIN_SERVER_VERSION` is 0.6.0, the next OwnGains-Server release, since v0.5.x doesn't answer the trainer, profile photo, messages or schedule routes.
- `scripts/release.sh` runs the GitHub CI workflow under act before pushing, and checks act is installed and Docker is running before its prompts. It reuses the local runner image instead of pulling it on every run.
- CI fails when `docs/privacy-policy.html`, `docs/terms-of-service.html` or `docs/delete-account.html` no longer match the in-app legal screens.
- Set TSDoc as the comment format in CLAUDE.md and the comment-cleanup skill.
- Added a comment-add skill for adding why-comments and TSDoc under the Code Comments rules.
- Added a comment-sweep skill that applies the comment-add rules across the whole repo in resumable batches.
- Documented the sync, auth, storage and context layers, the utils and the feature services with TSDoc.
- SonarQube cleanup: dead Settings code removed, a typed Settings navigation call, and helpers split out of the API error, joint session, body fat and history-edit code to cut complexity.
- `scripts/sonarqube.py` sends its own User-Agent (the proxy refuses curl's default) and exits with the response body when a page is not JSON.
- Regression tests for the Supplements screen and supplement settings sheet, and a deleted supplement's settings key is now removed from storage.
- Usability audit of Home, Workout and Settings (frontend-design-audit), with regression tests for each behavior fix.
- Settings rows and groups share one `SettingsRow`/`SettingsGroup` component, and the tutorial and privacy policy point to the new Settings pages.
- `syncFromServer` resolves to whether the sync succeeded instead of the merged completed days.
- Per-exercise weight units are stored under `STORAGE_KEYS.WEIGHT_UNIT_BY_EXERCISE`, so Clear All Data and the offline migration include them.
- The crash report test button in Settings → Developer names GlitchTip, and Test Alarm ignores a second tap while scheduling.
- The privacy policy points to Settings → About → Support Development.
- `profilePhotoApi` (auth on/off pair, dispatched by app mode only) calls the new `/api/profile/photo` server routes, and `friendPhoto.ts` caches friends' photos by hash.
- CLAUDE.md feature workflow chooses between a rebase and a squash merge per branch, with squash as the default.
- Alarm-type supplement reminders are scheduled, re-armed after reboot and rung natively by the `exact-alarms` module (`setAlarmClock`, `AlarmReceiver`, `BootReceiver`), which starts an `AlarmActivity` rendering the `AlarmScreen` root.
- New Stop hook `stop-tutorial.js` asks whether the tutorial needs updating when new user-visible changelog entries are added without a tutorial change.
- Settings → Developer (debug builds and admins) has a Test Alarm button that rings a supplement alarm in 10 seconds and reports missing alarm permissions.
- New online-only `trainerApi` (`src/features/trainer/services`) for the client roster, trainer requests, cancelling a request and removing a client, specced in `api-requests.md` for OwnGains-Server.
- The friend session details sheet and `groupSessionExercises` moved out of `FriendsScreen` so the trainer client page can reuse them.
- Trainer socket events are read with the numeric `sessionId` the server sends (they were all dropped before), with tests for that and the trainer session idle stop.
- The tracking relay (`trackingRelayApi`, `trackingShare`, `trackingInbox`) uses the new tweetnacl dependency, with a round-trip test of sending, receiving and resending.
- New `scheduleApi` on/off pair and `ScheduleProvider` (`src/features/schedule`) for `/api/schedule`, with the expo-calendar dependency, a storage migration that places the Schedule widget on existing Plan boards, `UniversalCalendar`'s `allowFuture` prop, and tests for the offline service, reminder planning and the schedule form helpers.
- `app.config.js` adds `google-services.json` to the Android build when the file is present, for FCM push, and `.gitignore` keeps that file out of git.
- Reworded comments that described older servers in the token storage, terms check, history paging, photo paging and socket reconnect code.
- `createRecordStore` no longer takes a legacy blob key. Migrate to Offline writes sessions straight to the offline account's rows.

## [0.6.0] - 2026-10-10

### Added

- When your server sets a minimum app version and yours is lower, the Google Play version opens Play's full-screen update flow and blocks use until it finishes. It checks again each time you come back to the app.
- Edit Workout History has an Exercises tab that lists every exercise in the split, so you can rename one or change its muscles without opening each workout. Exercises already in the exercise database are marked with a checkmark, and filters show only the ones with no muscles set, or not in the database.

### Changed

- Renaming a history exercise to one from the exercise database now fills in both its primary and secondary muscles, and Edit Exercise has the same "Browse by muscle" list as the Workout screen to pick the new name from, opened on the exercise's own muscle.
- Exercise names that differ from the exercise database only by case, punctuation or a plural "s" (Machine Tricep Extension for Machine Triceps Extension) now take the database spelling and its muscles. Strength Level imports are fixed as they are imported, and existing history is fixed when you open Edit Workout History.

### Removed

- The "Exercise database" suggestion list in Edit Exercise. The "Did you mean" suggestions remain.

### Internal

- `scripts/release.sh` deletes the WSL mirror before syncing, so a stale or partial `node_modules` can no longer break a build.
- The Google Play API auth used by `scripts/play-upload.js` moved to `scripts/play-auth.js`.
- `sp-react-native-in-app-updates` drives the Play immediate update from `playUpdate.ts`, gated by `minAppVersion` on `/healthz` (server env `MIN_APP_VERSION`). Only builds that include it can be forced, so users on older versions still update by hand once.
- `findExerciseByName` in `exerciseDb` resolves a database name ignoring case, punctuation and plurals, without following aliases.
- Navigation and network traces are sampled at 10% instead of 100%, so crash reporting sends less to the server. Counts and the first screen load are still always kept.

- `scripts/release.sh --play` and `PLAY_TRACK` take a comma-separated list of tracks (e.g. `internal,alpha`), and `play-upload.js` puts the bundle on each in one edit.

## [0.5.1] - 2026-10-10

### Changed

- The Continue with Google button shows the Google logo.

## [0.5.0] - 2026-10-10

### Added

- Sign in or sign up with Google on the official server. The button is shown only when the server address is exactly https://owngains.superak0s.com, and an account created this way confirms deletion with Google instead of a password. If your Google email already has an OwnGains account, the app asks for that account's password once to link them.
- Unlink Google from an account with a password in Settings → Account.

### Internal

- Added `@react-native-google-signin/google-signin`, `isOfficialServer()` in `config.tsx` (shared with `PrivacyConsentScreen`) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env.example`.
- Tests for `isOfficialServer`, `signInWithGoogle` and the Google button's visibility, plus a Jest mock for the Google sign-in package, and for the password prompt when Google matches an existing account.
- Regression test that checks the official server address against React Native's own URL parser, which read "https://evil.com/@owngains.superak0s.com" as the official host.
- Added the GitHub MCP server to `.mcp.json`.
- New Stop hook `stop-min-server-version.js` flags app API calls the `MIN_SERVER_VERSION` server tag doesn't answer and names the oldest server release that does. `api_audit.py` takes `--server-root`.
- `scripts/release.sh` asks whether to run a clean prebuild when no dependencies, config, plugins or assets changed since the last one, and runs it after 30 seconds without an answer.

## [0.4.1] - 2026-10-09

### Internal

- `scripts/release.sh` checks the Play service account's permission before building and stops early if it has none.
- Tests use a stub for `react-native-gifted-charts`, so its delayed animation timer can no longer crash an unrelated suite.

## [0.4.0] - 2026-10-09

### Added

- Tap any progress chart to open it full screen. Pick a time range (1W to All, or custom dates), set the Y axis to fit the data, start at zero or use your own min and max, change label count and size, and rotate to landscape. Pinch to zoom, double tap to reset, and tap a point to see its value or open that day's workout.
- Full screen charts can show a 7 day average or smoothed trend line, a goal line with an estimated date to reach it, record markers, and the previous period or last year for comparison. Switch between line, area and bar, and see min, max, average and change for the visible range.
- Exercise charts can switch between average and heaviest weight, estimated 1RM, best set and session volume, and average and total reps.
- Save a chart as an image or export its points as CSV.
- On Xiaomi, Poco, Redmi, Samsung, Huawei, Honor, OnePlus, OPPO, realme and vivo phones, setting up a reminder now tells you once which battery settings to change so the phone doesn't delay it, with a button to open them.

### Changed

- Chart settings are saved per chart for each account on the device and also apply to the small chart.
- Watching a friend's workout updates instantly.
- Plan is now the 7th tab by default, after Friends. Tabs you already reordered keep your order.
- The tutorial now covers full screen charts, the Health tab, the Weekly Sets and Exercises widgets, sending a plan to a trainee and the battery settings tip for reminders. It no longer mentions the removed Rep Max Table.

### Removed

- The Phone field in Edit Account. Phone numbers already saved are deleted from the device.

### Fixed

- Deleting a set from a workout started offline no longer warns that the server still has the set.
- When the server can't be reached while you accept the privacy and terms screen, it now says so instead of blaming the device's storage.
- Analytics Training Summary now lines up with the rest of the screen, and its period buttons keep their labels on one line.

### Internal

- Sets of a workout whose start hasn't synced yet go straight to the sync queue instead of first being posted under their `local_` session ID
- Screen, service and sync tests for settings, auth, friends, tracking, workout and plan, with the offline migration moved out of `SettingsScreen` so it can be tested
- CLAUDE.md requires a regression test for every `Fixed` entry
- Tests for the offline auth service, program edits that fail to reach the server, joint sessions, watching and the tip jar
- `release.sh` strips CRLF from `.env` and converts a Windows `PLAY_SERVICE_ACCOUNT` path under WSL
- Claude Code `stop-readme` hook flags feature changes without a README update, and a `readme-audit` skill fixes README drift
- README updated for 0.3.0 (Health tab, Recovery and Cycle tabs, new Progress widgets, Friends changes, permissions, native modules, release flags)
- Added `@testing-library/react-native` 14 and its `test-renderer` peer as dev dependencies for screen tests
- TODO plan for an expanded, configurable chart view
- Regression test for the Training Summary padding and period buttons
- Charts moved from `react-native-chart-kit` to `react-native-gifted-charts`, with `expo-screen-orientation` and `react-native-view-shot` added (new native modules, needs a prebuild)
- The offline sync queue drains as soon as the realtime socket reconnects (or right after the sync run in progress), skipping the retry backoff of ops that only failed to reach the server, with the 30s poll kept as a fallback
- Watching uses `watch_progress` pushes on servers that send them, polling `/live` every 60s while connected and every 10s otherwise, and refetching on every socket reconnect

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
