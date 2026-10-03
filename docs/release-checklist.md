# Release checklist

Builds are local only (`npm run build:android:apk:clean`, via `local-expo-build`). There is no EAS
pipeline. `.github/workflows/ci.yml` runs lint, the icon-label scan, typecheck and tests on push,
everything below is manual.

## Before building

- [ ] `npm run lint` clean (errors only, since `react-hooks/exhaustive-deps` warnings are a known backlog).
- [ ] `npm run lint:a11y` reports zero unlabeled icon-only controls.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm test` green.
- [ ] `npm audit --omit=dev` reviewed. Build-only tooling findings are acceptable. Runtime ones are not.
- [ ] `versionCode` / `version` bumped in `app.json`.
- [ ] Signing secrets present (`%USERPROFILE%\.owngains-secrets.bat` on Windows, `~/.owngains-secrets` on Linux).
      Without them the Gradle release build silently falls back to `signingConfigs.debug` and the APK is
      not installable as an update.
- [ ] `npm run build:privacy-policy` re-run if `PrivacyPolicyScreen.tsx` changed, and `docs/privacy-policy.html`
      published wherever you host this instance (the Play listing needs a reachable URL).
- [ ] `npx expo prebuild --platform android --clean` (prebuild generates android/, so don't hand-edit it).

## Smoke test on the release APK

ProGuard/R8 and resource shrinking only run in release, so check these on the signed release
build, not on a dev client.

- [ ] App launches, no white screen (a stripped class shows up here first).
- [ ] First launch shows the onboarding choice. Picking either option opens the matching sign-in
      state, and the screen does not reappear on the next launch.
- [ ] Login screen's "keep everything on this device" link returns to onboarding, and picking offline
      there signs in locally without a further prompt.
- [ ] Settings → Change Storage Mode returns to onboarding, and picking a server logs the offline
      profile out and opens the login screen.
- [ ] Offline mode: create account-free session, log sets, end session, reopen app. The data is still there.
- [ ] Online mode: login, silent token refresh survives ~1h, logout.
- [ ] Airplane mode mid-session: sets queue, reconnect replays them, no duplicates, no wedged sync spinner.
- [ ] Airplane mode at cold start with a stored session: app stays logged in (does not log out on unreachable server).
- [ ] Local notifications arrive (set a supplement reminder a couple of minutes out, and confirm it
      arrives again the next day, since the DAILY trigger is what makes it repeat).
- [ ] `.xlsx` import of a real exported workbook (the xlsx package comes from the SheetJS CDN tarball,
      not npm, so verify it is still installed).
- [ ] LAN server discovery (zeroconf) finds a local server, and a `http://192.168.x.x` server URL connects
      (the app allows cleartext everywhere but `setServerUrl` restricts plaintext to RFC1918/loopback).
- [ ] Force a crash in a debug-signed release variant and confirm it reaches Sentry with no console/network
      breadcrumbs attached.
- [ ] Delete Account (both online and offline mode) removes data and returns to the logged-out state.
- [ ] Backup round trip: Export My Data, log a new session and delete a progress photo, then Restore
      From Backup: the session is gone, the photo is back and its image renders (a restored
      photo that renders blank means the URI re-pointing failed).
- [ ] Widget boards: reorder/resize/remove on Home and one Tracking sub-tab, restart, layout persisted.

## Play Console

- [ ] No location permission in the built manifest (`aapt dump permissions` on the artifact). The app
      declares none, and any that reappears via a dependency's manifest merge puts the listing back into
      Play's background-location review.
- [ ] Data safety form matches `PrivacyPolicyScreen.tsx`.
- [ ] Privacy policy URL points at the self-hosted copy of `docs/privacy-policy.html`.
- [ ] `targetSdkVersion` still meets the current Play requirement.
