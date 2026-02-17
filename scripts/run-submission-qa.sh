#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/submission/test-artifacts"
mkdir -p "$OUT_DIR"

TS="$(date +%s)"
SUMMARY_JSON="$OUT_DIR/submission-qa-$TS.json"
LATEST_JSON="$OUT_DIR/latest-submission-qa.json"

required_markdown=(
  "PRESEARCH.md"
  "PRD.md"
  "MVP.md"
  "DECISIONS.md"
  "TASKS.md"
  "SUBMISSION_PACKAGE.md"
  "AI_DEVELOPMENT_LOG.md"
  "AI_COST_ANALYSIS.md"
  "TEST_EVIDENCE.md"
)

required_pdfs=(
  "submission/PRESEARCH.pdf"
  "submission/PRD.pdf"
  "submission/MVP.pdf"
  "submission/DECISIONS.pdf"
  "submission/TASKS.pdf"
  "submission/SUBMISSION_PACKAGE.pdf"
  "submission/AI_DEVELOPMENT_LOG.pdf"
  "submission/AI_COST_ANALYSIS.pdf"
  "submission/TEST_EVIDENCE.pdf"
)

required_artifacts=(
  "submission/test-artifacts/latest-critical-checks.json"
  "submission/test-artifacts/latest-critical-checks.log"
  "submission/test-artifacts/manual-oauth-throttle-reconnect-2026-02-17.md"
  "submission/assets/collabboard-demo-2026-02-17_15-47-06.webm"
  "submission/SOCIAL_POST_DRAFT.md"
  "submission/DEMO_VIDEO.md"
  "submission/SUBMISSION_FREEZE_2026-02-17.md"
  "submission/SUBMISSION_FREEZE_2026-02-17.sha256"
)

collect_file_results() {
  local kind="$1"
  shift

  for file in "$@"; do
    local abs_path="$ROOT_DIR/$file"
    if [[ -f "$abs_path" ]]; then
      printf '{"kind":"%s","path":"%s","exists":true}\n' "$kind" "$file"
    else
      printf '{"kind":"%s","path":"%s","exists":false}\n' "$kind" "$file"
    fi
  done
}

url_check() {
  local name="$1"
  local url="$2"
  local mode="$3"
  local http_code
  http_code="$(curl -L -s -o /dev/null -w "%{http_code}" --max-time 20 "$url" || true)"
  local pass="false"
  if [[ "$mode" == "strict" ]]; then
    if [[ "$http_code" =~ ^[23][0-9][0-9]$ ]]; then
      pass="true"
    fi
  else
    if [[ "$http_code" =~ ^[1-5][0-9][0-9]$ ]]; then
      pass="true"
    fi
  fi
  jq -n --arg name "$name" --arg url "$url" --arg mode "$mode" --arg http "$http_code" --argjson pass "$pass" \
    '{name:$name,url:$url,mode:$mode,httpCode:($http|tonumber),pass:$pass}'
}

file_checks_json="$(
  {
    collect_file_results markdown "${required_markdown[@]}"
    collect_file_results pdf "${required_pdfs[@]}"
    collect_file_results artifact "${required_artifacts[@]}"
  } | jq -s .
)"

missing_count="$(echo "$file_checks_json" | jq '[.[] | select(.exists == false)] | length')"

prod_url="https://mvp-1-collab-board.web.app"
repo_url="https://github.com/maxpetrusenko/mvp-1-collab-board"
demo_url="https://mvp-1-collab-board.web.app/submission/collabboard-demo-2026-02-17_15-47-06.webm"
social_url="https://mvp-1-collab-board.web.app/submission/social-post-draft-2026-02-17.txt"

url_checks_json="$(
  jq -s . <(
    url_check production "$prod_url" strict
  ) <(
    url_check repository "$repo_url" strict
  ) <(
    url_check demo_video "$demo_url" strict
  ) <(
    url_check social_post "$social_url" strict
  )
)"

failed_urls="$(echo "$url_checks_json" | jq '[.[] | select(.pass == false)] | length')"
all_pass="false"
if [[ "$missing_count" == "0" && "$failed_urls" == "0" ]]; then
  all_pass="true"
fi

jq -n \
  --arg timestamp "$TS" \
  --argjson fileChecks "$file_checks_json" \
  --argjson urlChecks "$url_checks_json" \
  --argjson missingCount "$missing_count" \
  --argjson failedUrls "$failed_urls" \
  --argjson pass "$all_pass" \
  '{
    timestamp: ($timestamp | tonumber),
    pass: $pass,
    missingCount: $missingCount,
    failedUrls: $failedUrls,
    fileChecks: $fileChecks,
    urlChecks: $urlChecks
  }' > "$SUMMARY_JSON"

cp "$SUMMARY_JSON" "$LATEST_JSON"
cat "$SUMMARY_JSON"
