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

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
    B=$'\e[1m' DIM=$'\e[2m' RED=$'\e[31m' GRN=$'\e[32m' YEL=$'\e[33m' CYN=$'\e[36m' R=$'\e[0m'
else
    B='' DIM='' RED='' GRN='' YEL='' CYN='' R=''
fi
step() { CURRENT_STEP="[$1] $2"; printf '\n%s==> [%s] %s %s(%dm%02ds)%s\n' "$B$CYN" "$1" "$2" "$DIM" $((SECONDS / 60)) $((SECONDS % 60)) "$R"; }
ok()   { printf '%s  OK  %s%s\n' "$GRN" "$*" "$R"; }
info() { printf '%s  ..  %s%s\n' "$DIM" "$*" "$R"; }
warn() { printf '%s  !!  %s%s\n' "$YEL" "$*" "$R"; }
err()  { printf '%s%sERROR:%s%s %s%s\n' "$B" "$RED" "$R" "$RED" "$*" "$R" >&2; }
die()  { err "$@"; exit 1; }

usage() {
    cat <<EOF
${B}Usage:${R} scripts/release.sh [apk|aab|debug] [wsl] [options]

${B}Most common${R}
  ${CYN}scripts/release.sh${R}                    Full release: APKs + AAB, commit, push, GitHub release
  ${CYN}scripts/release.sh --bump=patch${R}       Same, without the version prompt
  ${CYN}scripts/release.sh debug${R}              Debug APK into release/, nothing else
  ${CYN}scripts/release.sh aab${R}                Play Store bundle only (no GitHub release)
  ${CYN}scripts/release.sh ota --bump=patch${R}   JS-only fix as an over-the-air update, no store build
  ${CYN}scripts/release.sh --no-push --no-release${R}
                                        Build everything, publish nothing

${B}What to build${R} ${DIM}(default: APKs and AAB)${R}
  apk                 GitHub APKs only
  aab                 Play Store AAB only, so no GitHub release
  debug               Debug APK only. No bump, checks, commit or release.
                      Accepts only --no-prebuild and --32bit.
  ota                 Over-the-air update: version + changelog, checks, then
                      scripts/publish-ota.js uploads it to OTA_UPLOAD from .env
                      (user@host:/path/to/UPDATES_DIR), commit and push. No native
                      build, versionCode, Play upload or GitHub release, so the
                      GitHub update check keeps pointing at the last APK release.
                      Refused when the native fingerprint differs from the last
                      store release's (.ota-runtime-version).
  wsl                 From Git Bash, re-run this inside WSL

${B}Faster builds${R}
  --no-prebuild       Incremental prebuild without asking. Unsafe after native deps, plugins/,
                      modules/ or app.json change. Without it a clean prebuild runs when packages,
                      config, plugins/, modules/ or assets changed since the last one, and otherwise
                      the script asks (incremental after 30s).
  --32bit             Also build the armeabi-v7a APK (arm64-v8a only by default)
  --no-test           Skip jest and the CI run under act. Lint and typecheck still run.

${B}Version${R}
  --bump=X            patch, minor, keep or 1.2.3 (skips the prompt)
  --no-version-code   Keep android.versionCode. Play rejects a reused code.

${B}Git and GitHub${R}
  --message=MSG       Commit message (skips the prompt)
  --no-push           No commit or push. The bump stays local.
  --no-release        No GitHub release
  --draft             GitHub release as a draft
  --prerelease        GitHub release as a pre-release

${B}Google Play${R}
  Uploads the AAB with docs/play-release-notes.txt whenever .env sets
  PLAY_SERVICE_ACCOUNT (the service-account JSON or a path to it). Skipped otherwise.
  --play=TRACKS       Comma-separated tracks to upload to: internal (default), alpha (closed
                      testing), beta, production (as a draft) or custom ones, e.g. internal,alpha.
                      PLAY_TRACK in .env takes the same list.
  --no-play           Don't upload

${B}Other${R}
  --no-sourcemaps     Release without SENTRY_AUTH_TOKEN (unreadable crash reports)
  -h, --help          Show this help

${DIM}Steps: [1] WSL sync, [2] version + changelog, [3] verify + prebuild,
[4] APK, [5] AAB, [6] Play upload, [7] git commit/push, [8] GitHub release.
A failed or Ctrl+C'd build reverts the bump. Ctrl+C also deletes the WSL mirror
except node_modules.
Each run's output is saved to release/release-<timestamp>.log (the last 20 are kept).${R}
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
OTA_ONLY=false
USE_WSL=false
PLAY_TRACK_ARG=""
SKIP_PLAY=false
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
        ota) OTA_ONLY=true ;;
        wsl) USE_WSL=true ;;
        --no-sourcemaps) ALLOW_NO_SOURCEMAPS=true ;;
        --bump=*) BUMP_ARG="${arg#*=}" ;;
        --message=*) COMMIT_MSG="${arg#*=}" ;;
        --no-release) SKIP_RELEASE=true ;;
        --draft) GH_RELEASE_FLAGS+=(--draft) ;;
        --prerelease) GH_RELEASE_FLAGS+=(--prerelease) ;;
        --play=*) PLAY_TRACK_ARG="${arg#*=}" ;;
        --no-play) SKIP_PLAY=true ;;
        -h|--help) usage; exit 0 ;;
        *) err "Unknown option: $arg"; echo "Run scripts/release.sh -h for the list." >&2; exit 1 ;;
    esac
done

if [ "$DEBUG_ONLY" = true ]; then
    if [ -n "$BUMP_ARG$COMMIT_MSG" ] || [ "$SKIP_PUSH" = true ] || [ "$SKIP_TESTS" = true ] || [ "$BUMP_CODE" = false ] \
        || [ "$WANT_APK" = true ] || [ "$WANT_AAB" = true ] || [ "$ALLOW_NO_SOURCEMAPS" = true ] \
        || [ "$SKIP_RELEASE" = true ] || [ ${#GH_RELEASE_FLAGS[@]} -gt 0 ] || [ -n "$PLAY_TRACK_ARG" ] || [ "$SKIP_PLAY" = true ]; then
        die "debug only takes --no-prebuild and --32bit. The rest apply to releases."
    fi
fi
if [ "$OTA_ONLY" = true ]; then
    if [ "$DEBUG_ONLY" = true ] || [ "$WANT_APK" = true ] || [ "$WANT_AAB" = true ] || [ "$DO_CLEAN" = false ] \
        || [ "$SKIP_32BIT" = false ] || [ "$BUMP_CODE" = false ] || [ "$SKIP_RELEASE" = true ] \
        || [ ${#GH_RELEASE_FLAGS[@]} -gt 0 ] || [ -n "$PLAY_TRACK_ARG" ] || [ "$SKIP_PLAY" = true ]; then
        die "ota builds nothing native, so it takes only --bump, --message, --no-push, --no-test and --no-sourcemaps."
    fi
    [ -f "$SRC/.ota-runtime-version" ] || die "no .ota-runtime-version. A store release records it, so make one before the first OTA."
fi

# Checked before any prompt, so a missing act doesn't cost a version choice.
RUN_ACT=false
if [ "$DEBUG_ONLY" = false ] && [ "$SKIP_TESTS" = false ] && [ "$SKIP_PUSH" = false ]; then
    RUN_ACT=true
    command -v act >/dev/null 2>&1         || die "act is not installed (winget install nektos.act, or brew/pacman install act). Or pass --no-test."
    docker info >/dev/null 2>&1            || die "act needs a running Docker daemon (start Docker Desktop, and under WSL enable its WSL integration for this distro). Or pass --no-test."
fi

if [ "$USE_WSL" = true ] && [ "$ENV_NAME" = native ]; then
    command -v wsl.exe >/dev/null || die "wsl needs wsl.exe on PATH."
    info "Re-running inside WSL..."
    # -i so ~/.bashrc (nvm, ANDROID_HOME, JAVA_HOME, tokens) loads past its non-interactive early return.
    MSYS_NO_PATHCONV=1 wsl.exe -e bash -ilc 'cd "$(wslpath -a "$1")" && shift && exec bash scripts/release.sh "$@"' _ "$(cygpath -w "$SRC")" "${PASS_ARGS[@]}"
    exit $?
fi

if [ "$OTA_ONLY" = true ]; then
    BUILD_APK=false; BUILD_AAB=false; BUMP_CODE=false
elif [ "$WANT_APK" = "$WANT_AAB" ]; then
    BUILD_APK=true; BUILD_AAB=true
else
    BUILD_APK=$WANT_APK; BUILD_AAB=$WANT_AAB
fi
[ "$BUILD_APK" = true ] || SKIP_RELEASE=true

if [ "$SKIP_RELEASE" = true ] && [ ${#GH_RELEASE_FLAGS[@]} -gt 0 ]; then
    die "--draft/--prerelease have no effect when no GitHub release is created."
fi
if [ -n "$PLAY_TRACK_ARG" ] && [ "$BUILD_AAB" = false ]; then
    die "--play=TRACK uploads the AAB, so it can't be combined with apk."
fi

# Checked before the build, so a push or release that can't succeed doesn't cost one.
if [ "$DEBUG_ONLY" = false ] && [ "$SKIP_PUSH" = false ]; then
    branch="$(git -C "$SRC" rev-parse --abbrev-ref HEAD)"
    [ "$branch" = main ] || die "releases are pushed to main, but $branch is checked out."
    git -C "$SRC" fetch -q origin main || die "git fetch origin main failed."
    git -C "$SRC" merge-base --is-ancestor origin/main HEAD \
        || die "origin/main has commits this checkout doesn't. Pull first, the push would be rejected."
fi
if [ "$DEBUG_ONLY" = false ] && [ "$SKIP_RELEASE" = false ]; then
    command -v gh >/dev/null || die "gh is not installed. Install the GitHub CLI or pass --no-release."
    gh auth status >/dev/null 2>&1 || die "gh is not logged in. Run gh auth login, or pass --no-release."
fi

yn() { [ "$1" = true ] && printf '%syes%s' "$GRN" "$R" || printf '%sno%s' "$YEL" "$R"; }
# nvm is usually loaded from ~/.bashrc, which returns early in non-interactive shells.
if ! command -v node >/dev/null && [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
fi
command -v node >/dev/null || die "node not found on PATH ($ENV_NAME). Install Node or load nvm first."
if [ "$OTA_ONLY" = false ] && [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ] && [ ! -f android/local.properties ]; then
    die "Android SDK not found ($ENV_NAME). Export ANDROID_HOME (e.g. in ~/.profile or ~/.bashrc)."
fi

mkdir -p "$SRC/release"
old_logs=("$SRC"/release/release-*.log)
if [ ${#old_logs[@]} -gt 19 ]; then rm -f "${old_logs[@]:0:${#old_logs[@]}-19}"; fi
LOG_FILE="$SRC/release/release-$(date +%Y%m%d-%H%M%S).log"
# tee -i ignores Ctrl+C so the cleanup trap's output still reaches the terminal and the log.
# A `trap '' INT` before exec doesn't: MSYS and uutils tee both still die on it.
exec > >(exec tee -ia "$LOG_FILE") 2>&1

printf '%s=== OwnGains App Release ===%s\n' "$B$CYN" "$R"
printf '  Environment   %s\n' "$ENV_NAME"
if [ "$DEBUG_ONLY" = true ]; then
    printf '  Mode          %sdebug APK only%s\n' "$YEL" "$R"
else
    what=""; [ "$BUILD_APK" = true ] && what="APK"; [ "$BUILD_AAB" = true ] && what="${what:+$what + }AAB"
    [ "$OTA_ONLY" = true ] && what="OTA update (play + github channels)"
    printf '  Build         %s\n' "$what"
    printf '  Tests         %s\n' "$(yn "$([ "$SKIP_TESTS" = true ] && echo false || echo true)")"
    printf '  Commit+push   %s\n' "$(yn "$([ "$SKIP_PUSH" = true ] && echo false || echo true)")"
    printf '  GitHub rel.   %s %s\n' "$(yn "$([ "$SKIP_RELEASE" = true ] && echo false || echo true)")" "${GH_RELEASE_FLAGS[*]}"
fi
printf '  Prebuild      %s\n' "$([ "$DO_CLEAN" = true ] && echo clean || echo incremental)"
printf '  ABIs          %s\n' "$([ "$SKIP_32BIT" = true ] && echo arm64-v8a || echo 'arm64-v8a + armeabi-v7a')"

# BACKUP_DIR is set from the version bump until the build succeeds. Any exit in
# that window restores it. Ctrl+C also deletes the WSL mirror except node_modules.
ABORTED=false
BACKUP_DIR=""
APK_OUTS=()
AAB_OUT=""
cleanup() {
    local rc=$?
    set +e
    # shellcheck disable=SC2046 # one PID per word
    [ "$ABORTED" = true ] && kill $(jobs -p) 2>/dev/null
    [ -f "${DISTRIBUTION_FILE:-}" ] && set_kofi_url null
    if [ -n "$BACKUP_DIR" ]; then
        if [ $rc -ne 0 ]; then
            err "Release did not finish, reverting version bump, changelog and new release/ files."
            cp "$BACKUP_DIR"/* "$SRC/"
            rm -f "${APK_OUTS[@]}" ${AAB_OUT:+"$AAB_OUT"}
        fi
        rm -rf "$BACKUP_DIR"
    fi
    if [ "$ABORTED" = true ] && [ "$BUILD" != "$SRC" ]; then
        cd "$SRC" && find "$BUILD" -mindepth 1 -maxdepth 1 ! -name node_modules -exec rm -rf {} + \
            && info "Deleted mirror $BUILD (node_modules kept)"
    fi
    [ $rc -eq 0 ] || err "FAILED with exit code $rc during ${CURRENT_STEP:-startup} at $(date '+%Y-%m-%d %H:%M:%S'). Log: $LOG_FILE"
}
trap cleanup EXIT
# SIGTERM still kills tee, and the first write to its closed pipe would then kill bash before the revert.
trap 'trap "" PIPE; echo ""; ABORTED=true; err "Aborted."; exit 130' INT TERM

# [1/6] Mirror to the native filesystem (WSL only)
if [ "$BUILD" != "$SRC" ]; then
    step 1/8 "Syncing project to $BUILD"
    # Wiped rather than left to rsync --delete, so no file from an earlier sync remains.
    # node_modules is kept for npm install to update, android/ for an incremental prebuild
    # (a clean one deletes it itself) and .expo/ for the prebuild stamp.
    [ -d "$BUILD" ] && find "$BUILD" -mindepth 1 -maxdepth 1 ! \( -name node_modules -o -name android -o -name .expo \) -exec rm -rf {} +
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
    ok "Sync complete"
else
    step 1/8 "Building in place, no sync needed"
fi

cd "$BUILD"

# sentry.gradle uploads sourcemaps only if SENTRY_AUTH_TOKEN is in the shell
# environment - Expo inlines EXPO_PUBLIC_* into the bundle but exports nothing.
if [ -f "$BUILD/.env" ]; then
    set -a
    # A .env saved on Windows has CRLF endings, which would leave a \r on every value.
    # shellcheck disable=SC1090
    . <(tr -d '\r' < "$BUILD/.env")
    set +a
fi
PREBUILD_STAMP="$BUILD/.expo/prebuild.stamp"
# Hash of everything that makes a clean prebuild differ: dependencies, app.json minus the
# per-release version fields, app.config.js and the google-services.json it looks for,
# config plugins, local native modules and assets.
prebuild_inputs_hash() {
    node -e '
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const h = crypto.createHash("sha1");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
h.update(JSON.stringify([pkg.dependencies, pkg.devDependencies]));
const app = JSON.parse(fs.readFileSync("app.json", "utf8"));
delete app.expo.version;
if (app.expo.android) delete app.expo.android.versionCode;
h.update(JSON.stringify(app));
h.update(JSON.stringify(["secrets/google-services.json", "google-services.json"].map((f) => fs.existsSync(f))));
// Gradle writes modules/*/android/build (and .gradle, .cxx) on every build.
const walk = (d) => { if (!fs.existsSync(d)) return; for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (!fs.statSync(p).isDirectory()) { h.update(p); h.update(fs.readFileSync(p)); } else if (f !== "build" && !f.startsWith(".")) walk(p); } };
["plugins", "modules", "assets"].forEach(walk);
for (const f of ["app.config.js", "package-lock.json"]) if (fs.existsSync(f)) h.update(fs.readFileSync(f));
process.stdout.write(h.digest("hex"));
'
}
# With nothing changed since the last clean prebuild, asks whether to redo it. No answer
# within 30 seconds (or no terminal) runs an incremental one, which still writes the new versionCode.
maybe_skip_prebuild() {
    [ "$DO_CLEAN" = true ] || return 0
    if [ -f "$PREBUILD_STAMP" ] && [ -d "$BUILD/android" ] && [ "$(prebuild_inputs_hash)" = "$(cat "$PREBUILD_STAMP")" ]; then
        local ans=""
        read -t 30 -rp "${B}No packages, config, plugins, modules or assets changed since the last clean prebuild. Run one anyway?${R} [y/N] (incremental in 30s) " ans || true
        echo ""
        case "$ans" in [yY]*) ;; *) DO_CLEAN=false; return 0 ;; esac
    fi
    # A clean prebuild cut short leaves a half-generated android/ that a matching stamp would hide.
    rm -f "$PREBUILD_STAMP"
}
save_prebuild_stamp() {
    [ "$DO_CLEAN" = true ] || return 0
    mkdir -p "$(dirname "$PREBUILD_STAMP")"
    prebuild_inputs_hash > "$PREBUILD_STAMP"
}

if [ "$DEBUG_ONLY" = true ]; then
    step debug "npm install"
    npm install --legacy-peer-deps
    maybe_skip_prebuild
    step debug "Prebuild ($([ "$DO_CLEAN" = true ] && echo clean || echo incremental))"
    if [ "$DO_CLEAN" = true ]; then
        npx expo prebuild --platform android --clean
    else
        npx expo prebuild --platform android
    fi
    save_prebuild_stamp
    sed -i 's/signingConfig = signingConfigs\.debug/signingConfig signingConfigs.debug/' "$BUILD/android/app/build.gradle"
    rm -f "$BUILD"/android/app/build/outputs/apk/debug/*.apk "$SRC"/release/OwnGains-debug-*.apk
    step debug "Building debug APK"
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
        ok "$(basename "$out"): $(du -h "$out" | cut -f1)"
        found=true
    done
    [ "$found" = true ] || die "no debug APK found."
    printf '\n%s=== Done! Debug APK in release/ ===%s\n' "$B$GRN" "$R"
    exit 0
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
    if [ "$ALLOW_NO_SOURCEMAPS" = true ]; then
        warn "SENTRY_AUTH_TOKEN unset, so this release will have no readable stack traces (--no-sourcemaps)."
    else
        err "SENTRY_AUTH_TOKEN unset. Crash reports from this release would be unreadable."
        echo "Set it in .env or the environment, or pass --no-sourcemaps to release anyway." >&2
        exit 1
    fi
fi

# PLAY_SERVICE_ACCOUNT in .env is the service-account JSON itself or a path to it.
PLAY_UPLOAD=false
if [ "$BUILD_AAB" = true ] && [ "$SKIP_PLAY" = false ]; then
    PLAY_TRACK="${PLAY_TRACK_ARG:-${PLAY_TRACK:-internal}}"
    case "${PLAY_SERVICE_ACCOUNT:-}" in
        "") play_skip="no PLAY_SERVICE_ACCOUNT in .env" ;;
        "{"*) PLAY_UPLOAD=true ;;
        *)
            case "$PLAY_SERVICE_ACCOUNT" in
                [A-Za-z]:*) command -v wslpath >/dev/null && PLAY_SERVICE_ACCOUNT="$(wslpath -u "$PLAY_SERVICE_ACCOUNT")" ;;
            esac
            if [ -f "$PLAY_SERVICE_ACCOUNT" ]; then
                # Windows node can't open Git Bash's /c/... paths.
                command -v cygpath >/dev/null && PLAY_SERVICE_ACCOUNT="$(cygpath -w "$PLAY_SERVICE_ACCOUNT")"
                PLAY_UPLOAD=true
            else
                play_skip="PLAY_SERVICE_ACCOUNT file $PLAY_SERVICE_ACCOUNT not found"
            fi ;;
    esac
    if [ "$PLAY_UPLOAD" = true ]; then
        export PLAY_SERVICE_ACCOUNT
        PLAY_MAX_CODE="$(node scripts/play-upload.js --check)" \
            || die "The Play service account has no access to this app. Grant it release permissions in Play Console (Users and permissions), or pass --no-play."
        ok "Google Play upload to the $PLAY_TRACK track (permission verified, highest versionCode on Play: $PLAY_MAX_CODE)"
    elif [ -n "$PLAY_TRACK_ARG" ]; then
        die "--play=$PLAY_TRACK_ARG, but $play_skip."
    else
        info "Google Play upload skipped: $play_skip"
    fi
fi

# A wrong password or alias otherwise surfaces only after the full Gradle build.
check_keystore() {
    local props="$BUILD/keystore.properties" file pass alias type
    [ -f "$props" ] || die "keystore.properties missing. Run: npx local-expo-build keystore import"
    command -v keytool >/dev/null || die "keytool (JDK) is needed to verify the keystore."
    prop() { grep -m1 "^$1=" "$props" | cut -d= -f2- | tr -d '\r'; }
    file="$(prop storeFile)"; pass="$(prop storePassword)"; alias="$(prop keyAlias)"
    [ -n "$file" ] && [ -n "$pass" ] && [ -n "$alias" ] && [ -n "$(prop keyPassword)" ] \
        || die "keystore.properties needs storeFile, storePassword, keyAlias and keyPassword."
    for f in "$BUILD/$file" "$BUILD/android/app/$file"; do [ -f "$f" ] && break; done
    [ -f "$f" ] || die "keystore file '$file' not found next to keystore.properties."
    case "$file" in *.p12|*.pfx) type=PKCS12 ;; *) type=JKS ;; esac
    command -v cygpath >/dev/null && f="$(cygpath -w "$f")"
    if ! KS_PASS="$pass" keytool -list -keystore "$f" -storetype "$type" -storepass:env KS_PASS -alias "$alias" >/dev/null 2>&1; then
        die "cannot open $file with the configured storePassword/keyAlias. Wrong password or alias."
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
        die "$file opens, but alias '$alias' cannot be read with the configured keyPassword. Fix keyPassword in keystore.properties."
    fi
    ok "Keystore ($file, alias $alias)"
}
if [ "$OTA_ONLY" = true ]; then
    [ -n "${OTA_UPLOAD:-}" ] || die "OTA_UPLOAD is not set. Add OTA_UPLOAD=user@host:/path/to/UPDATES_DIR to .env."
else
    check_keystore
fi

# [2/6] Version bump
step 2/8 "Version"

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r CUR_MAJOR CUR_MINOR CUR_PATCH <<< "$CURRENT_VERSION"
AUTO_PATCH_VERSION="$CUR_MAJOR.$CUR_MINOR.$((CUR_PATCH + 1))"
AUTO_MINOR_VERSION="$CUR_MAJOR.$((CUR_MINOR + 1)).0"

KEEP_VERSION=false
case "$BUMP_ARG" in
    patch) VERSION_CHOICE=1 ;;
    minor) VERSION_CHOICE=2 ;;
    keep) VERSION_CHOICE=4 ;;
    "")
        echo "Current version: ${B}$CURRENT_VERSION${R}"
        echo "  [1] Patch  -> $AUTO_PATCH_VERSION ${DIM}(default)${R}"
        echo "  [2] Minor  -> $AUTO_MINOR_VERSION"
        echo "  [3] Custom"
        echo "  [4] Keep $CURRENT_VERSION"
        read -rp "${B}Choose 1-4:${R} " VERSION_CHOICE ;;
    *) VERSION_CHOICE=3; NEW_VERSION="$BUMP_ARG" ;;
esac

case "${VERSION_CHOICE:-1}" in
    2) NEW_VERSION="$AUTO_MINOR_VERSION" ;;
    3) [ -n "$BUMP_ARG" ] || read -rp "${B}Custom version (e.g. 2.0.0):${R} " NEW_VERSION ;;
    4) NEW_VERSION="$CURRENT_VERSION"; KEEP_VERSION=true ;;
    *) NEW_VERSION="$AUTO_PATCH_VERSION" ;;
esac

# gradle's versionName and scripts/bump-version.js both assume a plain x.y.z.
if ! [[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "'$NEW_VERSION' is not a valid x.y.z version."
fi

if ! node scripts/release-changelog.js check; then
    warn "CHANGELOG.md has nothing under [Unreleased], releasing without changelog entries."
fi

# Known now so the changelog links can point at the tag [6/6] creates.
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="v${NEW_VERSION}-${TIMESTAMP}"

# [7/8] runs 'git add .', so everything listed here goes into the release commit.
if [ "$SKIP_PUSH" = false ]; then
    info "The release commit will include these changes, plus the version bump:"
    git -C "$SRC" status --short
fi

# Asked up front so the rest of the run is unattended.
# Keeping the version commits as "Re-release", so no message is needed.
# Skipped entirely with --no-push since nothing will be committed.
if [ "$KEEP_VERSION" = false ] && [ "$SKIP_PUSH" = false ]; then
    default_msg="Release v$NEW_VERSION"; [ "$OTA_ONLY" = true ] && default_msg="$default_msg (OTA)"
    [ -n "$COMMIT_MSG" ] || read -rp "${B}Commit message${R} (Enter for '$default_msg'): " COMMIT_MSG
    COMMIT_MSG="${COMMIT_MSG:-$default_msg}"
fi

# Restored from copies, not git, since these usually hold uncommitted work.
BACKUP_DIR="$(mktemp -d)"
cp "$SRC/package.json" "$SRC/app.json" "$SRC/CHANGELOG.md" "$BACKUP_DIR/"

NEW_VERSION="$NEW_VERSION" BUMP_CODE="$BUMP_CODE" PLAY_MAX_CODE="${PLAY_MAX_CODE:-0}" node -e '
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
    app.expo.android.versionCode = Math.max(app.expo.android.versionCode || 0, Number(process.env.PLAY_MAX_CODE)) + 1;
}
fs.writeFileSync("./app.json", JSON.stringify(app, null, 2) + "\n");
'

# Stamped before the build because the app bundles CHANGELOG.md for Settings ->
# What's New, which looks up the installed version's heading.
node scripts/release-changelog.js stamp "$NEW_VERSION" "$(date +%Y-%m-%d)" "$TAG"

if [ "$BUILD" != "$SRC" ]; then
    cp "$BUILD/package.json" "$BUILD/app.json" "$BUILD/CHANGELOG.md" "$SRC/"
fi
ok "Version $CURRENT_VERSION -> ${B}$NEW_VERSION${R}${GRN} (versionCode $(node -p 'require("./app.json").expo.android.versionCode'))"

# Only the GitHub APKs get the Ko-fi link. Play's Payments policy bans it in the
# AAB. Rewriting a source file (rather than an env var) changes its content
# hash, so neither Metro's cache nor Gradle's up-to-date check reuses the
# other build's bundle.
KOFI_URL="https://ko-fi.com/superak0s"
DISTRIBUTION_FILE="$BUILD/src/shared/distribution.ts"
set_kofi_url() {
    sed -i "s#^export const KOFI_URL: string | null = .*;#export const KOFI_URL: string | null = $1;#" "$DISTRIBUTION_FILE"
    grep -q "= $1;" "$DISTRIBUTION_FILE" || die "could not set KOFI_URL in $DISTRIBUTION_FILE"
}
require_release_signed() {
    if ! grep -q 'signingConfigs\.release' "$BUILD/android/app/build.gradle"; then
        die "android/app/build.gradle signs the release build with the debug key. The keystore was not injected. Run: npx local-expo-build keystore import"
    fi
}

aab_is_debug_signed() {
    local aab="$1"
    command -v cygpath >/dev/null && aab="$(cygpath -w "$aab")"
    keytool -printcert -jarfile "$aab" 2>&1 | grep -qiE 'CN=Android Debug|no signer|not signed'
}

bundle_has_kofi() {
    local py archive="$1" rc=0
    py="$(command -v python || command -v python3)" || die "python is needed to check the release bundles."
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
        *) die "could not read $2 from $1." ;;
    esac
}

# [3/8] Install dependencies, verify, prebuild
step 3/8 "Install, verify, prebuild"

info "npm install"
npm install --legacy-peer-deps

# The GitHub workflow itself (npm ci from the lockfile, then lint, a11y lint, typecheck
# and tests on Linux), so the push doesn't turn up a CI failure a local run missed. act
# copies the source tree, uncommitted changes included, minus .gitignore. It runs from
# $SRC because the WSL mirror has no .git.
if [ "$RUN_ACT" = true ]; then
    info "Verifying: CI under act (lint, a11y lint, typecheck, tests)"
    (cd "$SRC" && act push -j check --rm --pull=false -P ubuntu-latest=catthehacker/ubuntu:act-latest)
    ok "CI (act)"
else
    info "Verifying: lint, a11y lint, typecheck$([ "$SKIP_TESTS" = true ] && echo ' (tests skipped by --no-test)' || echo ', tests')"
    npm run lint
    npm run lint:a11y
    npx tsc --noEmit
    [ "$SKIP_TESTS" = true ] || npm test -- --silent
    ok "Checks"
fi

# xlsx is pinned to a SheetJS CDN tarball rather than the npm registry, so
# `npm audit` never sees it and a published security fix goes unnoticed.
XLSX_PINNED="$(grep -o 'xlsx-[0-9.]*[0-9]' "$BUILD/package.json" | head -1)"
XLSX_LATEST="xlsx-$(curl -sfL --max-time 10 https://cdn.sheetjs.com/xlsx-latest/package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).version' 2>/dev/null || true)"
if [ "$XLSX_LATEST" = xlsx- ]; then
    warn "Could not reach the SheetJS CDN. xlsx is pinned to $XLSX_PINNED, check https://cdn.sheetjs.com/ for a newer release."
elif [ "$XLSX_LATEST" != "$XLSX_PINNED" ]; then
    warn "xlsx is pinned to $XLSX_PINNED but SheetJS has published $XLSX_LATEST, which 'npm audit' can't flag."
fi

if [ "$OTA_ONLY" = true ]; then
    step 4/8 "Publishing OTA update to $OTA_UPLOAD"
    ota_args=("--upload=$OTA_UPLOAD")
    [ "$ALLOW_NO_SOURCEMAPS" = true ] && ota_args+=(--no-sourcemaps)
    node scripts/publish-ota.js "${ota_args[@]}"
    # [Unreleased] is stamped now, and the notes must cover only what it holds.
    : > "$SRC/docs/play-release-notes.txt"
else
    maybe_skip_prebuild
    if [ "$DO_CLEAN" = true ]; then
        info "Running full clean prebuild"
        npx expo prebuild --platform android --clean
    else
        info "Running incremental prebuild"
        npx expo prebuild --platform android
    fi
    save_prebuild_stamp

    # Expo's template writes `signingConfig = signingConfigs.debug`, which local-expo-build's
    # release wiring (it matches `signingConfig signingConfigs.debug`) skips, shipping a debug-signed build.
    sed -i 's/signingConfig = signingConfigs\.debug/signingConfig signingConfigs.debug/' "$BUILD/android/app/build.gradle"

    # [4/8] Build the APK via local-expo-build
    # local-expo-build handles: signing config injection, keystore restore after
    # `expo prebuild --clean` wipes android/, and the gradlew assembleRelease call.
    # --no-prebuild : prebuild already ran in [3/8]. Letting it run again with
    #                 --clean wipes android/ and forces a from-scratch native build
    # --no-clean    : otherwise it still prompts whether to clean, even with --no-prebuild
    # --no-bump     : version bump already handled in [2/8]
    # --no-sync     : skip pushing versionCode to EAS (we don't use EAS)
    #
    # One-time setup required before this works (not part of the script):
    #   cd "$BUILD" && npx local-expo-build keystore import /path/to/your.jks
    OUT_DIR="$SRC/release"
    if [ "$BUILD_APK" = true ]; then
        step 4/8 "Building release APK"
        set_kofi_url "\"$KOFI_URL\""
        # Stale per-ABI APKs survive an incremental prebuild and would be released as this version.
        rm -f "$BUILD"/android/app/build/outputs/apk/release/*.apk
        # ORG_GRADLE_PROJECT_* overrides gradle.properties. The AAB call below doesn't see it.
        if [ "$SKIP_32BIT" = true ]; then
            info "arm64-v8a only (pass --32bit for armeabi-v7a too)"
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
            ok "$(basename "$out"): $(du -h "$out" | cut -f1)"
            APK_OUTS+=("$out")
        done

        if [ ${#APK_OUTS[@]} -eq 0 ]; then
            die "no APK found in $APK_DIR"
        fi
        if ! bundle_has_kofi "${APK_OUTS[0]}" assets/index.android.bundle; then
            die "the GitHub APK has no Ko-fi link. It would offer Play tips that can't work outside Play."
        fi
        set_kofi_url null
    else
        info "aab only, skipping the APK"
    fi

    if [ "$BUILD_AAB" = true ]; then
        step 5/8 "Building release AAB"
        npx local-expo-build build android --aab --no-sync --no-bump --no-prebuild --no-clean
        AAB_SRC="$BUILD/android/app/build/outputs/bundle/release/app-release.aab"
        [ -f "$AAB_SRC" ] || die "no AAB found at $AAB_SRC"
        if aab_is_debug_signed "$AAB_SRC"; then
            die "the AAB is debug-signed or unsigned. Play would reject it."
        fi
        if bundle_has_kofi "$AAB_SRC" base/assets/index.android.bundle; then
            die "the AAB still contains the Ko-fi link. Play would reject it under the Payments policy."
        fi
        # "Keep current version" still bumps versionCode, and Play only accepts
        # each code once, so the code is what tells two bundles apart.
        VERSION_CODE=$(node -p 'require("./app.json").expo.android.versionCode')
        AAB_OUT="$OUT_DIR/OwnGains-v$NEW_VERSION-$VERSION_CODE.aab"
        cp "$AAB_SRC" "$AAB_OUT"
        ok "$(basename "$AAB_OUT"): $(du -h "$AAB_OUT" | cut -f1)"
    else
        info "apk only, skipping the AAB"
    fi

    # Old outputs go only once both builds succeeded, so an abort can still restore release/.
    for old in "$OUT_DIR"/*.apk "$OUT_DIR"/*.aab; do
        [ -f "$old" ] || continue
        [[ " ${APK_OUTS[*]} $AAB_OUT " == *" $old "* ]] || { rm -f "$old" && info "Removed old $(basename "$old")"; }
    done

    # publish-ota.js refuses an update whose fingerprint differs, since these installs would ignore it.
    npx expo-updates runtimeversion:resolve --platform android | head -1 \
        | node -p 'JSON.parse(require("fs").readFileSync(0, "utf8")).runtimeVersion' > "$SRC/.ota-runtime-version"
    ok "Runtime version $(cat "$SRC/.ota-runtime-version") recorded for OTA updates"
fi

# Past this point a commit or push may exist, so nothing is reverted any more.
rm -rf "$BACKUP_DIR"
BACKUP_DIR=""

# Not fatal: the build is good, so the release goes on and a failed upload is retried by hand.
PLAY_UPLOADED=false
if [ "$PLAY_UPLOAD" = true ]; then
    step 6/8 "Uploading AAB to Google Play ($PLAY_TRACK)"
    play_aab="$AAB_OUT"
    command -v cygpath >/dev/null && play_aab="$(cygpath -w "$play_aab")"
    if node scripts/play-upload.js "$play_aab" "$PLAY_TRACK"; then
        PLAY_UPLOADED=true
        ok "Uploaded to $PLAY_TRACK"
        # Emptied in $SRC so the release commit carries it, matching the now-empty [Unreleased].
        : > "$SRC/docs/play-release-notes.txt"
        info "Cleared docs/play-release-notes.txt"
    else
        warn "Play upload failed. Retry with: node --env-file=.env scripts/play-upload.js \"$AAB_OUT\" $PLAY_TRACK"
    fi
fi

# [7/8] Push source to GitHub
# Runs only after a successful build, so a bumped-but-broken version never
# lands as a pushed commit. Skipped entirely with --no-push: source tree is
# left as-is (including the local, uncommitted version bump).
# gh in [8/8] needs the git repo too, and the WSL mirror has no .git.
cd "$SRC"
if [ "$SKIP_PUSH" = true ]; then
    step 7/8 "Git: skipped (--no-push)"
else
    step 7/8 "Git commit and push"
    git add .

    if git diff --cached --quiet; then
        info "Nothing to commit, skipping push"
    elif [ "$KEEP_VERSION" = true ]; then
        warn "Version unchanged, committing on top (no amend, so pushed history is never rewritten)"
        git commit -m "Re-release v$NEW_VERSION"
        git push origin main
    else
        git commit -m "$COMMIT_MSG"
        git push origin main
    fi
fi

finish() {
    printf '\n%s=== Done! v%s ===%s\n' "$B$GRN" "$NEW_VERSION" "$R"
    [ -n "$1" ] && printf '  GitHub release  %s\n' "$1"
    for apk in "${APK_OUTS[@]}"; do printf '  APK             %s\n' "$apk"; done
    [ -n "$AAB_OUT" ] && printf '  Play bundle     %s\n' "$AAB_OUT"
    [ "$OTA_ONLY" = true ] && printf '  OTA update      %s (runs on the next cold start)\n' "$OTA_UPLOAD"
    [ "$PLAY_UPLOADED" = true ] && printf '  Google Play     %s track\n' "$PLAY_TRACK"
    printf '  Log             %s\n' "$LOG_FILE"
    printf '  Took            %dm%02ds\n' $((SECONDS / 60)) $((SECONDS % 60))
    exit 0
}

# [8/8] Push to GitHub Releases
if [ "$SKIP_RELEASE" = true ]; then
    step 8/8 "GitHub release: skipped"
    finish ""
fi
step 8/8 "Creating GitHub release $TAG"

NOTES_FILE="$(mktemp)"
if ! node scripts/release-changelog.js notes "$NEW_VERSION" > "$NOTES_FILE" \
    || ! grep -q '[^[:space:]]' "$NOTES_FILE"; then
    echo "Release v$NEW_VERSION built on $TIMESTAMP" > "$NOTES_FILE"
fi
if [ -f docs/release-install.md ]; then
    printf '\n' >> "$NOTES_FILE"
    sed "s/{{VERSION}}/$NEW_VERSION/g" docs/release-install.md >> "$NOTES_FILE"
fi

# Without --target GitHub tags its default branch HEAD, which lacks the bump if the push didn't happen.
GH_ARGS=("$TAG" "${APK_OUTS[@]}" --target "$(git rev-parse HEAD)" --title "OwnGains v$NEW_VERSION" \
    --notes-file "$NOTES_FILE" "${GH_RELEASE_FLAGS[@]}")
if ! gh release create "${GH_ARGS[@]}"; then
    err "GitHub release failed. The build and push are done, so retry only the release with:"
    printf '  gh release create' >&2; printf ' %q' "${GH_ARGS[@]}" >&2; printf '\n' >&2
    exit 1
fi
rm -f "$NOTES_FILE"

finish "$TAG"

# Without this bash reads on past the group and mis-seeks in the file.
exit 0
}
