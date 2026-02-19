# Polish Gap Follow-up (Post FR-22)

Date: 2026-02-18

## Context

After FR-22 access control was closed, the main product gaps from review were:

1. board rename discoverability
2. command palette discoverability
3. hover feedback polish

## Findings

- All three original polish gaps (`T-060`, `T-061`, `T-068`) were completed.
- Share UI was already implemented as part of FR-22 (`T-084`).
- Board duplication and explicit minimap navigation regression coverage (`T-069`, `T-070`) were still pending before this follow-up.

## Actions Taken

- Implemented `T-060`, `T-061`, `T-062`, `T-063`, `T-067`, `T-068`, `T-069`, `T-070`, `T-089`, and `T-090`.
- Added E2E coverage for rename/command palette in `app/e2e/board-polish.spec.ts`.
- Added E2E coverage for board duplicate and minimap navigation in:
  - `app/e2e/board-duplicate.spec.ts`
  - `app/e2e/minimap-navigation.spec.ts`
- Added E2E coverage for template chooser, dark mode, and view/edit lock mode in:
  - `app/e2e/template-chooser.spec.ts`
  - `app/e2e/dark-mode.spec.ts`
  - `app/e2e/view-edit-mode.spec.ts`
- Added scaling E2E coverage for `500/1000` object boards in:
  - `app/e2e/performance/scaling.spec.ts`
- Added static requirement/performance guardrails:
  - `TS-033..TS-040` in `app/test/requirements-g4-feature-coverage.test.mjs`
  - `TS-041..TS-042` in `app/test/requirements-performance-thresholds.test.mjs`
- Updated `TASKS.md`, `DECISIONS.md`, and `DOCUMENTATION.md`.

## Remaining Gaps
- none in the tracked polish/perf subset from this follow-up.
