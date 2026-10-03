#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -z "${SONAR_TOKEN:-}" ]; then
  echo "SONAR_TOKEN is not set" >&2
  exit 1
fi

npx @sonar/scan \
  -Dsonar.host.url=https://sonarqube.superak0s.com \
  -Dsonar.token="$SONAR_TOKEN" \
  -Dsonar.projectKey=owngains-app \
  -Dsonar.analysisCache.enabled=false
