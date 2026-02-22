#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_ARGS=("$@")
HAS_ONLY_FLAG=0

for arg in "${DEPLOY_ARGS[@]}"; do
  if [[ "$arg" == "--only" || "$arg" == --only=* ]]; then
    HAS_ONLY_FLAG=1
    break
  fi
done

if [[ "$HAS_ONLY_FLAG" == "0" ]]; then
  DEPLOY_ARGS=(--only hosting,functions "${DEPLOY_ARGS[@]}")
fi

echo "[deploy-dev] Deploying hosting + functions to Firebase alias: dev"
(cd "$ROOT_DIR" && npx --yes firebase-tools deploy --project dev "${DEPLOY_ARGS[@]}")
echo "[deploy-dev] Done"
