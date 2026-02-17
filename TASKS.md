# TASKS.md

Date initialized: 2026-02-16
Last updated: 2026-02-17 (shape editing + AI command UI coverage verified)
Cadence: 1-hour deliverables with hard deadlines
Source: `mvp-1-collab-board/G4 Week 1 - CollabBoard-requirements.pdf`

## Priority Lanes
- Lane A: MVP hard gate (must pass first)
- Lane B: AI board agent
- Lane C: Submission artifacts and documentation
- Lane D: Operations (Linear, transcripts, OpenClaw readiness)
- Lane E: Post-MVP differentiators and collaboration depth

## Hourly Execution Plan

| ID | Deadline (CT) | Task | Lane | Owner | Status |
|---|---|---|---|---|---|
| T-001 | 2026-02-16 14:30 | Finalize `PRESEARCH.md` from PDF rubric | C | Max | Done |
| T-002 | 2026-02-16 15:00 | Finalize `PRD.md`, `MVP.md`, `DECISIONS.md` | C | Max | Done |
| T-003 | 2026-02-16 15:30 | Break implementation work into Linear tickets | D | Max | Done |
| T-004 | 2026-02-16 16:30 | Initialize app scaffold (web + backend functions) | A | Max | Done |
| T-005 | 2026-02-16 17:30 | Implement authentication flow | A | Max | Done |
| T-006 | 2026-02-16 18:30 | Implement presence and multiplayer cursors | A | Max | Done |
| T-007 | 2026-02-16 19:30 | Implement object create/move/edit + realtime sync | A | Max | Done |
| T-008 | 2026-02-16 20:30 | Implement infinite pan/zoom + shape support | A | Max | Done |
| T-009 | 2026-02-16 21:30 | Run 2-browser and refresh/disconnect tests | A | Max | Done |
| T-010 | 2026-02-17 09:30 | Deploy MVP public URL + verify hard gate checklist | A | Max | Done |
| T-011 | 2026-02-17 12:00 | Add AI command dispatcher and 3 basic commands | B | Max | Done |
| T-012 | 2026-02-18 12:00 | Expand to 6+ commands including layout + complex | B | Max | Done |
| T-013 | 2026-02-19 18:00 | Add automated tests for core collaboration flows | A | Max | Done |
| T-014 | 2026-02-20 18:00 | Prepare early submission package (video + docs) | C | Max | Done |
| T-015 | 2026-02-22 20:00 | Final polish, cost analysis, social post assets | C | Max | Done |
| T-016 | 2026-02-22 22:00 | Final submission freeze and upload | C | Max | Done |
| T-017 | 2026-02-17 14:00 | Implement and validate `BoardObject` + `CursorPresence` schemas | A | Max | Done |
| T-018 | 2026-02-17 16:00 | Implement LWW/versioned write and optimistic reconcile policy | A | Max | Done |
| T-019 | 2026-02-18 14:00 | Add AI idempotency records and per-board FIFO command ordering | B | Max | Done |
| T-020 | 2026-02-18 17:00 | Enable Firestore offline persistence + RTDB `onDisconnect()` | A | Max | Done |
| T-021 | 2026-02-19 12:00 | Add Playwright multi-context e2e for sync + concurrent AI commands | A | Max | Done |
| T-022 | 2026-02-19 16:00 | Add Konva stage manager optimization for high object count | A | Max | Done |
| T-023 | 2026-02-22 19:00 | Run manual OAuth browser throttle/reconnect demo and capture proof | A | Max | Done |
| T-024 | 2026-02-22 19:30 | Add demo video URL + social post URL to `SUBMISSION_PACKAGE.md` | C | Max | Done |
| T-025 | 2026-02-22 20:30 | Final QA sweep of all submission PDFs and links | C | Max | Done |
| T-026 | 2026-02-17 17:30 | Add OSS build-vs-buy scorecard and post-MVP roadmap to `PRESEARCH.md` | C | Max | Done |
| T-027 | 2026-02-23 12:00 | Run 1-2 day spike: Yjs + Hocuspocus + current object schema mapping | E | Max | Done |
| T-028 | 2026-02-23 18:00 | Implement connectors/arrows with snapping to object anchors | E | Max | Done |
| T-029 | 2026-02-24 14:00 | Implement frames with titled regions and drag-contained objects | E | Max | Done |
| T-030 | 2026-02-24 18:00 | Implement undo/redo command history for create/move/edit/delete | E | Max | Done |
| T-031 | 2026-02-25 14:00 | Add comments and @mentions on board objects | E | Max | Done |
| T-032 | 2026-02-25 18:00 | Add voting mode (dot voting) and facilitation timer | E | Max | Done |
| T-033 | 2026-02-26 14:00 | AI: smart layout analysis command (`organize this board`) | B | Max | Done |
| T-034 | 2026-02-26 18:00 | AI: synthesize sticky notes into grouped themes | B | Max | Done |
| T-035 | 2026-02-27 14:00 | Add screenshot-to-stickies (OCR ingest pipeline) | E | Max | Done |
| T-036 | 2026-02-27 18:00 | Add export to image/PDF (full board and selection) | E | Max | Done |
| T-037 | 2026-02-28 14:00 | Add voice command input (Web Speech API) to AI panel | E | Max | Done |
| T-038 | 2026-02-28 18:00 | Add activity timeline (event replay baseline) | E | Max | Done |
| T-039 | 2026-03-01 14:00 | Add mini-map navigation and keyboard shortcuts reference panel | E | Max | Done |
| T-040 | 2026-02-17 20:00 | Add Yjs pilot mirror scaffold behind env flag (`VITE_SYNC_BACKEND`) | E | Max | Done |
| T-041 | 2026-02-17 21:00 | Optimize laptop-height layout (compact chrome, non-scrolling board shell, tabbed side navigation) | E | Max | Done |
| T-042 | 2026-02-17 21:30 | Refresh Playwright assertions for modern login/header and add laptop viewport fit regression test | A | Max | Done |
| T-043 | 2026-02-17 22:00 | Add explicit icon tooltips and convert AI assistant into open/minimize chat widget | E | Max | Done |
| T-044 | 2026-02-17 22:20 | Fix presence status colors (green online/orange away) from heartbeat + add e2e regression | A | Max | Done |
| T-045 | 2026-02-17 22:45 | Make shapes editable (inline text + shape type switch for rectangle/circle/diamond/triangle) | E | Max | Done |
| T-046 | 2026-02-17 23:00 | Add UI AI-command e2e (chat widget submit -> board object created) | A | Max | Done |

## Current Evidence Snapshot
- Deployed app: `https://mvp-1-collab-board.web.app`
- Playwright run: `19 passed, 0 skipped` (`npm run test:e2e`, 2026-02-17)
- Auth strategy for automation: QA email/password flow via `/login?qaAuth=1`
- MVP regression spec: `1 passed` (`npx playwright test e2e/mvp-regression.spec.ts`, 2026-02-17)
- Critical backend checks: `scripts/run-critical-checks.sh`
- Latest artifact bundle:
  - `submission/test-artifacts/latest-critical-checks.json`
  - `submission/test-artifacts/latest-critical-checks.log`
- Submission QA bundle:
  - `submission/test-artifacts/latest-submission-qa.json`
  - `scripts/run-submission-qa.sh`
- Manual OAuth/reconnect proof:
  - `submission/test-artifacts/manual-oauth-throttle-reconnect-2026-02-17.md`
- Freeze record:
  - `submission/SUBMISSION_FREEZE_2026-02-17.md`
- Architecture spike notes: `docs/YJS_SPIKE.md`
- Yjs pilot scaffold: `app/src/collab/yjs/*` + sync mode pill (`[data-testid=\"sync-mode-pill\"]`)

## Dependency Map
- T-004 blocked T-005, T-006, T-007.
- T-005 blocked T-006 and T-010.
- T-006 and T-007 blocked T-009.
- T-007 blocked T-017 and T-018.
- T-017 blocked T-019 and T-021.
- T-018 blocked T-021.
- T-019 blocked final AI reliability sign-off.
- T-020 blocked reconnect validation.
- T-009, T-020, and T-021 feed hard-gate confidence.
- T-023, T-024, and T-025 closed with hosted artifacts + QA sweep.
- T-027 informs long-term collaboration architecture path.
- T-028 through T-032 block post-MVP collaboration parity milestone.
- T-033 through T-038 block AI-first differentiation milestone.
- T-041 depends on T-039 baseline minimap/toolbar work.
- T-042 validates T-041 and updated login/header UX selectors.
- T-045 extends editable-object parity for non-sticky shapes.
- T-046 validates end-to-end AI command execution through the UI widget.

## Execution Roles
- Max: accountable owner and final decision maker.
- Codex: architecture/docs/review support and implementation assistance.
- Cursor: implementation acceleration and rapid edits.
- Claude: adversarial review and prompt iteration support.

## Linear Integration Status
- Integration confirmed for team `Maxpetrusenko`.
- Existing issues:
  - T-004 -> `MAX-19`
  - T-005 -> `MAX-20`
  - T-006 -> `MAX-21`
  - T-007 -> `MAX-22`
  - T-008 -> `MAX-23`
  - T-009 -> `MAX-24`
  - T-010 -> `MAX-25`
- Latest sync prep:
  - `LINEAR_T027_T039_IMPORT.md` contains copy-ready status updates and ticket payloads for T-027 through T-039.

## Required Artifacts Checklist
- [x] Public deployed URL
- [x] Demo video URL and capture artifact
- [x] Pre-Search checklist completion
- [x] AI Development Log (1 page)
- [x] AI Cost Analysis (dev spend + projections)
- [x] Architecture overview + setup guide in repo
- [x] Test evidence bundle (`TEST_EVIDENCE.md` + artifacts)
- [x] Social post URL and screenshot assets package

## Linear Ticket Skeleton
Use this template for each ticket:
- Title: `[Lane] <Feature/Task>`
- Description:
  - Goal
  - Scope in/out
  - Acceptance criteria
  - Test plan
  - Deadline

## Operations Tasks
- [x] Export session transcripts and keep in `Sessions/`.
- [x] Publish curriculum/transcript package to Notion (package prepared in `Sessions/notion-curriculum-package-2026-02-17.md`).
- [x] Confirm OpenClaw read/push access remains functional.
- [x] Keep `DECISIONS.md` updated whenever architecture changes.
- [x] Create/update Linear issues for T-027 through T-039 (batch update file prepared: `LINEAR_T027_T039_IMPORT.md`).
