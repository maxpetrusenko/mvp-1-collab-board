#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"

echo "[dev-gate] Running fast local checks (no test suites)"
(cd "$APP_DIR" && npm run lint)
(cd "$APP_DIR" && npm run build)
echo "[dev-gate] Done"
