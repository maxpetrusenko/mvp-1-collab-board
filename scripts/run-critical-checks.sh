#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/app/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  exit 1
fi

source "$ENV_FILE"

if [[ -z "${VITE_FIREBASE_API_KEY:-}" || -z "${VITE_FIREBASE_PROJECT_ID:-}" || -z "${VITE_AI_API_BASE_URL:-}" ]]; then
  echo "Missing required env vars in app/.env" >&2
  exit 1
fi

API_KEY="$VITE_FIREBASE_API_KEY"
PROJECT_ID="$VITE_FIREBASE_PROJECT_ID"
AI_BASE_URL="${VITE_AI_API_BASE_URL%/}"
AI_URL="$AI_BASE_URL/api/ai/command"
SHARE_URL="$AI_BASE_URL/api/boards/share"
TS="$(date +%s)"
BOARD_ID="qa-critical-$TS"
OUT_DIR="$ROOT_DIR/submission/test-artifacts"
mkdir -p "$OUT_DIR"

RAW_LOG="$OUT_DIR/critical-checks-$TS.log"
SUMMARY_JSON="$OUT_DIR/critical-checks-$TS.json"

touch "$RAW_LOG"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*" | tee -a "$RAW_LOG"
}

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

decode_uid_from_token() {
  local id_token="$1"
  python3 - "$id_token" <<'PY'
import base64
import json
import sys

token = sys.argv[1]
parts = token.split('.')
if len(parts) < 2:
    print("")
    sys.exit(0)

payload = parts[1].replace('-', '+').replace('_', '/')
payload += '=' * ((4 - len(payload) % 4) % 4)
decoded = base64.b64decode(payload).decode('utf-8')
data = json.loads(decoded)
print(data.get("user_id") or data.get("sub") or data.get("uid") or "")
PY
}

post_json() {
  local url="$1"
  local bearer="$2"
  local body="$3"
  curl -sS -X POST "$url" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $bearer" \
    --data "$body"
}

create_temp_user_once() {
  local email="$1"
  local password="$2"
  curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"$email\",\"password\":\"$password\",\"returnSecureToken\":true}"
}

sign_in_user() {
  local email="$1"
  local password="$2"
  curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"email\":\"$email\",\"password\":\"$password\",\"returnSecureToken\":true}"
}

create_temp_user() {
  local email="$1"
  local password="$2"
  local max_attempts=8
  local last_response=""

  for attempt in $(seq 1 "$max_attempts"); do
    local response
    response="$(create_temp_user_once "$email" "$password")"
    local token
    token="$(echo "$response" | jq -r '.idToken // empty')"
    if [[ -n "$token" ]]; then
      echo "$response"
      return 0
    fi

    local error_code
    error_code="$(echo "$response" | jq -r '.error.message // empty')"
    last_response="$response"
    if [[ "$error_code" != "TOO_MANY_ATTEMPTS_TRY_LATER" ]]; then
      echo "$response"
      return 1
    fi

    if [[ "$attempt" -lt "$max_attempts" ]]; then
      local backoff=$(( 2 ** (attempt - 1) ))
      if [[ "$backoff" -gt 15 ]]; then
        backoff=15
      fi
      sleep "$backoff"
    fi
  done

  echo "$last_response"
  return 1
}

delete_temp_user() {
  local id_token="$1"
  curl -sS -X POST "https://identitytoolkit.googleapis.com/v1/accounts:delete?key=$API_KEY" \
    -H "Content-Type: application/json" \
    --data "{\"idToken\":\"$id_token\"}" >/dev/null
}

PASSWORD="QATest!${TS}!Aa1"
USER_COUNT=5
declare -a ID_TOKENS=()
declare -a USER_EMAILS=()
declare -a TEMP_ID_TOKENS=()

cleanup_temp_users() {
  for tok in "${TEMP_ID_TOKENS[@]-}"; do
    if [[ -n "$tok" ]]; then
      delete_temp_user "$tok" || true
    fi
  done
}

trap cleanup_temp_users EXIT

REUSABLE_PASSWORD="${E2E_PASSWORD:-${QA_PASSWORD:-${PW:-}}}"
declare -a CANDIDATE_EMAILS=(
  "${E2E_EMAIL:-}"
  "${QA_EMAIL:-}"
  "${EMAIL:-}"
  "${EMAIL1:-}"
  "${EMAIL2:-}"
  "${EMAIL3:-}"
  "${EMAIL4:-}"
)

if [[ -n "$REUSABLE_PASSWORD" ]]; then
  log "Signing in reusable QA accounts for critical checks"
  seen_emails="|"
  for candidate_email in "${CANDIDATE_EMAILS[@]}"; do
    if [[ -z "$candidate_email" ]]; then
      continue
    fi
    if [[ "$seen_emails" == *"|$candidate_email|"* ]]; then
      continue
    fi
    seen_emails="${seen_emails}${candidate_email}|"
    USER_RESP="$(sign_in_user "$candidate_email" "$REUSABLE_PASSWORD" || true)"
    USER_TOKEN="$(echo "$USER_RESP" | jq -r '.idToken // empty')"
    if [[ -n "$USER_TOKEN" ]]; then
      ID_TOKENS+=("$USER_TOKEN")
      USER_EMAILS+=("$candidate_email")
    fi
    if [[ "${#ID_TOKENS[@]}" -ge "$USER_COUNT" ]]; then
      break
    fi
  done
fi

if [[ "${#ID_TOKENS[@]}" -eq 0 ]]; then
  log "No reusable QA account token available; creating temporary owner user"
  EMAIL="qa.owner.$TS@example.com"
  USER_RESP="$(create_temp_user "$EMAIL" "$PASSWORD" || true)"
  USER_TOKEN="$(echo "$USER_RESP" | jq -r '.idToken // empty')"
  if [[ -z "$USER_TOKEN" ]]; then
    echo "Failed to acquire owner token for critical checks" >&2
    echo "$USER_RESP" >&2
    exit 1
  fi
  ID_TOKENS+=("$USER_TOKEN")
  USER_EMAILS+=("$EMAIL")
  TEMP_ID_TOKENS+=("$USER_TOKEN")
fi

while [[ "${#ID_TOKENS[@]}" -lt "$USER_COUNT" ]]; do
  SLOT=$(( ${#ID_TOKENS[@]} + 1 ))
  OWNER_EMAIL="${USER_EMAILS[0]}"
  USER_TOKEN=""

  if [[ -n "$REUSABLE_PASSWORD" && -n "$OWNER_EMAIL" ]]; then
    USER_RESP="$(sign_in_user "$OWNER_EMAIL" "$REUSABLE_PASSWORD" || true)"
    USER_TOKEN="$(echo "$USER_RESP" | jq -r '.idToken // empty')"
    if [[ -n "$USER_TOKEN" ]]; then
      ID_TOKENS+=("$USER_TOKEN")
      USER_EMAILS+=("$OWNER_EMAIL")
      continue
    fi
  fi

  EMAIL="qa.user${SLOT}.$TS@example.com"
  USER_RESP="$(create_temp_user "$EMAIL" "$PASSWORD" || true)"
  USER_TOKEN="$(echo "$USER_RESP" | jq -r '.idToken // empty')"
  if [[ -n "$USER_TOKEN" ]]; then
    ID_TOKENS+=("$USER_TOKEN")
    USER_EMAILS+=("$EMAIL")
    TEMP_ID_TOKENS+=("$USER_TOKEN")
    continue
  fi

  log "Temp signup unavailable for slot $SLOT; reusing owner token"
  ID_TOKENS+=("${ID_TOKENS[0]}")
  USER_EMAILS+=("${USER_EMAILS[0]}")
done

log "Using ${#ID_TOKENS[@]} authenticated sessions for burst checks"

ID_TOKEN_1="${ID_TOKENS[0]}"
ID_TOKEN_2="${ID_TOKENS[1]}"

declare -a USER_IDS=()
for token in "${ID_TOKENS[@]}"; do
  USER_IDS+=("$(decode_uid_from_token "$token")")
done

OWNER_UID="${USER_IDS[0]}"
declare -a SHARED_UIDS=()
for uid in "${USER_IDS[@]}"; do
  if [[ -n "$uid" && "$uid" != "$OWNER_UID" ]]; then
    SHARED_UIDS+=("$uid")
  fi
done

SHARED_WITH_VALUES='[]'
SHARED_ROLES_MAP='{}'
if [[ "${#SHARED_UIDS[@]}" -gt 0 ]]; then
  SHARED_WITH_VALUES="$(
    printf '%s\n' "${SHARED_UIDS[@]}" | jq -R . | jq -sc 'map(select(length > 0) | {stringValue:.})'
  )"
  SHARED_ROLES_MAP="$(
    printf '%s\n' "${SHARED_UIDS[@]}" | jq -R . | jq -sc 'map(select(length > 0)) | unique | map({key:.,value:"edit"}) | from_entries'
  )"
fi

NOW_MS="$(now_ms)"
BOARD_DOC_BODY="$(jq -n \
  --arg boardId "$BOARD_ID" \
  --arg ownerId "$OWNER_UID" \
  --arg nowMs "$NOW_MS" \
  --argjson sharedWith "$SHARED_WITH_VALUES" \
  --argjson sharedRoles "$SHARED_ROLES_MAP" \
  '{
    fields: {
      id: { stringValue: $boardId },
      name: { stringValue: "Critical Checks Board" },
      ownerId: { stringValue: $ownerId },
      sharedWith: { arrayValue: { values: $sharedWith } },
      sharedRoles: { mapValue: { fields: ($sharedRoles | with_entries(.value = { stringValue: .value })) } },
      createdAt: { integerValue: $nowMs },
      updatedAt: { integerValue: $nowMs }
    }
  }'
)"

BOARD_CREATE_RESP="$(curl -sS -X POST \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/boards?documentId=$BOARD_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN_1" \
  --data "$BOARD_DOC_BODY")"
BOARD_CREATE_NAME="$(echo "$BOARD_CREATE_RESP" | jq -r '.name // empty')"
if [[ -z "$BOARD_CREATE_NAME" ]]; then
  echo "Failed to pre-create board metadata for critical checks" >&2
  echo "$BOARD_CREATE_RESP" >&2
  exit 1
fi

CID_1="cmd-a-$TS"
CID_2="cmd-b-$TS"
CMD_1="add yellow sticky note saying alpha-$TS"
CMD_2="create a blue rectangle at position 320,220"

log "Running simultaneous AI commands from two users"

BODY_1="$(jq -n --arg b "$BOARD_ID" --arg c "$CMD_1" --arg i "$CID_1" --arg n "QA User 1" '{boardId:$b,command:$c,clientCommandId:$i,userDisplayName:$n}')"
BODY_2="$(jq -n --arg b "$BOARD_ID" --arg c "$CMD_2" --arg i "$CID_2" --arg n "QA User 2" '{boardId:$b,command:$c,clientCommandId:$i,userDisplayName:$n}')"

START_MS="$(now_ms)"
(
  post_json "$AI_URL" "$ID_TOKEN_1" "$BODY_1" >"$OUT_DIR/resp-$CID_1.json"
) &
PID1=$!
(
  post_json "$AI_URL" "$ID_TOKEN_2" "$BODY_2" >"$OUT_DIR/resp-$CID_2.json"
) &
PID2=$!
wait "$PID1"
wait "$PID2"
END_MS="$(now_ms)"
ELAPSED_MS=$((END_MS - START_MS))

R1="$(cat "$OUT_DIR/resp-$CID_1.json")"
R2="$(cat "$OUT_DIR/resp-$CID_2.json")"

S1="$(echo "$R1" | jq -r '.status // "unknown"')"
S2="$(echo "$R2" | jq -r '.status // "unknown"')"
L1="$(echo "$R1" | jq -r '.result.level // "info"')"
L2="$(echo "$R2" | jq -r '.result.level // "info"')"
T1="$(echo "$R1" | jq -r '(.result.executedTools // []) | length')"
T2="$(echo "$R2" | jq -r '(.result.executedTools // []) | length')"

log "Simultaneous run complete in ${ELAPSED_MS}ms (statuses: $S1/$S2, levels: $L1/$L2, tool counts: $T1/$T2)"

log "Running 5-user concurrent AI command burst"
declare -a BURST_PIDS=()
declare -a BURST_CIDS=()
declare -a BURST_STATUSES=()
declare -a BURST_LEVELS=()
declare -a BURST_TOOL_COUNTS=()

for i in $(seq 1 "$USER_COUNT"); do
  IDX=$((i - 1))
  CID_BURST="cmd-burst-$TS-$i"
  CMD_BURST="add green sticky note saying burst-$i-$TS"
  BODY_BURST="$(jq -n --arg b "$BOARD_ID" --arg c "$CMD_BURST" --arg i "$CID_BURST" --arg n "QA User $i" '{boardId:$b,command:$c,clientCommandId:$i,userDisplayName:$n}')"
  BURST_CIDS+=("$CID_BURST")
  (
    post_json "$AI_URL" "${ID_TOKENS[$IDX]}" "$BODY_BURST" >"$OUT_DIR/resp-$CID_BURST.json"
  ) &
  BURST_PIDS+=("$!")
done

for pid in "${BURST_PIDS[@]}"; do
  wait "$pid"
done

PASS_FIVE_USERS="true"
for cid in "${BURST_CIDS[@]}"; do
  status="$(jq -r '.status // "unknown"' "$OUT_DIR/resp-$cid.json")"
  level="$(jq -r '.result.level // "info"' "$OUT_DIR/resp-$cid.json")"
  tool_count="$(jq -r '(.result.executedTools // []) | length' "$OUT_DIR/resp-$cid.json")"
  BURST_STATUSES+=("$status")
  BURST_LEVELS+=("$level")
  BURST_TOOL_COUNTS+=("$tool_count")
  if [[ "$status" != "success" || "$level" == "warning" || "$tool_count" -le 0 ]]; then
    PASS_FIVE_USERS="false"
  fi
done

log "Validating idempotency with duplicate clientCommandId"
IDEMP_RESP="$(post_json "$AI_URL" "$ID_TOKEN_1" "$BODY_1")"
IDEMP_OK="$(echo "$IDEMP_RESP" | jq -r '.idempotent // false')"

THROTTLE_CID="cmd-throttle-$TS"
THROTTLE_BODY="$(jq -n --arg b "$BOARD_ID" --arg c "create a SWOT template" --arg i "$THROTTLE_CID" --arg n "QA User 1" '{boardId:$b,command:$c,clientCommandId:$i,userDisplayName:$n}')"

log "Running throttled/disconnect retry simulation"
set +e
curl -sS -X POST "$AI_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ID_TOKEN_1" \
  --limit-rate 128 \
  --max-time 0.2 \
  --data "$THROTTLE_BODY" >"$OUT_DIR/resp-$THROTTLE_CID-timeout.json"
THROTTLE_EXIT="$?"
set -e

sleep 1
THROTTLE_RETRY_RESP="$(post_json "$AI_URL" "$ID_TOKEN_1" "$THROTTLE_BODY")"
THROTTLE_RETRY_STATUS="$(echo "$THROTTLE_RETRY_RESP" | jq -r '.status // "unknown"')"
THROTTLE_RETRY_IDEMP="$(echo "$THROTTLE_RETRY_RESP" | jq -r '.idempotent // false')"

log "Querying Firestore aiCommands for queue evidence"
CMD_DOCS_RAW="$(curl -sS -X GET \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/boards/$BOARD_ID/aiCommands" \
  -H "Authorization: Bearer $ID_TOKEN_1")"

QUEUE_INFO="$(echo "$CMD_DOCS_RAW" | jq -c '
  (.documents // []) | map({
    name: (.name | split("/")[-1]),
    status: (.fields.status.stringValue // "unknown"),
    queueSequence: ((.fields.queueSequence.integerValue // "0") | tonumber),
    startedAt: ((.fields.startedAt.integerValue // "0") | tonumber),
    completedAt: ((.fields.completedAt.integerValue // "0") | tonumber)
  }) | sort_by(.queueSequence, .startedAt)
')"

log "Querying Firestore objects for mutation evidence"
OBJECT_DOCS_RAW="$(curl -sS -X GET \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/boards/$BOARD_ID/objects" \
  -H "Authorization: Bearer $ID_TOKEN_1")"

OBJECT_EVIDENCE="$(echo "$OBJECT_DOCS_RAW" | jq -c --arg ts "$TS" '
  (.documents // []) as $docs |
  {
    totalObjects: ($docs | length),
    alphaStickyCount: (
      $docs
      | map(.fields)
      | map(select((.type.stringValue // "") == "stickyNote"))
      | map(select((.text.stringValue // "") | contains("alpha-" + $ts)))
      | length
    ),
    burstStickyCount: (
      $docs
      | map(.fields)
      | map(select((.type.stringValue // "") == "stickyNote"))
      | map(select((.text.stringValue // "") | contains("burst-")))
      | length
    )
  }
')"

PASS_SIMULTANEOUS="false"
if [[ "$S1" == "success" && "$S2" == "success" && "$L1" != "warning" && "$L2" != "warning" && "$T1" -gt 0 && "$T2" -gt 0 ]]; then
  PASS_SIMULTANEOUS="true"
fi

PASS_IDEMPOTENT="false"
if [[ "$IDEMP_OK" == "true" ]]; then
  PASS_IDEMPOTENT="true"
fi

PASS_THROTTLE_RETRY="false"
if [[ "$THROTTLE_EXIT" != "0" && ( "$THROTTLE_RETRY_STATUS" == "success" || "$THROTTLE_RETRY_IDEMP" == "true" ) ]]; then
  PASS_THROTTLE_RETRY="true"
fi

PASS_MUTATION_OBJECTS="false"
if [[ "$(echo "$OBJECT_EVIDENCE" | jq -r '.totalObjects // 0')" -ge 2 && \
      "$(echo "$OBJECT_EVIDENCE" | jq -r '.alphaStickyCount // 0')" -ge 1 && \
      "$(echo "$OBJECT_EVIDENCE" | jq -r '.burstStickyCount // 0')" -ge 1 ]]; then
  PASS_MUTATION_OBJECTS="true"
fi

OVERALL_PASS="true"
if [[ "$PASS_SIMULTANEOUS" != "true" || \
      "$PASS_FIVE_USERS" != "true" || \
      "$PASS_IDEMPOTENT" != "true" || \
      "$PASS_THROTTLE_RETRY" != "true" || \
      "$PASS_MUTATION_OBJECTS" != "true" ]]; then
  OVERALL_PASS="false"
fi

BURST_STATUSES_JSON="$(printf '%s\n' "${BURST_STATUSES[@]}" | jq -R . | jq -sc .)"
BURST_LEVELS_JSON="$(printf '%s\n' "${BURST_LEVELS[@]}" | jq -R . | jq -sc .)"
BURST_TOOL_COUNTS_JSON="$(printf '%s\n' "${BURST_TOOL_COUNTS[@]}" | jq -R 'tonumber' | jq -sc .)"

jq -n \
  --arg timestamp "$TS" \
  --arg boardId "$BOARD_ID" \
  --arg elapsedMs "$ELAPSED_MS" \
  --arg status1 "$S1" \
  --arg status2 "$S2" \
  --arg level1 "$L1" \
  --arg level2 "$L2" \
  --arg tools1 "$T1" \
  --arg tools2 "$T2" \
  --arg passFiveUsers "$PASS_FIVE_USERS" \
  --arg idempotent "$IDEMP_OK" \
  --arg throttleExit "$THROTTLE_EXIT" \
  --arg throttleRetryStatus "$THROTTLE_RETRY_STATUS" \
  --arg throttleRetryIdempotent "$THROTTLE_RETRY_IDEMP" \
  --argjson burstStatuses "$BURST_STATUSES_JSON" \
  --argjson burstLevels "$BURST_LEVELS_JSON" \
  --argjson burstToolCounts "$BURST_TOOL_COUNTS_JSON" \
  --argjson queue "$QUEUE_INFO" \
  --argjson objectEvidence "$OBJECT_EVIDENCE" \
  --arg passSimultaneous "$PASS_SIMULTANEOUS" \
  --arg passIdempotent "$PASS_IDEMPOTENT" \
  --arg passThrottleRetry "$PASS_THROTTLE_RETRY" \
  --arg passMutationObjects "$PASS_MUTATION_OBJECTS" \
  --arg overallPass "$OVERALL_PASS" \
  '{
    timestamp: ($timestamp | tonumber),
    boardId: $boardId,
    checks: {
      simultaneousAiCommands: {
        pass: ($passSimultaneous == "true"),
        statuses: [$status1, $status2],
        levels: [$level1, $level2],
        toolCounts: [($tools1 | tonumber), ($tools2 | tonumber)],
        elapsedMs: ($elapsedMs|tonumber)
      },
      fiveAuthUsersBurst: { pass: ($passFiveUsers == "true"), statuses: $burstStatuses, levels: $burstLevels, toolCounts: $burstToolCounts },
      idempotency: { pass: ($passIdempotent == "true"), duplicateResponseIdempotent: ($idempotent == "true") },
      throttleDisconnectRetry: {
        pass: ($passThrottleRetry == "true"),
        firstRequestCurlExit: ($throttleExit | tonumber),
        retryStatus: $throttleRetryStatus,
        retryIdempotent: ($throttleRetryIdempotent == "true")
      },
      mutationObjectEvidence: { pass: ($passMutationObjects == "true"), evidence: $objectEvidence }
    },
    overallPass: ($overallPass == "true"),
    queueEvidence: $queue
  }' >"$SUMMARY_JSON"

cp "$SUMMARY_JSON" "$OUT_DIR/latest-critical-checks.json"
cp "$RAW_LOG" "$OUT_DIR/latest-critical-checks.log"

if [[ "$OVERALL_PASS" == "true" ]]; then
  log "Done. Summary: $SUMMARY_JSON"
else
  log "Critical checks failed. Summary: $SUMMARY_JSON"
fi
cat "$SUMMARY_JSON"

if [[ "$OVERALL_PASS" != "true" ]]; then
  exit 1
fi
