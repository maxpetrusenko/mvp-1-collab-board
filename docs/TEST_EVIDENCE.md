# TEST_EVIDENCE.md

Date: 2026-02-20
Project: CollabBoard MVP-1

## Summary
This document captures the latest reproducible test evidence available from this repository and execution environment.

## 1) Static + Unit + Functions Validation
- `app` lint: pass (`cd app && npm run lint`)
- `app` unit tests: pass (`cd app && npm run test:unit --silent`)
  - latest observed summary: `106/106` pass on 2026-02-20
- `functions` tests: pass (`cd functions && npm test --silent`)

These checks are also part of `scripts/run-full-gate.sh` Phase 1 and were observed passing on 2026-02-20.

## 2) Build Validation
- `app` production build: pass (`cd app && npm run build`)
- Vite build artifacts generated successfully.

## 3) Submission QA Artifact (Fresh)
- Command: `bash scripts/run-submission-qa.sh`
- Timestamp: `1771617563` (`2026-02-20T19:59:23Z`)
- Result: `pass=true`, `missingCount=0`, `failedUrls=0`
- Artifact: `submission/test-artifacts/latest-submission-qa.json`

## 4) Critical Backend Checks Artifact (Fresh but Partial)
- Command: `bash scripts/run-critical-checks.sh`
- Latest fully written artifact in repo: `submission/test-artifacts/latest-critical-checks.json`
- Most recent successful full write prior to script hardening captured:
  - timestamp `1771617563` (`2026-02-20T19:59:23Z`)
  - simultaneous AI commands: pass
  - idempotency: pass
  - throttle/disconnect retry: pass
  - five-user burst: unstable in latest runs due auth/rate-limit/access setup

## 5) Runtime Backend NFR Evidence (No Playwright)
- Command: `cd app && npm run test:backend-perf --silent`
- Result in this environment: test harness executes and emits measured runtime data.
- Artifact: `submission/test-artifacts/latest-backend-performance.json`
- Latest observed payload (`2026-02-20T21:02:23.599Z`) includes:
  - `cursorSync`: `avgMs=181.75`, `maxMs=421`, `targetMs=50`, `criticalMs=100`, `targetMet=false`, `score=1`
  - `presence5Users`: `users=5`, `propagationMs=157`, `elapsedMs=601`, `targetMs=600`, `criticalMs=2500`, `targetMet=true`
  - auth source used by harness: `env-email-slot+shared-password:0-ok/4-failed+credential-file:*`
- Added script for anon fallback probing:
  - `cd app && npm run test:backend-perf:anon --silent`
  - In this project, anon creation returns `ADMIN_ONLY_OPERATION`.
- Added strict target-enforcement mode:
  - `cd app && npm run test:backend-perf:strict --silent`
  - Current strict outcome: fails on cursor SLA (`181.75ms` average vs `50ms` target), which is expected and evidence-backed.

## 6) End-to-End Playwright Evidence and Limitation
- Full gate command: `bash scripts/run-full-gate.sh`
- Current environment limitation (2026-02-20): Chromium launch fails during Playwright startup with:
  - `bootstrap_check_in ... MachPortRendezvousServer ... Permission denied (1100)`
- Impact:
  - Full Playwright pass/fail cannot be concluded reliably from this sandbox run.
  - Failures observed are environment-level browser launch failures, not deterministic app assertions.

## 7) FR-22 Board Sharing Verification Status
- Targeted FR-22 deny-path spec currently cannot be verified in this sandbox due the same Chromium launch permission failure.
- Test file remains: `app/e2e/requirements-board-sharing.spec.ts`
- Latest code hardening includes:
  - increased `beforeAll` timeout
  - sequential owner/collaborator provisioning (avoids parallel temp-user creation spikes)
  - reusable-account slot support in auth helper (`primary`/`secondary` with temp fallback)

## 8) Recommended Next Evidence Run (Outside This Sandbox Constraint)
1. Run `PLAYWRIGHT_SHARDS=1 PLAYWRIGHT_WORKERS=1 bash scripts/run-full-gate.sh` in an environment where Chromium can launch.
2. Run `cd app && npm run test:backend-perf --silent` with valid `TEST_USER_A..E_*` credentials/tokens so runtime NFR latency values are measured (not skipped).
3. Run `bash scripts/run-critical-checks.sh` after Firebase Auth rate limits clear.
4. Archive resulting artifacts under `submission/test-artifacts/` and refresh `latest-*.json` pointers.
