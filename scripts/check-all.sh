#!/usr/bin/env bash
# One command to check that neither the app nor the server is broken, and that
# they still agree with each other. Runs every step, then prints a summary.
# Exits 1 if any required step failed.
#
#   scripts/check-all.sh [--app-only | --server-only] [--quick] [--no-db] [--strict]
#
#   --app-only     skip the server and the cross-repo steps
#   --server-only  skip the app and the cross-repo steps
#   --quick        lint + typecheck + API audit only (no jest, vitest or smoke)
#   --no-db        skip the steps that need MySQL (server tests, live smoke test)
#   --strict       make the API audit fail the run instead of only reporting
#
# The server is expected at ../OwnGains-Server (override with OWNGAINS_SERVER_DIR)
# and its .env must point at a MySQL the tests may create databases on. The
# smoke test boots the built server against a scratch database named
# $SMOKE_DB_NAME (default owngains_smoke), which it provisions itself.

set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVER_DIR="${OWNGAINS_SERVER_DIR:-$APP_DIR/../OwnGains-Server}"
SMOKE_DB_NAME="${SMOKE_DB_NAME:-owngains_smoke}"

run_app=1 run_server=1 run_cross=1 quick=0 use_db=1 strict=0
for arg in "$@"; do
  case "$arg" in
    --app-only) run_server=0 run_cross=0 ;;
    --server-only) run_app=0 run_cross=0 ;;
    --quick) quick=1 ;;
    --no-db) use_db=0 ;;
    --strict) strict=1 ;;
    -h|--help) sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg (see --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  RED=$'\e[31m' GREEN=$'\e[32m' YELLOW=$'\e[33m' BOLD=$'\e[1m' DIM=$'\e[2m' RESET=$'\e[0m'
else
  RED='' GREEN='' YELLOW='' BOLD='' DIM='' RESET=''
fi

PYTHON="$(command -v python3 || command -v python || true)"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/owngains-check.XXXXXX")"
SERVER_PID=""
results=()
failed=0
last_status=0

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# step <name> <required|advisory> <dir> <command...>
step() {
  local name="$1" kind="$2" dir="$3"
  shift 3
  local log="$LOG_DIR/$(echo "$name" | tr -c 'A-Za-z0-9' '_').log"
  printf '%s▶ %s%s\n' "$BOLD" "$name" "$RESET"
  local start=$SECONDS
  (cd "$dir" && "$@") >"$log" 2>&1
  local status=$? took=$((SECONDS - start))
  last_status=$status
  if [ $status -eq 0 ]; then
    printf '  %s✓ passed%s %s(%ss)%s\n' "$GREEN" "$RESET" "$DIM" "$took" "$RESET"
    results+=("${GREEN}✓${RESET} $name")
  else
    if [ "$kind" = required ]; then
      tail -n 40 "$log" | sed 's/^/    /'
      printf '  %s✗ failed%s (%ss), full log: %s\n' "$RED" "$RESET" "$took" "$log"
      results+=("${RED}✗${RESET} $name")
      failed=1
    else
      { grep -E '^==' "$log" || tail -n 20 "$log"; } | sed 's/^/    /'
      printf '  %s! findings%s (%ss, advisory), full log: %s\n' "$YELLOW" "$RESET" "$took" "$log"
      results+=("${YELLOW}!${RESET} $name ${DIM}(advisory)${RESET}")
    fi
  fi
}

skip() {
  printf '%s▶ %s%s\n  %s- skipped:%s %s\n' "$BOLD" "$1" "$RESET" "$YELLOW" "$RESET" "$2"
  results+=("${YELLOW}-${RESET} $1 ${DIM}(skipped: $2)${RESET}")
}

missing_deps() {
  [ -d "$1/node_modules" ] && return 1
  printf '%s✗ %s has no node_modules. Run: %s%s\n' "$RED" "$1" "$2" "$RESET"
  results+=("${RED}✗${RESET} dependencies installed in $(basename "$1")")
  failed=1
  return 0
}

free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close()})'
}

min_server_version() {
  sed -n 's/^export const MIN_SERVER_VERSION = "\([^"]*\)".*/\1/p' \
    "$APP_DIR/src/shared/services/serverVersion.ts"
}

smoke_test() {
  local port log="$LOG_DIR/server.log" min
  port="$(free_port)" || return 1
  PORT="$port" DB_NAME="$SMOKE_DB_NAME" NODE_ENV=production MDNS_ENABLED=false \
    node --env-file-if-exists=.env dist/server.js >"$log" 2>&1 &
  SERVER_PID=$!
  local up=0
  for _ in $(seq 1 60); do
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "server exited during boot:"; tail -n 30 "$log"; return 1
    fi
    if node -e "fetch('http://127.0.0.1:$port/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"; then
      up=1; break
    fi
    sleep 1
  done
  if [ $up -eq 0 ]; then
    echo "server did not answer /healthz within 60s:"; tail -n 30 "$log"; return 1
  fi
  min="$(min_server_version)"
  node scripts/smoke.mjs "http://127.0.0.1:$port" ${min:+--min-version "$min"}
  local status=$?
  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  SERVER_PID=""
  return $status
}

printf '%sOwnGains check-all%s  %slogs: %s%s\n\n' "$BOLD" "$RESET" "$DIM" "$LOG_DIR" "$RESET"

if [ $run_server -eq 1 ]; then
  if [ ! -d "$SERVER_DIR" ]; then
    skip "server" "no checkout at $SERVER_DIR (set OWNGAINS_SERVER_DIR)"
    run_cross=0
  elif ! missing_deps "$SERVER_DIR" "pnpm install"; then
    step "server: typecheck" required "$SERVER_DIR" pnpm exec tsc --noEmit
    step "server: build" required "$SERVER_DIR" pnpm build
    built=$((last_status == 0))
    if [ $quick -eq 1 ]; then
      skip "server: tests" "--quick"
      skip "server: live smoke test" "--quick"
    elif [ $use_db -eq 0 ]; then
      skip "server: tests" "--no-db"
      skip "server: live smoke test" "--no-db"
    elif [ ! -f "$SERVER_DIR/.env" ]; then
      printf '%s✗ %s/.env is missing. The server tests and smoke test need MySQL credentials (or pass --no-db)%s\n' \
        "$RED" "$SERVER_DIR" "$RESET"
      results+=("${RED}✗${RESET} server .env present")
      failed=1
    else
      step "server: tests (vitest)" required "$SERVER_DIR" pnpm test
      if [ $built -eq 1 ]; then
        step "server: live smoke test" required "$SERVER_DIR" smoke_test
      else
        skip "server: live smoke test" "build failed"
      fi
    fi
  fi
  echo
fi

if [ $run_app -eq 1 ]; then
  if ! missing_deps "$APP_DIR" "npm install --legacy-peer-deps"; then
    step "app: lint" required "$APP_DIR" npm run --silent lint
    if [ -n "$PYTHON" ]; then
      step "app: a11y labels" required "$APP_DIR" "$PYTHON" scripts/find-unlabeled-icons.py
    else
      skip "app: a11y labels" "no python on PATH"
    fi
    step "app: typecheck" required "$APP_DIR" npx tsc --noEmit
    if [ $quick -eq 1 ]; then
      skip "app: tests" "--quick"
    else
      step "app: tests (jest)" required "$APP_DIR" npx jest --ci --silent
    fi
  fi
  echo
fi

if [ $run_cross -eq 1 ]; then
  if [ -z "$PYTHON" ]; then
    skip "app ↔ server API audit" "no python on PATH"
  else
    step "app ↔ server API audit" "$([ $strict -eq 1 ] && echo required || echo advisory)" \
      "$APP_DIR" "$PYTHON" scripts/api_audit.py
  fi
  echo
fi

printf '%sSummary%s\n' "$BOLD" "$RESET"
for r in "${results[@]}"; do printf '  %s\n' "$r"; done
echo
if [ $failed -eq 0 ]; then
  printf '%sAll required checks passed.%s\n' "$GREEN" "$RESET"
else
  printf '%sSome checks failed, logs in %s%s\n' "$RED" "$LOG_DIR" "$RESET"
fi
exit $failed
