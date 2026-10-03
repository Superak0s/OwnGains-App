#!/usr/bin/env bash
# The brace group makes bash parse the whole file before running anything.
# Bash otherwise reads a script lazily, and under WSL re-reading this file from
# /mnt/c after the multi-minute gradle build fails with "error reading input
# file: No data available".
{
set -e

# Runs on Windows (Git Bash), WSL and native Linux. The only difference is the
# WSL case: gradle/metro on /mnt/c via 9p is unusably slow, so the project is
# mirrored to the Linux filesystem, built there, and the results copied back.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(dirname "$SCRIPT_DIR")"
BUILD="$SRC"
ENV_NAME="native"

if grep -qi microsoft /proc/version 2>/dev/null; then
    if [[ "$SRC" == /mnt/* ]]; then
        BUILD="$HOME/$(basename "$SRC")"
        ENV_NAME="WSL (mirrored to $BUILD)"
    else
        ENV_NAME="WSL"
    fi
fi

usage() {
    cat <<'EOF'
Usage: scripts/release.sh [debug] [apk] [aab] [wsl] [--options]

Words pick what gets built and where; --options tune how.

What to build (default, or `apk aab`: a full release of both)
  apk            Release the APKs only (no Play Store AAB).
  aab            Release the AAB only. No GitHub release (it has nothing to
                 attach), so --no-release/--draft/--prerelease don't apply.
  debug          Build only a debug APK into release/ - no version bump,
                 keystore check, verification, changelog, commit, push or
                 GitHub release. Takes only --no-prebuild and --32bit.

Where to build
  wsl            From Git Bash/Windows, re-run this script inside WSL with the
                 same other arguments. Ignored when already in WSL.

Pipeline (what a release does, in order)
  [1] sync to WSL mirror -> [2] version bump + changelog -> [3] verify + prebuild
  -> [4] build APKs + AAB -> [5] git commit/push -> [6] GitHub release
  debug mode runs only install + prebuild + the debug APK, then stops.

Options for release and debug
  --no-prebuild  Incremental `expo prebuild` instead of the default
                 `--clean` one. Faster, but unsafe after adding or upgrading
                 native deps or editing plugins/.
  --32bit        Also build the armeabi-v7a APK. By default only arm64-v8a is
                 built (roughly halves the native compile). The AAB always
                 ships both ABIs, so this does nothing with `aab`.

Options for releases only (rejected with `debug`)
  Version        [2]
    --bump=CHOICE   Skip the version prompt: patch, minor, keep, or X.Y.Z.
    --no-version-code
                    Leave android.versionCode as is instead of bumping it by 1.
                    Play rejects an upload that reuses one.
  Verification   [3]
    --no-test       Skip jest. Lint and typecheck still run.
    --no-sourcemaps Release without SENTRY_AUTH_TOKEN (otherwise the script
                    stops: crash reports would be unreadable minified stacks).
  Git            [5]
    --no-push       Skip git add/commit/push; the bump stays local, uncommitted.
    --message=MSG   Commit message. Unused with --no-push or --bump=keep.
  GitHub release [6]
    --no-release    Skip the GitHub release.
    --draft         Create it as a draft.        (unused with --no-release)
    --prerelease    Mark it as a pre-release.    (unused with --no-release)

Mutually exclusive
  debug + aab, or debug + any release-only option
  aab or --no-release + --draft/--prerelease     (no release is created)

  -h, --help     Show this help.
EOF
}

DO_CLEAN=true
SKIP_PUSH=false
SKIP_TESTS=false
BUMP_CODE=true
WANT_APK=false
WANT_AAB=false
SKIP_32BIT=true
ALLOW_NO_SOURCEMAPS=false
BUMP_ARG=""
COMMIT_MSG=""
SKIP_RELEASE=false
DEBUG_ONLY=false
USE_WSL=false
PASS_ARGS=()
GH_RELEASE_FLAGS=()
for arg in "$@"; do
    [ "$arg" = wsl ] || PASS_ARGS+=("$arg")
    case "$arg" in
        --no-prebuild) DO_CLEAN=false ;;
        --no-push) SKIP_PUSH=true ;;
        --no-test) SKIP_TESTS=true ;;
        --no-version-code) BUMP_CODE=false ;;
        apk) WANT_APK=true ;;
        aab) WANT_AAB=true ;;
        --32bit) SKIP_32BIT=false ;;
        debug) DEBUG_ONLY=true ;;
        wsl) USE_WSL=true ;;
        --no-sourcemaps) ALLOW_NO_SOURCEMAPS=true ;;
        --bump=*) BUMP_ARG="${arg#*=}" ;;
        --message=*) COMMIT_MSG="${arg#*=}" ;;
        --no-release) SKIP_RELEASE=true ;;
        --draft) GH_RELEASE_FLAGS+=(--draft) ;;
        --prerelease) GH_RELEASE_FLAGS+=(--prerelease) ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $arg" >&2; usage >&2; exit 1 ;;
    esac
done

if [ "$DEBUG_ONLY" = true ]; then
    if [ -n "$BUMP_ARG$COMMIT_MSG" ] || [ "$SKIP_PUSH" = true ] || [ "$SKIP_TESTS" = true ] || [ "$BUMP_CODE" = false ] \
        || [ "$WANT_AAB" = true ] || [ "$ALLOW_NO_SOURCEMAPS" = true ] \
        || [ "$SKIP_RELEASE" = true ] || [ ${#GH_RELEASE_FLAGS[@]} -gt 0 ]; then
        echo "ERROR: debug only takes --no-prebuild and --32bit. The rest apply to releases." >&2
        exit 1
    fi
fi

if [ "$USE_WSL" = true ] && [ "$ENV_NAME" = native ]; then
    command -v wsl.exe >/dev/null || { echo "ERROR: wsl needs wsl.exe on PATH." >&2; exit 1; }
    echo "Re-running inside WSL..."
    MSYS_NO_PATHCONV=1 wsl.exe -e bash -lc 'cd "$(wslpath -a "$1")" && shift && exec bash scripts/release.sh "$@"' _ "$(cygpath -w "$SRC")" "${PASS_ARGS[@]}"
    exit $?
fi

if [ "$WANT_APK" = "$WANT_AAB" ]; then
    BUILD_APK=true; BUILD_AAB=true
else
    BUILD_APK=$WANT_APK; BUILD_AAB=$WANT_AAB
fi
[ "$BUILD_APK" = true ] || SKIP_RELEASE=true

if [ "$SKIP_RELEASE" = true ] && [ ${#GH_RELEASE_FLAGS[@]} -gt 0 ]; then
    echo "ERROR: --draft/--prerelease have no effect when no GitHub release is created." >&2
    exit 1
fi

echo "=== OwnGains App Release Script ==="
echo "Environment: $ENV_NAME"
echo ""

# [1/6] Mirror to the native filesystem (WSL only)
if [ "$BUILD" != "$SRC" ]; then
    echo "[1/6] Syncing project to $BUILD..."
    rsync -a --delete \
      --exclude='node_modules' \
      --exclude='/android' \
      --exclude='.expo' \
      --exclude='*.apk' \
      --exclude='.git' \
      --exclude='coverage' \
      --exclude='.worktrees' \
      --exclude='sonarqube' \
      --exclude='.scannerwork' \
      --exclude='.sonarlint' \
      "$SRC/" "$BUILD/"
    echo "Sync complete."
else
    echo "[1/6] Building in place, no sync needed."
fi

cd "$BUILD"

# sentry.gradle uploads sourcemaps only if SENTRY_AUTH_TOKEN is in the shell
# environment - Expo inlines EXPO_PUBLIC_* into the bundle but exports nothing.
if [ -f "$BUILD/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$BUILD/.env"
    set +a
fi
if [ "$DEBUG_ONLY" = true ]; then
    echo "[debug] npm install + prebuild + debug APK only."
    npm install --legacy-peer-deps
    if [ "$DO_CLEAN" = true ]; then
        npx expo prebuild --platform android --clean
    else
        npx expo prebuild --platform android
    fi
    sed -i 's/signingConfig = signingConfigs\.debug/signingConfig signingConfigs.debug/' "$BUILD/android/app/build.gradle"
    rm -f "$BUILD"/android/app/build/outputs/apk/debug/*.apk "$SRC"/release/OwnGains-debug-*.apk
    if [ "$SKIP_32BIT" = true ]; then
        ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a npx local-expo-build build android --apk --debug --no-sync --no-bump --no-prebuild --no-clean
    else
        npx local-expo-build build android --apk --debug --no-sync --no-bump --no-prebuild --no-clean
    fi
    mkdir -p "$SRC/release"
    found=false
    for apk in "$BUILD"/android/app/build/outputs/apk/debug/*.apk; do
        [ -f "$apk" ] || continue
        out="$SRC/release/OwnGains-debug-$(basename "$apk")"
        cp "$apk" "$out"
        echo "$(basename "$out"): $(du -h "$out" | cut -f1)"
        found=true
    done
    [ "$found" = true ] || { echo "ERROR: no debug APK found." >&2; exit 1; }
    exit 0
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
    if [ "$ALLOW_NO_SOURCEMAPS" = true ]; then
        echo "WARNING: SENTRY_AUTH_TOKEN unset, so this release will have no readable stack traces (--no-sourcemaps)."
    else
        echo "ERROR: SENTRY_AUTH_TOKEN unset. Crash reports from this release would be unreadable." >&2
        echo "Set it in .env or the environment, or pass --no-sourcemaps to release anyway." >&2
        exit 1
    fi
fi

# A wrong password or alias otherwise surfaces only after the full Gradle build.
check_keystore() {
    local props="$BUILD/keystore.properties" file pass alias type
    [ -f "$props" ] || { echo "ERROR: keystore.properties missing. Run: npx local-expo-build keystore import" >&2; exit 1; }
    command -v keytool >/dev/null || { echo "ERROR: keytool (JDK) is needed to verify the keystore." >&2; exit 1; }
    prop() { grep -m1 "^$1=" "$props" | cut -d= -f2- | tr -d '\r'; }
    file="$(prop storeFile)"; pass="$(prop storePassword)"; alias="$(prop keyAlias)"
    [ -n "$file" ] && [ -n "$pass" ] && [ -n "$alias" ] && [ -n "$(prop keyPassword)" ] \
        || { echo "ERROR: keystore.properties needs storeFile, storePassword, keyAlias and keyPassword." >&2; exit 1; }
    for f in "$BUILD/$file" "$BUILD/android/app/$file"; do [ -f "$f" ] && break; done
    [ -f "$f" ] || { echo "ERROR: keystore file '$file' not found next to keystore.properties." >&2; exit 1; }
    case "$file" in *.p12|*.pfx) type=PKCS12 ;; *) type=JKS ;; esac
    command -v cygpath >/dev/null && f="$(cygpath -w "$f")"
    if ! KS_PASS="$pass" keytool -list -keystore "$f" -storetype "$type" -storepass:env KS_PASS -alias "$alias" >/dev/null 2>&1; then
        echo "ERROR: cannot open $file with the configured storePassword/keyAlias. Wrong password or alias." >&2
        exit 1
    fi
    # -list never reads the private key. Copying it to a scratch store does, so it needs keyPassword.
    local scratch rc=0
    scratch="$(mktemp -d)"
    KS_PASS="$pass" KEY_PASS="$(prop keyPassword)" keytool -importkeystore -srckeystore "$f" -srcstoretype "$type" \
        -srcstorepass:env KS_PASS -srckeypass:env KEY_PASS -srcalias "$alias" \
        -destkeystore "$(command -v cygpath >/dev/null && cygpath -w "$scratch/t.p12" || echo "$scratch/t.p12")" \
        -deststoretype PKCS12 -deststorepass:env KS_PASS >/dev/null 2>&1 || rc=$?
    rm -rf "$scratch"
    if [ $rc -ne 0 ]; then
        echo "ERROR: $file opens, but alias '$alias' cannot be read with the configured keyPassword. Fix keyPassword in keystore.properties." >&2
        exit 1
    fi
    echo "Keystore OK ($file, alias $alias)."
}
check_keystore

# [2/6] Version bump
echo ""
echo "[2/6] Version management..."

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r CUR_MAJOR CUR_MINOR CUR_PATCH <<< "$CURRENT_VERSION"
AUTO_PATCH_VERSION="$CUR_MAJOR.$CUR_MINOR.$((CUR_PATCH + 1))"
AUTO_MINOR_VERSION="$CUR_MAJOR.$((CUR_MINOR + 1)).0"

echo "Current version: $CURRENT_VERSION"
echo ""
echo "[1] Increment patch to $AUTO_PATCH_VERSION"
echo "[2] Increment minor to $AUTO_MINOR_VERSION (resets patch to 0)"
echo "[3] Enter custom version"
echo "[4] Keep current version ($CURRENT_VERSION)"
echo ""
KEEP_VERSION=false
case "$BUMP_ARG" in
    patch) VERSION_CHOICE=1 ;;
    minor) VERSION_CHOICE=2 ;;
    keep) VERSION_CHOICE=4 ;;
    "") read -rp "Choose (1-4, default=1): " VERSION_CHOICE ;;
    *) VERSION_CHOICE=3; NEW_VERSION="$BUMP_ARG" ;;
esac

case "${VERSION_CHOICE:-1}" in
    2) NEW_VERSION="$AUTO_MINOR_VERSION" ;;
    3) [ -n "$BUMP_ARG" ] || read -rp "Enter custom version (e.g. 2.0.0): " NEW_VERSION ;;
    4) NEW_VERSION="$CURRENT_VERSION"; KEEP_VERSION=true ;;
    *) NEW_VERSION="$AUTO_PATCH_VERSION" ;;
esac

# gradle's versionName and scripts/bump-version.js both assume a plain x.y.z.
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: '$NEW_VERSION' is not a valid x.y.z version."
    exit 1
fi

if ! node scripts/release-changelog.js check; then
    echo "NOTE: CHANGELOG.md has nothing under [Unreleased], releasing without changelog entries."
fi

# Known now so the changelog links can point at the tag [6/6] creates.
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="v${NEW_VERSION}-${TIMESTAMP}"

echo "Updating version to: $NEW_VERSION"

# Asked up front so the rest of the run is unattended.
# Keeping the version amends the existing commit, so no message is needed.
# Skipped entirely with --no-push since nothing will be committed.
if [ "$KEEP_VERSION" = false ] && [ "$SKIP_PUSH" = false ]; then
    [ -n "$COMMIT_MSG" ] || read -rp "Commit message (Enter for 'Release v$NEW_VERSION'): " COMMIT_MSG
    COMMIT_MSG="${COMMIT_MSG:-Release v$NEW_VERSION}"
fi

NEW_VERSION="$NEW_VERSION" BUMP_CODE="$BUMP_CODE" node -e '
const fs = require("fs");
const v = process.env.NEW_VERSION;
const pkg = JSON.parse(fs.readFileSync("./package.json", "utf8"));
pkg.version = v;
fs.writeFileSync("./package.json", JSON.stringify(pkg, null, 2) + "\n");
const app = JSON.parse(fs.readFileSync("./app.json", "utf8"));
app.expo.version = v;
// Play rejects an upload whose versionCode is not above the last one, and
// prebuild --clean regenerates build.gradle from this value.
if (process.env.BUMP_CODE === "true") {
    app.expo.android.versionCode = (app.expo.android.versionCode || 0) + 1;
}
fs.writeFileSync("./app.json", JSON.stringify(app, null, 2) + "\n");
'

# Stamped before the build because the app bundles CHANGELOG.md for Settings ->
# What's New, which looks up the installed version's heading. Restored from a
# copy on failure, not git, since [Unreleased] is usually uncommitted work.
CHANGELOG_BACKUP="$(mktemp)"
cp "$SRC/CHANGELOG.md" "$CHANGELOG_BACKUP"
node scripts/release-changelog.js stamp "$NEW_VERSION" "$(date +%Y-%m-%d)" "$TAG"

if [ "$BUILD" != "$SRC" ]; then
    cp "$BUILD/package.json" "$BUILD/app.json" "$BUILD/CHANGELOG.md" "$SRC/"
fi
echo "Version updated to $NEW_VERSION (versionCode $(node -p 'require("./app.json").expo.android.versionCode'))"

# Only the GitHub APKs get the Ko-fi link. Play's Payments policy bans it in the
# AAB. Rewriting a source file (rather than an env var) changes its content
# hash, so neither Metro's cache nor Gradle's up-to-date check reuses the
# other build's bundle.
KOFI_URL="https://ko-fi.com/superak0s"
DISTRIBUTION_FILE="$BUILD/src/shared/distribution.ts"
set_kofi_url() {
    sed -i "s#^export const KOFI_URL: string | null = .*;#export const KOFI_URL: string | null = $1;#" "$DISTRIBUTION_FILE"
    grep -q "= $1;" "$DISTRIBUTION_FILE" || { echo "ERROR: could not set KOFI_URL in $DISTRIBUTION_FILE" >&2; exit 1; }
}
require_release_signed() {
    if ! grep -q 'signingConfigs\.release' "$BUILD/android/app/build.gradle"; then
        echo "ERROR: android/app/build.gradle signs the release build with the debug key. The keystore was not injected. Run: npx local-expo-build keystore import" >&2
        exit 1
    fi
}

aab_is_debug_signed() {
    local aab="$1"
    command -v cygpath >/dev/null && aab="$(cygpath -w "$aab")"
    keytool -printcert -jarfile "$aab" 2>&1 | grep -qiE 'CN=Android Debug|no signer|not signed'
}

bundle_has_kofi() {
    local py archive="$1" rc=0
    py="$(command -v python || command -v python3)" || { echo "ERROR: python is needed to check the release bundles." >&2; exit 1; }
    # Windows Python can't open Git Bash's /c/... paths.
    command -v cygpath >/dev/null && archive="$(cygpath -w "$archive")"
    "$py" - "$archive" "$2" "$KOFI_URL" <<'PY' || rc=$?
import sys, zipfile
archive, member, needle = sys.argv[1:]
sys.exit(0 if needle.encode() in zipfile.ZipFile(archive).read(member) else 10)
PY
    case $rc in
        0) return 0 ;;
        10) return 1 ;;
        *) echo "ERROR: could not read $2 from $1." >&2; exit 1 ;;
    esac
}

trap 'echo ""; echo "Build failed, reverting version bump and changelog."; git -C "$SRC" checkout -- package.json app.json; cp "$CHANGELOG_BACKUP" "$SRC/CHANGELOG.md"' ERR

# [3/6] Install dependencies, verify, prebuild
echo ""
echo "[3/6] Installing dependencies and running prebuild..."

npm install --legacy-peer-deps

echo ""
if [ "$SKIP_TESTS" = true ]; then
    echo "Verifying before build (lint + a11y lint + typecheck, tests skipped by --no-test)..."
else
    echo "Verifying before build (lint + a11y lint + typecheck + tests)..."
fi
VERIFY_LOGS="$(mktemp -d)"
declare -A VERIFY_PIDS
run_check() {
    local name="$1"; shift
    "$@" >"$VERIFY_LOGS/$name.log" 2>&1 &
    VERIFY_PIDS[$name]=$!
}
run_check lint npm run lint
run_check lint-a11y npm run lint:a11y
run_check typecheck npx tsc --noEmit
if [ "$SKIP_TESTS" = false ]; then
    run_check test npm test -- --silent
fi
VERIFY_FAILED=false
for name in "${!VERIFY_PIDS[@]}"; do
    if wait "${VERIFY_PIDS[$name]}"; then
        echo "  $name: ok"
    else
        echo "  $name: FAILED"
        cat "$VERIFY_LOGS/$name.log"
        VERIFY_FAILED=true
    fi
done
rm -rf "$VERIFY_LOGS"
if [ "$VERIFY_FAILED" = true ]; then
    false
fi

# xlsx is pinned to a SheetJS CDN tarball rather than the npm registry, so
# `npm audit` never sees it and a published security fix goes unnoticed.
# SheetJS publishes no version endpoint, so this prompts a look rather than checking.
echo "REMINDER: xlsx is pinned to $(grep -o 'xlsx-[0-9.]*' "$BUILD/package.json" | head -1), invisible to 'npm audit' - check https://cdn.sheetjs.com/ for a newer release."

echo "Verification passed."
echo ""

if [ "$DO_CLEAN" = true ]; then
    echo "Running full clean prebuild..."
    npx expo prebuild --platform android --clean
else
    echo "Running incremental prebuild (--no-prebuild set)..."
    npx expo prebuild --platform android
fi

# Expo's template writes `signingConfig = signingConfigs.debug`, which local-expo-build's
# release wiring (it matches `signingConfig signingConfigs.debug`) skips, shipping a debug-signed build.
sed -i 's/signingConfig = signingConfigs\.debug/signingConfig signingConfigs.debug/' "$BUILD/android/app/build.gradle"

# [4/6] Build the APK via local-expo-build
# local-expo-build handles: signing config injection, keystore restore after
# `expo prebuild --clean` wipes android/, and the gradlew assembleRelease call.
# --no-prebuild : prebuild already ran in [3/6]. Letting it run again with
#                 --clean wipes android/ and forces a from-scratch native build
# --no-clean    : otherwise it still prompts whether to clean, even with --no-prebuild
# --no-bump     : version bump already handled in [2/6]
# --no-sync     : skip pushing versionCode to EAS (we don't use EAS)
#
# One-time setup required before this works (not part of the script):
#   cd "$BUILD" && npx local-expo-build keystore import /path/to/your.jks
echo ""
trap 'set_kofi_url null' EXIT
OUT_DIR="$SRC/release"
mkdir -p "$OUT_DIR"
APK_OUTS=()
if [ "$BUILD_APK" = true ]; then
    echo "[4/6] Building release APK via local-expo-build..."
    set_kofi_url "\"$KOFI_URL\""
    # Stale per-ABI APKs survive an incremental prebuild and would be released as this version.
    rm -f "$BUILD"/android/app/build/outputs/apk/release/*.apk
    # ORG_GRADLE_PROJECT_* overrides gradle.properties. The AAB call below doesn't see it.
    if [ "$SKIP_32BIT" = true ]; then
        echo "Building arm64-v8a only (pass --32bit for armeabi-v7a too)."
        ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a npx local-expo-build build android --apk --no-sync --no-bump --no-prebuild --no-clean
    else
        npx local-expo-build build android --apk --no-sync --no-bump --no-prebuild --no-clean
    fi
    require_release_signed

    # One APK per ABI (plugins/withAbiSplits.js), so this is a set, not a file.
    APK_DIR="$BUILD/android/app/build/outputs/apk/release"
    APK_OUTS=()
    for apk in "$APK_DIR"/*-release.apk; do
        [ -f "$apk" ] || continue
        abi="$(basename "$apk" -release.apk)"
        abi="${abi#app-}"
        out="$OUT_DIR/OwnGains-v$NEW_VERSION-$abi.apk"
        cp "$apk" "$out"
        echo "$(basename "$out"): $(du -h "$out" | cut -f1)"
        APK_OUTS+=("$out")
    done

    if [ ${#APK_OUTS[@]} -eq 0 ]; then
        echo "ERROR: no APK found in $APK_DIR"
        exit 1
    fi
    for old in "$OUT_DIR"/*.apk; do
        [[ " ${APK_OUTS[*]} " == *" $old "* ]] || { rm -f "$old" && echo "Removed old $(basename "$old")"; }
    done
    if ! bundle_has_kofi "${APK_OUTS[0]}" assets/index.android.bundle; then
        echo "ERROR: the GitHub APK has no Ko-fi link. It would offer Play tips that can't work outside Play." >&2
        exit 1
    fi
    set_kofi_url null
else
    echo "aab only, skipping the APK."
fi

AAB_OUT=""
if [ "$BUILD_AAB" = true ]; then
    echo ""
    echo "[4/6] Building release AAB via local-expo-build..."
    npx local-expo-build build android --aab --no-sync --no-bump --no-prebuild --no-clean
    AAB_SRC="$BUILD/android/app/build/outputs/bundle/release/app-release.aab"
    if [ ! -f "$AAB_SRC" ]; then
        echo "ERROR: no AAB found at $AAB_SRC"
        exit 1
    fi
    if aab_is_debug_signed "$AAB_SRC"; then
        echo "ERROR: the AAB is debug-signed or unsigned - Play would reject it." >&2
        exit 1
    fi
    if bundle_has_kofi "$AAB_SRC" base/assets/index.android.bundle; then
        echo "ERROR: the AAB still contains the Ko-fi link - Play would reject it under the Payments policy." >&2
        exit 1
    fi
    # "Keep current version" still bumps versionCode, and Play only accepts
    # each code once, so the code is what tells two bundles apart.
    VERSION_CODE=$(node -p 'require("./app.json").expo.android.versionCode')
    AAB_OUT="$OUT_DIR/OwnGains-v$NEW_VERSION-$VERSION_CODE.aab"
    cp "$AAB_SRC" "$AAB_OUT"
    echo "$(basename "$AAB_OUT"): $(du -h "$AAB_OUT" | cut -f1)"
    for old in "$OUT_DIR"/*.aab; do
        [ "$old" = "$AAB_OUT" ] || { rm -f "$old" && echo "Removed old $(basename "$old")"; }
    done
else
    echo "apk only, skipping the AAB."
fi

trap - ERR
rm -f "$CHANGELOG_BACKUP"

# [5/6] Push source to GitHub
# Runs only after a successful build, so a bumped-but-broken version never
# lands as a pushed commit. Skipped entirely with --no-push: source tree is
# left as-is (including the local, uncommitted version bump).
# gh in [6/6] needs the git repo too, and the WSL mirror has no .git.
cd "$SRC"
echo ""
if [ "$SKIP_PUSH" = true ]; then
    echo "[5/6] --no-push set, skipping git add/commit/push."
else
    echo "[5/6] Pushing source code to GitHub..."
    git add .

    if git diff --cached --quiet; then
        echo "Nothing to commit, skipping push."
    elif [ "$KEEP_VERSION" = true ]; then
        echo "Version unchanged, amending the last commit."
        git commit --amend --no-edit
        git push --force-with-lease origin main
    else
        git commit -m "$COMMIT_MSG"
        git push origin main
    fi
fi

# [6/6] Push to GitHub Releases
echo ""
if [ "$SKIP_RELEASE" = true ]; then
    echo "[6/6] --no-release set, skipping GitHub release."
    [ -n "$AAB_OUT" ] && echo "Play Store bundle: $AAB_OUT"
    exit 0
fi
echo "[6/6] Creating GitHub release..."

NOTES_FILE="$(mktemp)"
if ! node scripts/release-changelog.js notes "$NEW_VERSION" > "$NOTES_FILE" \
    || ! grep -q '[^[:space:]]' "$NOTES_FILE"; then
    echo "Release v$NEW_VERSION built on $TIMESTAMP" > "$NOTES_FILE"
fi
if [ -f docs/release-install.md ]; then
    printf '\n' >> "$NOTES_FILE"
    sed "s/{{VERSION}}/$NEW_VERSION/g" docs/release-install.md >> "$NOTES_FILE"
fi

gh release create "$TAG" "${APK_OUTS[@]}" \
    --title "OwnGains v$NEW_VERSION" \
    --notes-file "$NOTES_FILE" "${GH_RELEASE_FLAGS[@]}"
rm -f "$NOTES_FILE"

echo ""
echo "=== Done! APK released as $TAG ==="
if [ -n "$AAB_OUT" ]; then
    echo "Play Store bundle: $AAB_OUT"
fi

# Without this bash reads on past the group and mis-seeks in the file.
exit 0
}
