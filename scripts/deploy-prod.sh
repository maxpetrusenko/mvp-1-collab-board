#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_BRANCH="$(cd "$ROOT_DIR" && git rev-parse --abbrev-ref HEAD)"
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

if [[ "$CURRENT_BRANCH" != "main" ]]; then
  echo "[deploy-prod] Current branch is '$CURRENT_BRANCH'. Switch to 'main' before prod deploy."
  exit 1
fi

if [[ "${ALLOW_PROD_DEPLOY:-0}" != "1" ]]; then
  echo "[deploy-prod] Set ALLOW_PROD_DEPLOY=1 for an explicit production deploy."
  echo "[deploy-prod] Example: ALLOW_PROD_DEPLOY=1 bash scripts/deploy-prod.sh"
  exit 1
fi

echo "[deploy-prod] Deploying hosting + functions to Firebase alias: prod"
(cd "$ROOT_DIR" && npx --yes firebase-tools deploy --project prod "${DEPLOY_ARGS[@]}")
echo "[deploy-prod] Done"
