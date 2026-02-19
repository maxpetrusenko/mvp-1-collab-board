# Documentation Index

This file is the entry point for all project documents in this repository.

## Deployment

- Production URL: https://mvp-1-collab-board.web.app/b/mvp-demo-board

## Product and Planning

- `PRESEARCH.md` - pre-search research and system exploration.
- `PRD.md` - product requirements and scope.
- `MVP.md` - MVP boundaries and implementation focus.
- `TASKS.md` - active execution checklist and task tracking.
- `DECISIONS.md` - decision log with rationale and tradeoffs.

## Delivery and Demo

- `DEMO_SCRIPT.md` - demo walkthrough script.
- `SUBMISSION_PACKAGE.md` - checklist for final submission package.
- `submission/DEMO_VIDEO.md` - demo media artifact details and URL.
- `submission/SOCIAL_POST_DRAFT.md` - social post draft and asset references.
- `submission/SUBMISSION_FREEZE_2026-02-17.md` - freeze record with integrity/hash manifest.
- `AI_DEVELOPMENT_LOG.md` - required AI workflow and learnings log.
- `AI_COST_ANALYSIS.md` - development cost + scaling projections.
- `ACCESSIBILITY_AUDIT.md` - accessibility evidence checklist and findings.
- `VPAT_DRAFT.md` - VPAT-style conformance draft for submission traceability.

## Testing and Evidence

- `app/playwright.config.ts` - E2E test runner configuration.
- `app/e2e/` - end-to-end test cases (UI and API-level concurrency).
  - includes `app/e2e/mvp-regression.spec.ts` for MVP create/drag/undo-redo regression coverage.
  - includes `app/e2e/requirements-board-sharing.spec.ts` for FR-22 access/share/revoke + read-only/edit role coverage.
  - includes `app/e2e/board-polish.spec.ts` for T-060 board rename and T-061 command palette flows.
  - includes `app/e2e/board-duplicate.spec.ts` for T-069 board duplication metadata/object-copy coverage.
  - includes `app/e2e/minimap-navigation.spec.ts` for T-070 mini-map click-to-navigate regression coverage.
  - includes `app/e2e/template-chooser.spec.ts` for T-062 template chooser insertion coverage.
  - includes `app/e2e/dark-mode.spec.ts` for T-063 persisted theme toggle coverage.
  - includes `app/e2e/view-edit-mode.spec.ts` for T-067 edit-lock drag protection coverage.
  - includes `app/e2e/performance/scaling.spec.ts` for T-090 scaling coverage at 500/1000 objects.
- `scripts/run-critical-checks.sh` - authenticated backend critical checks.
- `scripts/run-submission-qa.sh` - submission package QA + link validation.
- `submission/test-artifacts/` - generated test and QA artifacts.
- `submission/ACCESSIBILITY_AUDIT.pdf` - exported accessibility evidence PDF.
- `submission/VPAT_DRAFT.pdf` - exported VPAT draft PDF.

## Session and Ops Traceability

- `Sessions/` - session transcript summaries and curriculum package for Notion export.
- `LINEAR_T027_T039_IMPORT.md` - copy-ready Linear sync payload for post-MVP tickets.

## Architecture and Code Layout

- `app/` - React + Vite + TypeScript client and collaborative UI.
  - `app/src/pages/BoardEntryPage.tsx` - workspace resolver route (last-accessed board, fallback to recent, auto-create first board).
- `functions/` - Firebase Cloud Functions APIs.
- `functions/scripts/migrate-board-ownership.js` - board ownership + sharing-role backfill script (`--dry-run` default, `--apply` for writes).
- `firebase.json` - Firebase Hosting, Functions, and rewrite rules.
- `firestore.rules` - Firestore access/security rules.
- `database.rules.json` - Realtime Database rules.
- `firestore.indexes.json` - Firestore indexes config.

## Environment and Setup

- `.firebaserc.example` - Firebase project alias template.
- `.gitignore` - ignored files, env files, and local tool state.
- `README.md` - quickstart and local/deploy commands.

## Ownership Migration Runbook (FR-22)

- Dry run board ownership backfill: `cd functions && npm run migrate:board-ownership:dry`
- Apply board ownership backfill: `cd functions && npm run migrate:board-ownership:apply`
- Rollback approach: restore previous board metadata snapshot (Firestore export) and redeploy prior rules if needed.

## Source Requirement Document

- `G4 Week 1 - CollabBoard-requirements.pdf` - original assignment requirements PDF.
- `docs/Requirements.md` - markdown mirror used for requirement audits and implementation checks.
