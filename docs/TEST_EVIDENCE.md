# TEST_EVIDENCE.md

Date: 2026-02-21
Project: CollabBoard MVP-1

## Summary
This document captures the latest reproducible test evidence available from this repository and execution environment.

## 0) AI Command Latency Indicators (Compound Tools)

Date: 2026-02-22  
Environment: production function probe (`https://api-qaotnmz34a-uc.a.run.app`)

| Command | Tool-path evidence | Recent runtime snapshot | PRD target status |
|---|---|---|---|
| `create one sticky note hello` | LLM tool-call create path | ~2.25s command runtime | Above `<2s` target |
| `create 6 boxes with message -` | `executedTools` count observed: 8 (6x `createStickyNote` + template tool entries) | ~3.10s to ~3.20s command runtime | Above `<2s` target |
| `Generate a Business Model Canvas ...` | `executedTools` count observed: 11 (9x `createStickyNote` + canvas tool entries) | ~3.20s to ~3.35s command runtime | Above `<2s` target |

Indicator note:
- Repository docs currently contain explicit `<2s` target references.
- Repository docs currently contain current probe snapshots near low-3s for compound commands.
- Repository docs currently contain no archived benchmark artifact proving historical `~1s` single-note and `~2s` multi-item runtime.

## 1) Static + Unit + Functions Validation
- `app` lint: pass (`cd app && npm run lint`)
- `app` unit tests: pass (`cd app && npm run test:unit --silent`)
  - latest observed summary: `109/109` pass on 2026-02-21
- `functions` tests: pass (`cd functions && npm test --silent`)

These checks are also part of `scripts/run-full-gate.sh` Phase 1 and were observed passing on 2026-02-21.

## 2) Build Validation
- `app` production build: pass (`cd app && npm run build`)
- Vite build artifacts generated successfully.

## 3) Submission QA Artifact (Fresh)
- Command: `bash scripts/run-submission-qa.sh`
- Timestamp: `1771705029` (`2026-02-21T15:17:09Z`)
- Result: `pass=true`, `missingCount=0`, `failedUrls=0`
- Artifact: `submission/test-artifacts/latest-submission-qa.json`

## 4) Critical Backend Checks Artifact (Fresh but Partial)
- Command: `bash scripts/run-critical-checks.sh`
- Latest fully written artifact in repo: `submission/test-artifacts/latest-critical-checks.json`
- Most recent successful full write captured:
  - timestamp `1771705049` (`2026-02-21T15:17:29Z`)
  - simultaneous AI commands: pass
  - idempotency: pass
  - throttle/disconnect retry: pass
  - five-user burst: pass

## 5) Runtime Backend NFR Evidence (No Playwright)
- Command: `cd app && npm run test:backend-perf --silent`
- Result in this environment: test harness executes and emits measured runtime data.
- Artifact: `submission/test-artifacts/latest-backend-performance.json`
- Latest observed strict payload (`2026-02-21`) includes:
  - `cursorSync`: `avgMs=183.75`, `maxMs=428`, `targetMs=50`, `criticalMs=100`, `targetMet=false`, `score=1`
  - `presence5Users`: `users=5`, `propagationMs=148`, `elapsedMs=592`, `targetMs=600`, `criticalMs=2500`, `targetMet=true`
  - auth source used by harness: `env-email-slot+shared-password:0-ok/4-failed+credential-file:*`
- Added script for anon fallback probing:
  - `cd app && npm run test:backend-perf:anon --silent`
  - In this project, anon creation returns `ADMIN_ONLY_OPERATION`.
- Added strict target-enforcement mode:
  - `cd app && npm run test:backend-perf:strict --silent`
  - Current strict outcome: fails on cursor SLA (`183.75ms` average vs `50ms` target), which remains evidence-backed.

## 6) End-to-End Playwright Evidence and Limitation
- Full gate command: `bash scripts/run-full-gate.sh`
- Full-gate script was hardened on 2026-02-21:
  - dynamic local preview port resolution to avoid `4173` contention.
  - isolated Playwright output directories per run/shard to prevent trace/archive collisions.
- Playwright default config was also hardened on 2026-02-21:
  - `app/playwright.config.ts` now uses run-scoped output/report directories (`test-results/run-<pid>`, `playwright-report/run-<pid>`), with env overrides.
- Current local limitation: when multiple local Playwright sessions run concurrently, browser/OS-level launch stability can still fail with:
  - `bootstrap_check_in ... MachPortRendezvousServer ... Permission denied (1100)`
- Example reproduced on 2026-02-21 with targeted latency suite:
  - `cd app && npx playwright test e2e/performance/ai-response.spec.ts --workers=1 --reporter=line`
  - both tests failed at browser launch stage (no app-level assertion execution).
- Impact:
  - full-suite Playwright pass/fail remains noisy under concurrent local runs.
  - targeted suites can still be executed for deterministic requirement verification.

## 7) FR-22 Board Sharing Verification Status
- Targeted FR-22 suite is verified in this environment.
- Command:
  - `cd app && npx playwright test e2e/requirements-board-sharing.spec.ts --workers=1 --reporter=line`
- Result:
  - `5/5` pass on 2026-02-21.
- Test file:
  - `app/e2e/requirements-board-sharing.spec.ts`

## 8) Recommended Next Evidence Run (Outside This Sandbox Constraint)
1. Run `PLAYWRIGHT_SHARDS=1 PLAYWRIGHT_WORKERS=1 bash scripts/run-full-gate.sh` when no other local Playwright session is active.
2. Capture fresh full-suite Playwright artifact set after the gate-script hardening.
3. Continue cursor-latency optimization work against strict runtime target (`50ms avg`, `100ms max`).
4. Archive resulting artifacts under `submission/test-artifacts/` and refresh `latest-*.json` pointers.
