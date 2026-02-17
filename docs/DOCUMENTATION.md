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

## Testing and Evidence

- `TEST_EVIDENCE.md` - verification notes and evidence summary.
- `app/playwright.config.ts` - E2E test runner configuration.
- `app/e2e/` - end-to-end test cases (UI and API-level concurrency).
  - includes `app/e2e/mvp-regression.spec.ts` for MVP create/drag/undo-redo regression coverage.
- `scripts/run-critical-checks.sh` - authenticated backend critical checks.
- `scripts/run-submission-qa.sh` - submission package QA + link validation.
- `submission/test-artifacts/` - generated test and QA artifacts.

## Session and Ops Traceability

- `Sessions/` - session transcript summaries and curriculum package for Notion export.
- `LINEAR_T027_T039_IMPORT.md` - copy-ready Linear sync payload for post-MVP tickets.

## Architecture and Code Layout

- `app/` - React + Vite + TypeScript client and collaborative UI.
- `functions/` - Firebase Cloud Functions APIs.
- `firebase.json` - Firebase Hosting, Functions, and rewrite rules.
- `firestore.rules` - Firestore access/security rules.
- `database.rules.json` - Realtime Database rules.
- `firestore.indexes.json` - Firestore indexes config.

## Environment and Setup

- `.firebaserc.example` - Firebase project alias template.
- `.gitignore` - ignored files, env files, and local tool state.
- `README.md` - quickstart and local/deploy commands.

## Source Requirement Document

- `G4 Week 1 - CollabBoard-requirements.pdf` - original assignment requirements PDF.
