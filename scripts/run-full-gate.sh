#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"
FUNCTIONS_DIR="$ROOT_DIR/functions"

PREVIEW_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:4173}"
PLAYWRIGHT_WORKERS="${PLAYWRIGHT_WORKERS:-2}"
PLAYWRIGHT_SHARDS="${PLAYWRIGHT_SHARDS:-2}"
RUN_CRITICAL_CHECKS="${RUN_CRITICAL_CHECKS:-1}"
RUN_BACKEND_PERF="${RUN_BACKEND_PERF:-0}"
ARTIFACT_DIR="$ROOT_DIR/submission/test-artifacts"
PREVIEW_HOST="${PREVIEW_HOST:-127.0.0.1}"
PREVIEW_PORT="${PREVIEW_PORT:-4173}"

mkdir -p "$ARTIFACT_DIR"

log() {
  echo "[full-gate] $*"
}

wait_for_preview() {
  local url="$1"
  local attempts=0
  while (( attempts < 40 )); do
    if curl -sS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done
  return 1
}

port_is_listening() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

pick_preview_port() {
  local preferred_port="$1"
  local port="$preferred_port"
  while port_is_listening "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

preview_pid=""
preview_log="$ARTIFACT_DIR/full-gate-preview.log"

cleanup() {
  if [[ -n "$preview_pid" ]] && kill -0 "$preview_pid" >/dev/null 2>&1; then
    kill "$preview_pid" >/dev/null 2>&1 || true
    wait "$preview_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

log "Phase 1: parallel static checks"
(cd "$APP_DIR" && npm run lint) &
lint_pid=$!
(cd "$APP_DIR" && npm run test:unit --silent) &
unit_pid=$!
(cd "$FUNCTIONS_DIR" && npm test --silent) &
functions_pid=$!

phase1_failed=0
wait "$lint_pid" || phase1_failed=1
wait "$unit_pid" || phase1_failed=1
wait "$functions_pid" || phase1_failed=1

if (( phase1_failed != 0 )); then
  log "Phase 1 failed"
  exit 1
fi

if [[ "$RUN_BACKEND_PERF" == "1" ]]; then
  log "Phase 1b: backend runtime perf harness"
  (cd "$APP_DIR" && npm run test:backend-perf --silent)
fi

log "Phase 2: build app"
(cd "$APP_DIR" && npm run build)

# Parse explicit PLAYWRIGHT_BASE_URL when provided.
if [[ "$PREVIEW_URL" =~ ^https?://([^:/]+):([0-9]+)(/.*)?$ ]]; then
  PREVIEW_HOST="${BASH_REMATCH[1]}"
  PREVIEW_PORT="${BASH_REMATCH[2]}"
fi

if [[ "$PREVIEW_HOST" == "127.0.0.1" || "$PREVIEW_HOST" == "localhost" ]]; then
  resolved_port="$(pick_preview_port "$PREVIEW_PORT")"
  if [[ "$resolved_port" != "$PREVIEW_PORT" ]]; then
    log "Requested preview port $PREVIEW_PORT in use; selected $resolved_port"
  fi
  PREVIEW_PORT="$resolved_port"
  PREVIEW_URL="http://$PREVIEW_HOST:$PREVIEW_PORT"
fi

log "Phase 3: start preview at $PREVIEW_URL"
(cd "$APP_DIR" && npm run preview -- --host "$PREVIEW_HOST" --port "$PREVIEW_PORT" --strictPort >"$preview_log" 2>&1) &
preview_pid=$!

if ! wait_for_preview "$PREVIEW_URL"; then
  log "Preview failed to start. Last output:"
  tail -n 100 "$preview_log" || true
  exit 1
fi

log "Phase 4: playwright gate (workers=$PLAYWRIGHT_WORKERS, shards=$PLAYWRIGHT_SHARDS)"

if (( PLAYWRIGHT_SHARDS <= 1 )); then
  output_dir="$ARTIFACT_DIR/playwright-output"
  rm -rf "$output_dir"
  (
    cd "$APP_DIR"
    PLAYWRIGHT_BASE_URL="$PREVIEW_URL" \
      npx playwright test --workers="$PLAYWRIGHT_WORKERS" --reporter=line --output="$output_dir"
  )
else
  declare -a shard_pids=()
  shard_failed=0

  for shard in $(seq 1 "$PLAYWRIGHT_SHARDS"); do
    shard_log="$ARTIFACT_DIR/full-gate-playwright-shard-${shard}.log"
    output_dir="$ARTIFACT_DIR/playwright-shard-${shard}-output"
    rm -rf "$output_dir"
    (
      cd "$APP_DIR"
      PLAYWRIGHT_BASE_URL="$PREVIEW_URL" \
        npx playwright test --workers="$PLAYWRIGHT_WORKERS" --shard="$shard/$PLAYWRIGHT_SHARDS" --reporter=line --output="$output_dir"
    ) >"$shard_log" 2>&1 &
    shard_pids+=("$!")
  done

  for index in "${!shard_pids[@]}"; do
    shard=$((index + 1))
    pid="${shard_pids[$index]}"
    if ! wait "$pid"; then
      shard_failed=1
      log "Shard $shard failed. Tail:"
      tail -n 120 "$ARTIFACT_DIR/full-gate-playwright-shard-${shard}.log" || true
    fi
  done

  if (( shard_failed != 0 )); then
    log "Playwright gate failed"
    exit 1
  fi

  log "Playwright shards passed. Logs:"
  for shard in $(seq 1 "$PLAYWRIGHT_SHARDS"); do
    log "  - $ARTIFACT_DIR/full-gate-playwright-shard-${shard}.log"
  done
fi

if [[ "$RUN_CRITICAL_CHECKS" == "1" ]]; then
  log "Phase 5: critical backend checks"
  bash "$ROOT_DIR/scripts/run-critical-checks.sh"
fi

log "Full gate passed"
